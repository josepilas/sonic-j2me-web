import {
  APP_STATE_GAME,
  APP_STATE_LOADING_ACT,
  APP_STATE_MAIN_MENU,
  APP_STATE_PAUSE_MENU,
  J2ME_SCREEN_HEIGHT,
  J2ME_SCREEN_WIDTH,
  TILE_SIZE,
} from "../data/constants";
import {
  OBJECT_BREAK_PLATFORM,
  OBJECT_FISH,
  OBJECT_HACHI,
  OBJECT_KAMERE,
  OBJECT_KANI,
  SOURCE_OBJECT_IMAGE_FILES,
  getFrameDataType,
  isBridgeObjectType,
  isBottomAnchoredObjectType,
  isEnemyObjectType as isKnownEnemyObjectType,
  isItemBoxObjectType,
  isSpringObjectType as isKnownSpringObjectType,
} from "../data/objectTypes";
import {
  MAIN_CANVAS_PHYSICS,
  MAIN_CANVAS_TO_CANVAS_SCALE,
  mainCanvasVelocityToRuntime,
  runtimeVelocityToMainCanvas,
} from "../data/sonicjarPhysics";
import { getZoneDefinition } from "../data/zones";
import { wrapIndex } from "../utils/math";
import { Canvas } from "../platform/j2me/Canvas";
import { Font } from "../platform/j2me/Font";
import {
  BOTTOM,
  HCENTER,
  LEFT,
  RIGHT,
  TOP,
  TRANS_MIRROR,
  TRANS_NONE,
  VCENTER,
} from "../platform/j2me/Graphics";
import type { Graphics } from "../platform/j2me/Graphics";
import type { Image } from "../platform/j2me/Image";
import { KEY_DOWN, KEY_FIRE, KEY_LEFT, KEY_PAUSE, KEY_RIGHT, KEY_UP } from "../platform/j2me/KeyCodes";
import type { MIDlet } from "../platform/j2me/MIDlet";
import { ResourceLoader } from "../platform/j2me/ResourceLoader";
import { Audio, AUDIO_TRACKS } from "./Audio";
import { DistantBackground } from "./DistantBackground";
import type { DistantBgTablesPayload } from "./DistantBackground";
import type { LevelObject, LevelTile, ObjectSize } from "./LevelLoader";
import { LevelLoader } from "./LevelLoader";
import type { GameProgress, HighscoreEntry } from "./SaveManager";
import { SaveManager } from "./SaveManager";

interface CollisionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GroundSurface {
  y: number;
  angle: number;
}

interface LevelRing {
  x: number;
  y: number;
  collected: boolean;
}

interface LevelEnemy {
  sourceType: number;
  x: number;
  y: number;
  originX: number;
  width: number;
  height: number;
  alive: boolean;
  type: "moto" | "bee" | "fish" | "kamere" | "kani";
  direction: -1 | 1;
}

interface ActiveLevelObject extends LevelObject {
  active: boolean;
  stateFrame: number;
}

interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  groundSpeed: number;
  animationDistance: number;
  idleTimer: number;
  springLaunchFrames: number;
  width: number;
  height: number;
  facing: -1 | 1;
  grounded: boolean;
  jumping: boolean;
  rolling: boolean;
  crouching: boolean;
  loopAssistFrames: number;
  groundAngle: number;
  hurtTimer: number;
  alive: boolean;
}

const SONIC_GROUND_ACCELERATION = mainCanvasVelocityToRuntime(MAIN_CANVAS_PHYSICS.acceleration);
const SONIC_BRAKE_ACCELERATION = mainCanvasVelocityToRuntime(MAIN_CANVAS_PHYSICS.brakeAcceleration);
const SONIC_GRAVITY = mainCanvasVelocityToRuntime(MAIN_CANVAS_PHYSICS.gravity);
const SONIC_JUMP_SPEED = mainCanvasVelocityToRuntime(MAIN_CANVAS_PHYSICS.jumpSpeed);
const SONIC_SHORT_JUMP_SPEED = mainCanvasVelocityToRuntime(MAIN_CANVAS_PHYSICS.shortJumpSpeed);
const SONIC_SPRING_SPEED = mainCanvasVelocityToRuntime(MAIN_CANVAS_PHYSICS.springSpeed);
const SONIC_ENEMY_BOUNCE_SPEED = mainCanvasVelocityToRuntime(MAIN_CANVAS_PHYSICS.enemyBounceSpeed);
const SONIC_HURT_X_SPEED = mainCanvasVelocityToRuntime(MAIN_CANVAS_PHYSICS.hurtXSpeed);
const SONIC_HURT_Y_SPEED = mainCanvasVelocityToRuntime(MAIN_CANVAS_PHYSICS.hurtYSpeed);
const SONIC_GROUND_TOP_SPEED = mainCanvasVelocityToRuntime(MAIN_CANVAS_PHYSICS.maxSpeed);
const SONIC_AIR_TOP_SPEED = mainCanvasVelocityToRuntime(MAIN_CANVAS_PHYSICS.airTopSpeed);
const SONIC_STOP_EPSILON = 0.015;
const SONIC_SPRING_LAUNCH_FRAMES = 18;
const SONIC_NORMAL_HEIGHT = Math.round(MAIN_CANVAS_PHYSICS.playerHeight * MAIN_CANVAS_TO_CANVAS_SCALE);
const SONIC_ROLL_HEIGHT = Math.round(24 * MAIN_CANVAS_TO_CANVAS_SCALE);
const SONIC_ROLL_MIN_SPEED = SONIC_GROUND_TOP_SPEED * 0.42;
const SONIC_ROLL_FRICTION = SONIC_GROUND_ACCELERATION * 0.42;
const SONIC_LOOP_MIN_SPEED = SONIC_GROUND_TOP_SPEED * 0.68;
const SONIC_MAX_GROUND_SNAP = 18;
const SONIC_LOOP_GROUND_SNAP = 42;
const SONIC_SENSOR_INSET = 4;
const SONIC_LOOP_GATE_BLOCKS = new Set([42, 43, 52, 53, 54]);
const SONIC_JUMP_BUFFER_FRAMES = 6;
const SONIC_GROUNDED_GRACE_FRAMES = 5;
const GREEN_HILL_ACT_SPAWNS = [
  { x: 80, y: 944 + 20 },
  { x: 80, y: 252 + 20 },
  { x: 80, y: 944 + 20 },
];
const TITLE_REGIONS = [
  [0, 0, 142, 81],
  [0, 120, 36, 42],
  [0, 81, 42, 37],
  [80, 141, 39, 27],
  [46, 81, 45, 41],
  [37, 124, 41, 42],
  [95, 82, 26, 42],
  [122, 81, 20, 43],
  [95, 82, 26, 42],
  [101, 125, 19, 15],
  [122, 125, 20, 43],
  [122, 82, 20, 43],
  [0, 168, 142, 42],
] as const;

export class GameCanvas extends Canvas {
  static readonly defaultFont = Font.getFont(Font.FACE_SYSTEM, Font.STYLE_PLAIN, Font.SIZE_LARGE);
  static readonly defaultFontHeight = GameCanvas.defaultFont.getHeight();
  static screenHeight = J2ME_SCREEN_HEIGHT;
  static screenWidth = J2ME_SCREEN_WIDTH;
  static fullGameWidth = J2ME_SCREEN_WIDTH;
  static uiContentHeight = 0;
  static uiContentY = 0;
  static gameWidth = J2ME_SCREEN_WIDTH;
  static gameHeight = J2ME_SCREEN_HEIGHT;
  static gameY = 0;

  public readonly pressedKeys = new Array<boolean>(16).fill(false);
  public readonly repeatedKeys = new Array<boolean>(16).fill(false);
  public readonly commandTexts = ["", ""];
  public appState = APP_STATE_MAIN_MENU;
  public zoneID = 0;
  public actID = 0;
  public frame = 0;
  public renderedFrame = 0;
  public midlet: MIDlet;
  public resume: number;
  public startTime = 0;
  public startFrameTime = 0;
  public gameElapsedTime = 0;
  public appElapsedTime = 0;
  public minFrameDeplay = 0;
  public readonly frameDelays = new Array<number>(8).fill(0);
  public frameDelayIndex = 0;
  public rendering = true;
  public redrawAllGameScreen = true;
  public redrawSonicLogo = false;
  public clearedAct = false;
  public config: Uint8Array<ArrayBufferLike> = new Uint8Array([1, 1, 0, 0]);
  public texts: string[] = [];
  public audio: Audio;
  public lives = 3;
  public score = 0;
  public rings = 0;

  private readonly resources = new ResourceLoader();
  private readonly levelLoader = new LevelLoader();
  private readonly distantBackground = new DistantBackground();
  private readonly saveManager = new SaveManager();
  private titleImage: Image | null = null;
  private logoImage: Image | null = null;
  private ringImage: Image | null = null;
  private cursorImage: Image | null = null;
  private zoneImage: Image | null = null;
  private distantZoneImage: Image | null = null;
  private sonicImage: Image | null = null;
  private enemyImage: Image | null = null;
  private beeImage: Image | null = null;
  private readonly objectImages = new Map<number, Image>();
  private initialized = false;
  private selectedMenuItem = 0;
  private loadingTicks = 0;
  private startupLanguageSelection = false;
  private firstActLoadPromise: Promise<void> | null = null;
  private firstActAssetsLoaded = false;
  private loadingStatus = "READY";
  private loadingError = "";
  private loadingAssetTotal = 10;
  private titleKeyFrame = 0;
  private titleAnimationFrame = 0;
  private jumpBufferFrames = 0;
  private groundedGraceFrames = 0;
  private readonly firstActData = new Map<string, Uint8Array>();
  private highscoreEntries: HighscoreEntry[] = [];
  private tilemap: LevelTile[][] = [];
  private collisionMasks: Uint8Array<ArrayBufferLike> = new Uint8Array();
  private frameData: number[][][] = [];
  private objectSizeTable: ObjectSize[] = [];
  private loadedLevelObjects: LevelObject[] = [];
  private levelObjects: ActiveLevelObject[] = [];
  private collisionRects: CollisionRect[] = [];
  private levelRings: LevelRing[] = [];
  private levelEnemies: LevelEnemy[] = [];
  private player: PlayerState = this.createInitialPlayer();
  private cameraX = 0;
  private cameraY = 0;
  private worldWidth = 1536;
  private worldHeight = J2ME_SCREEN_HEIGHT;
  private actTimerFrames = 0;
  private actCleared = false;
  private actClearFrames = 0;

  constructor(midlet: MIDlet, resume: number) {
    super();
    this.midlet = midlet;
    this.resume = resume;
    this.audio = new Audio();
    this.audio.audioTracks = AUDIO_TRACKS;
    this.setFullScreenMode(true);
  }

  override showNotify(): void {
    this.init();
    this.repaint();
  }

  override paint(g: Graphics): void {
    this.render(g);
    this.renderedFrame += 1;
  }

  override keyPressed(code: number): void {
    this.pressedKeys[code] = true;
  }

  override keyReleased(code: number): void {
    this.pressedKeys[code] = false;
    this.repeatedKeys[code] = false;
  }

  init(): void {
    if (this.initialized) {
      return;
    }

    GameCanvas.screenWidth = this.getWidth();
    GameCanvas.screenHeight = this.getHeight();
    GameCanvas.fullGameWidth = this.getWidth();
    GameCanvas.gameWidth = this.getWidth();
    GameCanvas.gameHeight = this.getHeight();
    GameCanvas.gameY = 0;
    GameCanvas.uiContentY = 0;
    GameCanvas.uiContentHeight = this.getHeight();
    this.commandTexts[0] = "ENTER";
    this.commandTexts[1] = "START";
    this.loadConfig();
    this.loadGameProgress();
    this.loadHighscore();
    void this.loadTexts();
    void this.loadAssets();
    this.appState = APP_STATE_MAIN_MENU;
    this.audio.setOptions(this.config[1]);
    this.initialized = true;
  }

  loadConfig(): void {
    const storedConfig = this.saveManager.loadConfig();
    if (storedConfig) {
      this.config = storedConfig;
      return;
    }

    this.startupLanguageSelection = true;
    this.config = new Uint8Array([1, 1, 0, 0]);
    this.saveConfig();
  }

  saveConfig(): void {
    this.saveManager.saveConfig(this.config);
  }

  loadGameProgress(): void {
    const progress = this.saveManager.loadGameProgress();
    if (!progress) {
      this.saveGameProgress();
      return;
    }

    this.zoneID = progress.zoneID;
    this.actID = progress.actID;
    this.lives = Math.max(1, progress.lives);
    this.score = progress.score;
    this.rings = progress.rings;
  }

  saveGameProgress(): void {
    const progress: GameProgress = {
      zoneID: this.zoneID,
      actID: this.actID,
      lives: this.lives,
      score: this.score,
      rings: this.rings,
    };
    this.saveManager.saveGameProgress(progress);
  }

  loadHighscore(): void {
    this.highscoreEntries = this.saveManager.loadHighscores();
  }

  saveHighscore(): void {
    this.saveManager.saveHighscores(this.highscoreEntries);
  }

  protected addHighscore(name = "YOU"): void {
    this.highscoreEntries = this.saveManager.addHighscore({
      difficulty: this.config[0] ?? 0,
      name,
      score: this.score,
    });
  }

  async loadTexts(): Promise<void> {
    const language = this.config[2] ?? 0;
    try {
      const content = await this.resources.loadText(`lang_${language}.txt`);
      this.texts = content.split(/\r?\n/).map((line) => line.trim());
    } catch {
      this.texts = [];
    }
  }

  async loadMenu(splashscreen = false): Promise<void> {
    if (splashscreen) {
      const [titleImage, logoImage] = await Promise.all([
        this.resources.loadImage("t_license1.png"),
        this.resources.loadImage("t_license2.png"),
      ]);
      this.titleImage = titleImage;
      this.logoImage = logoImage;
      return;
    }

    const [titleImage, logoImage, cursorImage, ringImage] = await Promise.all([
      this.resources.loadImage("t_title.png"),
      this.resources.loadImage("logo.png"),
      this.resources.loadImage("t_cur1.png"),
      this.resources.loadImage("ring.png"),
    ]);

    this.titleImage = titleImage;
    this.logoImage = logoImage;
    this.cursorImage = cursorImage;
    this.ringImage = ringImage;
    this.titleKeyFrame = 0;
    this.titleAnimationFrame = 0;

    if (this.startupLanguageSelection) {
      this.startupLanguageSelection = false;
      return;
    }

    void this.loadTexts();
      void this.audio.preloadTrack(this.zoneID);
    void this.audio.play(9, -1);
  }

  async loadAssets(): Promise<void> {
    try {
      await this.loadMenu();
    } finally {
      this.repaint();
    }
  }

  beginFirstActLoad(): void {
    if (this.firstActLoadPromise) {
      return;
    }

    this.firstActLoadPromise = this.loadFirstActAssets()
      .then(() => {
        this.firstActAssetsLoaded = true;
        this.loadingStatus = "ACT 1 READY";
      })
      .catch((error: unknown) => {
        this.loadingError = error instanceof Error ? error.message : "Unknown asset loading error";
        this.loadingStatus = "LOAD FAILED";
      })
      .finally(() => {
        this.repaint();
      });
  }

  async loadFirstActAssets(): Promise<void> {
    const zone = getZoneDefinition(this.zoneID);
    this.loadingStatus = "LOADING IMAGES";
    const [zoneImage, distantZoneImage, sonicImage, ringImage, enemyImage, beeImage] = await Promise.all([
      this.resources.loadImage(`${zone.assetPrefix}.png`),
      this.resources.loadImage(`distant_${zone.assetPrefix}.png`),
      this.resources.loadImage("sonic.png"),
      this.resources.loadImage("ring.png"),
      this.resources.loadImage("musi.png"),
      this.resources.loadImage("hachi.png"),
    ]);

    this.zoneImage = zoneImage;
    this.distantZoneImage = distantZoneImage;
    this.sonicImage = sonicImage;
    this.ringImage = ringImage;
    this.enemyImage = enemyImage;
    this.beeImage = beeImage;
    await this.loadObjectImages();
    void this.audio.preloadTrack(this.zoneID);

    this.loadingStatus = "LOADING LEVEL DATA";
    const distantBgTables = JSON.parse(
      await this.resources.loadText("/assets/source-j2me/levels/distant-bg-tables.json"),
    ) as DistantBgTablesPayload;
    this.distantBackground.setTables(distantBgTables);

    const levelNames = [
      `${zone.assetPrefix}.bmd`,
      `${zone.assetPrefix}.blt`,
      zone.actFile,
      zone.mapLayerFile,
      zone.mapDataFile,
      "mc_obj_size_table.bin",
      "blkcol.bct",
      "framedata.bin",
      "scddirtbl.blt",
      "scdtblwk.scd",
    ].filter((name): name is string => typeof name === "string");
    this.loadingAssetTotal = levelNames.length;
    const levelData = await Promise.all(levelNames.map((name) => this.levelLoader.loadLevelBinary(name)));
    for (let index = 0; index < levelNames.length; index += 1) {
      this.firstActData.set(levelNames[index], levelData[index]);
    }

    this.loadingStatus = "DECODING LEVEL";
    const [decodedLevel, frameData, objectSizeTable, levelObjects] = await Promise.all([
      this.levelLoader.loadZoneAct(this.zoneID, this.actID),
      this.levelLoader.loadFrameData(),
      this.levelLoader.loadObjectSizeTable(),
      this.levelLoader.loadZoneObjects(this.zoneID, this.actID),
    ]);

    this.tilemap = decodedLevel.tiles;
    this.collisionMasks = decodedLevel.collisionMasks;
    this.frameData = frameData;
    this.objectSizeTable = objectSizeTable;
    this.loadedLevelObjects = levelObjects;
    this.worldWidth = decodedLevel.width;
    this.worldHeight = decodedLevel.height;
    this.rebuildCollisionRects();
  }

  private async loadObjectImages(): Promise<void> {
    const entries = Object.entries(SOURCE_OBJECT_IMAGE_FILES).map(
      ([type, name]) => [Number(type), name] as [number, string],
    );

    const loaded = await Promise.allSettled(
      entries.map(async ([type, name]) => [type, await this.resources.loadImage(name)] as const),
    );

    for (const result of loaded) {
      if (result.status === "fulfilled") {
        this.objectImages.set(result.value[0], result.value[1]);
      }
    }
  }

  update(_delta: number): void {}

  render(g: Graphics): void {
    this.drawScreenBackground(g, 0, 0, this.getWidth(), this.getHeight());
  }

  drawScreenBackground(g: Graphics, x: number, y: number, w: number, h: number): void {
    for (let line = 0; line < h; line += 1) {
      const lineY = line + y;
      if (lineY === 0) {
        g.setColor(0x81cdf2);
      } else if (lineY % 3 === 0) {
        g.setColor(0x1c5acc);
      } else {
        g.setColor(0x2273fb);
      }

      g.fillRect(x, lineY, w, 1);
    }

    if (x === 0) {
      g.setColor(0x2273fb);
      g.fillRect(x, y, 1, h);
    }
  }

  drawSonicLogo(g: Graphics): void {
    if (this.titleImage) {
      this.drawTitle(g, 72);
      return;
    }

    this.drawStringWithBorder(g, "SONIC", this.getWidth() >> 1, 28, HCENTER | TOP, 0xfadf34, 0x003a8c);
  }

  private drawTitle(g: Graphics, centerY: number): void {
    if (!this.titleImage) {
      return;
    }

    const centerX = this.getWidth() >> 1;
    const sonicX = centerX + 10;
    const frame = Math.min(this.titleKeyFrame, 12);

    this.drawTitleRegion(g, 0, centerX, centerY, HCENTER | VCENTER);

    if (frame === 0) {
      const sonicDropY = (10 - Math.min(this.titleAnimationFrame, 10)) * 3;
      this.drawTitleRegion(g, 1, sonicX, centerY + sonicDropY, HCENTER | BOTTOM);
    } else if (frame === 1) {
      this.drawTitleRegion(g, 2, sonicX, centerY, HCENTER | BOTTOM);
    } else if (frame === 2) {
      this.drawTitleRegion(g, 2, sonicX, centerY, HCENTER | BOTTOM);
      this.drawTitleRegion(g, 3, sonicX, centerY, HCENTER | BOTTOM);
    } else if (frame === 3) {
      this.drawTitleRegion(g, 4, sonicX, centerY, HCENTER | BOTTOM);
    } else if (frame === 4) {
      this.drawTitleRegion(g, 5, sonicX, centerY, HCENTER | BOTTOM);
    } else if (frame === 5) {
      this.drawTitleRegion(g, 6, sonicX, centerY, RIGHT | BOTTOM);
      this.drawTitleRegion(g, 7, sonicX, centerY, LEFT | BOTTOM);
    } else {
      this.drawTitleRegion(g, 8, sonicX, centerY, RIGHT | BOTTOM);
      this.drawTitleRegion(g, 9, sonicX, centerY, LEFT | BOTTOM);
      this.drawTitleRegion(g, (this.titleAnimationFrame >> 1 & 1) === 0 ? 10 : 11, sonicX, centerY, LEFT | BOTTOM);
    }

    this.drawTitleRegion(g, 12, centerX, centerY - 1, HCENTER | TOP);
  }

  private drawTitleRegion(g: Graphics, regionIndex: number, x: number, y: number, anchor: number): void {
    if (!this.titleImage) {
      return;
    }

    const [sx, sy, sw, sh] = TITLE_REGIONS[regionIndex];
    this.drawRegion(g, this.titleImage, sx, sy, sw, sh, TRANS_NONE, x, y, anchor);
  }

  drawCommandTexts(g: Graphics): void {
    g.setFont(Font.getFont(Font.FACE_SYSTEM, Font.STYLE_BOLD, Font.SIZE_SMALL));
    this.drawStringWithBorder(g, this.commandTexts[0], 8, this.getHeight() - 16, LEFT | BOTTOM, 0xffffff, 0x000000);
    this.drawStringWithBorder(g, this.commandTexts[1], this.getWidth() - 8, this.getHeight() - 16, RIGHT | BOTTOM, 0xffffff, 0x000000);
    g.setFont(GameCanvas.defaultFont);
  }

  drawTopText(g: Graphics, text: string): void {
    this.drawStringWithBorder(g, text, this.getWidth() >> 1, 4, HCENTER | TOP, 0xffffff, 0x000000);
  }

  drawStringWithBorder(
    g: Graphics,
    text: string,
    x: number,
    y: number,
    anchor: number,
    color: number,
    borderColor: number,
  ): void {
    g.setColor(borderColor);
    g.drawString(text, x - 1, y, anchor);
    g.drawString(text, x + 1, y, anchor);
    g.drawString(text, x, y - 1, anchor);
    g.drawString(text, x, y + 1, anchor);
    g.setColor(color);
    g.drawString(text, x, y, anchor);
  }

  drawRegion(
    g: Graphics,
    image: Image,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    transform: number,
    x: number,
    y: number,
    anchor: number,
  ): void {
    g.drawRegion(image, sx, sy, sw, sh, transform, x, y, anchor);
  }

  renderMainMenu(g: Graphics): void {
    const soundLabel = (this.config[1] & 1) === 1 ? "SOUND ON" : "SOUND OFF";
    const items = ["START GAME", soundLabel, "HIGHSCORE"];
    this.drawScreenBackground(g, 0, 0, this.getWidth(), this.getHeight());
    this.drawSonicLogo(g);
    this.drawTopText(g, "Version 1.0.12 / Build 3805");

    if (!this.titleImage && this.logoImage) {
      g.drawImage(this.logoImage, this.getWidth() >> 1, 98, HCENTER | TOP);
    }

    g.setFont(GameCanvas.defaultFont);
    for (let index = 0; index < items.length; index += 1) {
      const y = 146 + index * 24;
      const selected = index === this.selectedMenuItem;
      const label = selected ? `> ${items[index]} <` : items[index];
      if (selected && this.cursorImage) {
        g.drawImage(this.cursorImage, 42, y, RIGHT | VCENTER);
      }

      this.drawStringWithBorder(
        g,
        label,
        this.getWidth() >> 1,
        y,
        HCENTER | VCENTER,
        selected ? 0xfff45c : 0xffffff,
        0x00336d,
      );
    }

    if (this.ringImage) {
      g.drawImage(this.ringImage, this.getWidth() >> 1, 226, HCENTER | VCENTER);
    }

    if (this.selectedMenuItem === 2) {
      g.setFont(Font.getFont(Font.FACE_SYSTEM, Font.STYLE_PLAIN, Font.SIZE_SMALL));
      for (let index = 0; index < this.highscoreEntries.length; index += 1) {
        const entry = this.highscoreEntries[index];
        const line = `${index + 1} ${entry.name.padEnd(3, " ")} ${entry.score.toString().padStart(6, "0")}`;
        this.drawStringWithBorder(g, line, this.getWidth() >> 1, 238 + index * 13, HCENTER | TOP, 0xffffff, 0x000000);
      }
      g.setFont(GameCanvas.defaultFont);
    }

    this.drawCommandTexts(g);
  }

  updateMainMenu(): void {
    this.updateTitleAnimation();

    if (this.consumeKeyPress(KEY_UP) || this.consumeKeyPress(KEY_LEFT)) {
      this.selectedMenuItem = wrapIndex(this.selectedMenuItem - 1, 3);
    }

    if (this.consumeKeyPress(KEY_DOWN) || this.consumeKeyPress(KEY_RIGHT)) {
      this.selectedMenuItem = wrapIndex(this.selectedMenuItem + 1, 3);
    }

    if (this.consumeKeyPress(KEY_FIRE)) {
      this.startSelectedMenuItem();
    }

    if (this.consumeKeyPress(KEY_PAUSE)) {
      this.selectedMenuItem = 0;
    }
  }

  private updateTitleAnimation(): void {
    if (this.titleKeyFrame < 12) {
      this.titleAnimationFrame += 1;
      if (this.titleAnimationFrame > 10) {
        this.titleKeyFrame += 1;
      }
      return;
    }

    this.titleAnimationFrame = (this.titleAnimationFrame + 1) % 10;
  }

  protected startSelectedMenuItem(): void {
    if (this.selectedMenuItem === 1) {
      this.config[1] = (this.config[1] & 1) === 1 ? 0 : 1;
      this.audio.setOptions(this.config[1]);
      this.saveConfig();
      return;
    }

    if (this.selectedMenuItem === 2) {
      return;
    }

    this.appState = APP_STATE_LOADING_ACT;
    this.loadingTicks = 0;
    this.loadingStatus = "LOADING ACT 1";
    this.loadingError = "";
    this.beginFirstActLoad();
  }

  protected updateLoadingAct(delta: number): void {
    this.beginFirstActLoad();
    this.loadingTicks += Math.max(1, Math.round(delta / 16));
    if (this.loadingError) {
      if (this.consumeKeyPress(KEY_PAUSE)) {
        this.appState = APP_STATE_MAIN_MENU;
      }
      return;
    }

    if (this.firstActAssetsLoaded && this.loadingTicks > 30) {
      this.resetGameplay();
      this.appState = APP_STATE_GAME;
      this.commandTexts[0] = "ESC";
      this.commandTexts[1] = "PAUSE";
      void this.audio.interruptTrackAndPlay(this.zoneID, -1);
      this.saveGameProgress();
    }
  }

  protected updateGameplay(delta: number): void {
    if (this.consumeKeyPress(KEY_PAUSE)) {
      this.appState = APP_STATE_PAUSE_MENU;
      this.commandTexts[0] = "ENTER";
      this.commandTexts[1] = "RESUME";
      return;
    }

    if (!this.player.alive) {
      if (this.consumeKeyPress(KEY_FIRE)) {
        this.respawnPlayer();
      }
      return;
    }

    if (this.actCleared) {
      this.actClearFrames += 1;
      if (this.actClearFrames === 1) {
        this.addHighscore();
        this.saveGameProgress();
      }
      return;
    }

    this.actTimerFrames += Math.max(1, Math.round(delta / 16));
    this.updatePlayer(delta);
    this.updateLevelObjects();
    this.updateEnemies();
    this.collectRings();
    this.collectItemBoxes();
    this.checkEnemyCollisions();
    this.updateCamera();

    if (this.frame % 300 === 0) {
      this.saveGameProgress();
    }

    if (this.player.x > this.worldWidth - 96) {
      this.actCleared = true;
      this.score += 5000;
      void this.audio.interruptTrackAndPlay("stageclear", 1);
      this.saveGameProgress();
    }
  }

  protected updatePauseMenu(): void {
    if (this.consumeKeyPress(KEY_PAUSE) || this.consumeKeyPress(KEY_FIRE)) {
      this.appState = APP_STATE_GAME;
      this.commandTexts[0] = "ESC";
      this.commandTexts[1] = "PAUSE";
    }
  }

  protected renderLoading(g: Graphics): void {
    this.drawScreenBackground(g, 0, 0, this.getWidth(), this.getHeight());
    this.drawSonicLogo(g);
    g.setColor(0x000000);
    g.fillRect(20, 132, this.getWidth() - 40, 68);
    this.drawStringWithBorder(g, this.loadingStatus, this.getWidth() >> 1, 143, HCENTER | TOP, 0xffffff, 0x002b5c);
    const loaded = this.firstActData.size;
    const total = this.loadingAssetTotal;
    this.drawStringWithBorder(g, `ASSETS ${loaded}/${total}`, this.getWidth() >> 1, 165, HCENTER | TOP, 0xfff45c, 0x002b5c);
    if (this.loadingError) {
      this.drawStringWithBorder(g, "ESC TO RETURN", this.getWidth() >> 1, 181, HCENTER | TOP, 0xff7070, 0x000000);
    }
    this.drawCommandTexts(g);
  }

  protected renderGamePlaceholder(g: Graphics): void {
    this.renderGameplay(g);
    this.drawCommandTexts(g);
  }

  protected renderPauseMenu(g: Graphics): void {
    this.renderGameplay(g);
    g.setColor(0x000000);
    g.fillRect(28, 112, this.getWidth() - 56, 70);
    this.drawStringWithBorder(g, "PAUSE", this.getWidth() >> 1, 126, HCENTER | TOP, 0xffffff, 0x000000);
    this.drawStringWithBorder(g, "ENTER / ESC", this.getWidth() >> 1, 150, HCENTER | TOP, 0xfff45c, 0x000000);
    this.drawCommandTexts(g);
  }

  protected renderGameplay(g: Graphics): void {
    if (!this.distantBackground.draw(g, this.zoneID, this.distantZoneImage, this.cameraX, this.cameraY)) {
      this.drawScreenBackground(g, 0, 0, this.getWidth(), this.getHeight());
    }

    this.drawTileLayer(g, false);
    this.drawRings(g);
    this.drawLevelObjects(g);
    this.drawEnemies(g);
    this.drawPlayer(g);
    this.drawTileLayer(g, true);
    this.drawHud(g);

    if (!this.player.alive) {
      this.drawStringWithBorder(g, "TRY AGAIN", this.getWidth() >> 1, 132, HCENTER | TOP, 0xffffff, 0x000000);
      this.drawStringWithBorder(g, "PRESS JUMP", this.getWidth() >> 1, 154, HCENTER | TOP, 0xfff45c, 0x000000);
    }

    if (this.actCleared) {
      this.drawStringWithBorder(g, "ACT CLEAR", this.getWidth() >> 1, 132, HCENTER | TOP, 0xffffff, 0x000000);
      this.drawStringWithBorder(g, `SCORE ${this.score}`, this.getWidth() >> 1, 154, HCENTER | TOP, 0xfff45c, 0x000000);
    }
  }

  private rebuildCollisionRects(): void {
    this.collisionRects = [];
    for (let row = 0; row < this.tilemap.length; row += 1) {
      let runStart = -1;
      for (let column = 0; column <= this.tilemap[row].length; column += 1) {
        const solid = column < this.tilemap[row].length && this.tilemap[row][column].solid;
        if (solid && runStart === -1) {
          runStart = column;
        }

        if ((!solid || column === this.tilemap[row].length) && runStart !== -1) {
          this.collisionRects.push({
            x: runStart * TILE_SIZE,
            y: row * TILE_SIZE,
            width: (column - runStart) * TILE_SIZE,
            height: TILE_SIZE,
          });
          runStart = -1;
        }
      }
    }
  }

  private resetGameplay(): void {
    this.player = this.createInitialPlayer();
    this.jumpBufferFrames = 0;
    this.groundedGraceFrames = SONIC_GROUNDED_GRACE_FRAMES;
    this.cameraX = 0;
    this.cameraY = this.initialCameraY();
    this.rings = 0;
    this.score = Math.max(0, this.score);
    this.actTimerFrames = 0;
    this.actCleared = false;
    this.actClearFrames = 0;
    this.levelObjects = this.loadedLevelObjects
      .filter((object) => object.type !== 255)
      .map((object) => ({
        ...object,
        x: this.toCanvasCoordinate(object.x),
        y: this.toCanvasCoordinate(object.y),
        active: true,
        stateFrame: 0,
      }));
    this.levelRings = this.levelObjects
      .filter((object) => object.ring)
      .map((object) => ({ x: object.x, y: object.y, collected: false }));
    this.levelEnemies = this.levelObjects
      .filter((object) => this.isEnemyObjectType(object.type))
      .map((object) => this.createEnemyFromObject(object));
  }

  private createInitialPlayer(): PlayerState {
    const width = 20;
    const height = SONIC_NORMAL_HEIGHT;
    const spawn = GREEN_HILL_ACT_SPAWNS[this.actID] ?? GREEN_HILL_ACT_SPAWNS[0];
    const x = this.toCanvasCoordinate(spawn.x) - Math.floor(width / 2);
    const y = this.toCanvasCoordinate(spawn.y) - height;
    return {
      x,
      y,
      vx: 0,
      vy: 0,
      groundSpeed: 0,
      animationDistance: 0,
      idleTimer: 0,
      springLaunchFrames: 0,
      width,
      height,
      facing: 1,
      grounded: true,
      jumping: false,
      rolling: false,
      crouching: false,
      loopAssistFrames: 0,
      groundAngle: 0,
      hurtTimer: 0,
      alive: true,
    };
  }

  private respawnPlayer(): void {
    this.lives = Math.max(0, this.lives - 1);
    this.rings = 0;
    this.player = this.createInitialPlayer();
    this.jumpBufferFrames = 0;
    this.groundedGraceFrames = SONIC_GROUNDED_GRACE_FRAMES;
    this.saveGameProgress();
  }

  private updatePlayer(_delta: number): void {
    const wasGrounded = this.player.grounded;
    const leftPressed = this.pressedKeys[KEY_LEFT] === true;
    const rightPressed = this.pressedKeys[KEY_RIGHT] === true;
    const downPressed = this.pressedKeys[KEY_DOWN] === true;
    if (this.consumeKeyPress(KEY_FIRE)) {
      this.jumpBufferFrames = SONIC_JUMP_BUFFER_FRAMES;
    } else if (this.jumpBufferFrames > 0) {
      this.jumpBufferFrames -= 1;
    }

    if (!this.player.grounded && !this.player.jumping && this.player.vy >= 0) {
      this.snapPlayerToGround(SONIC_MAX_GROUND_SNAP);
    }

    if (this.player.grounded) {
      this.groundedGraceFrames = SONIC_GROUNDED_GRACE_FRAMES;
    }

    if (this.jumpBufferFrames > 0 && (this.player.grounded || this.groundedGraceFrames > 0)) {
      this.performPlayerJump();
    }

    if (this.player.springLaunchFrames > 0) {
      this.player.springLaunchFrames -= 1;
    }

    if (this.player.loopAssistFrames > 0) {
      this.player.loopAssistFrames -= 1;
    }

    if (this.player.grounded) {
      if (downPressed && !this.player.rolling && Math.abs(this.player.groundSpeed) >= SONIC_ROLL_MIN_SPEED) {
        this.setPlayerRolling(true);
      }

      this.player.crouching = downPressed
        && !this.player.rolling
        && Math.abs(this.player.groundSpeed) < SONIC_ROLL_MIN_SPEED;

      if (this.player.rolling) {
        this.player.groundSpeed = this.approach(this.player.groundSpeed, 0, SONIC_ROLL_FRICTION);
        if (Math.abs(this.player.groundSpeed) <= SONIC_ROLL_MIN_SPEED * 0.28 && !downPressed) {
          this.setPlayerRolling(false);
        }
      } else if (this.player.crouching) {
        this.player.groundSpeed = this.approach(this.player.groundSpeed, 0, SONIC_BRAKE_ACCELERATION);
      } else if (leftPressed && !rightPressed) {
        this.player.facing = -1;
        this.player.groundSpeed = this.player.groundSpeed > 0
          ? this.approach(this.player.groundSpeed, 0, SONIC_BRAKE_ACCELERATION)
          : this.player.groundSpeed - SONIC_GROUND_ACCELERATION * (Math.abs(this.player.groundSpeed) <= SONIC_STOP_EPSILON ? 2 : 1);
      } else if (rightPressed && !leftPressed) {
        this.player.facing = 1;
        this.player.groundSpeed = this.player.groundSpeed < 0
          ? this.approach(this.player.groundSpeed, 0, SONIC_BRAKE_ACCELERATION)
          : this.player.groundSpeed + SONIC_GROUND_ACCELERATION * (Math.abs(this.player.groundSpeed) <= SONIC_STOP_EPSILON ? 2 : 1);
      } else {
        this.player.groundSpeed = this.approach(this.player.groundSpeed, 0, SONIC_GROUND_ACCELERATION);
      }

      this.player.groundSpeed = Math.max(-SONIC_GROUND_TOP_SPEED, Math.min(SONIC_GROUND_TOP_SPEED, this.player.groundSpeed));
      this.applyGroundVelocity();
    } else {
      this.player.crouching = false;
      if (leftPressed && !rightPressed) {
        this.player.facing = -1;
        this.player.vx = Math.abs(this.player.vx) <= SONIC_STOP_EPSILON
          ? -(SONIC_BRAKE_ACCELERATION * 2)
          : this.player.vx - SONIC_GROUND_ACCELERATION;
        if (this.player.vx > 0) {
          this.player.vx -= SONIC_GROUND_ACCELERATION;
        }
      } else if (rightPressed && !leftPressed) {
        this.player.facing = 1;
        this.player.vx = Math.abs(this.player.vx) <= SONIC_STOP_EPSILON
          ? SONIC_BRAKE_ACCELERATION * 2
          : this.player.vx + SONIC_GROUND_ACCELERATION;
        if (this.player.vx < 0) {
          this.player.vx += SONIC_GROUND_ACCELERATION;
        }
      }

      if (
        this.player.springLaunchFrames <= 0
        && !this.pressedKeys[KEY_FIRE]
        && this.player.vy < -SONIC_SHORT_JUMP_SPEED
      ) {
        this.player.vy = -SONIC_SHORT_JUMP_SPEED;
      }

      this.player.vx = Math.max(-SONIC_AIR_TOP_SPEED, Math.min(SONIC_AIR_TOP_SPEED, this.player.vx));
      this.player.vy += SONIC_GRAVITY;
    }

    this.player.x += this.player.vx;
    this.resolveHorizontalCollisions();
    const previousY = this.player.y;
    this.player.y += this.player.vy;
    this.resolveVerticalCollisions();
    if (this.player.grounded) {
      this.alignPlayerToGroundSurface(this.getGroundSnapDistance());
    }
    if (wasGrounded && !this.player.grounded && !this.player.jumping && this.player.vy >= 0) {
      this.snapPlayerToGround(this.getGroundSnapDistance());
    }
    this.maintainLoopContact(wasGrounded);
    this.resolveLevelObjectCollisions(previousY);
    this.updatePlayerAnimation(1);

    this.player.x = Math.max(0, Math.min(this.worldWidth - this.player.width, this.player.x));
    if (this.player.y > this.worldHeight + 40) {
      this.killPlayer();
    }

    if (this.player.hurtTimer > 0) {
      this.player.hurtTimer -= 1;
    }

    if (this.player.grounded) {
      this.groundedGraceFrames = SONIC_GROUNDED_GRACE_FRAMES;
    } else if (this.groundedGraceFrames > 0) {
      this.groundedGraceFrames -= 1;
    }
  }

  private performPlayerJump(): void {
    this.player.vx += -Math.sin(this.player.groundAngle) * SONIC_JUMP_SPEED * 0.35;
    this.player.vy = -Math.cos(this.player.groundAngle) * SONIC_JUMP_SPEED;
    this.player.grounded = false;
    this.player.jumping = true;
    this.player.crouching = false;
    this.player.springLaunchFrames = 0;
    this.jumpBufferFrames = 0;
    this.groundedGraceFrames = 0;
  }

  private resolveHorizontalCollisions(): void {
    if (Math.abs(this.player.vx) <= SONIC_STOP_EPSILON) {
      return;
    }

    const direction = this.player.vx > 0 ? 1 : -1;
    const sideX = () => direction > 0 ? this.player.x + this.player.width : this.player.x;
    const probeYs = () => [
      this.player.y + this.player.height - 8,
      this.player.y + this.player.height - 20,
    ];

    if (!probeYs().some((y) => this.isWorldSolidAt(sideX(), y, "wall"))) {
      return;
    }

    if (this.player.grounded && this.tryLoopStepUp(direction, probeYs, TILE_SIZE + 4)) {
      return;
    }

    if (this.canUseLoopMomentum() && this.tryLoopStepUp(direction, probeYs, 42)) {
      return;
    }

    for (let correction = 0; correction < TILE_SIZE * 2; correction += 1) {
      this.player.x -= direction;
      if (!probeYs().some((y) => this.isWorldSolidAt(sideX(), y, "wall"))) {
        break;
      }
    }

    this.player.vx = 0;
    this.player.groundSpeed = 0;
  }

  private resolveVerticalCollisions(): void {
    this.player.grounded = false;

    if (this.player.vy >= 0) {
      if (!this.isPlayerFootSolid(0)) {
        if (this.isPlayerFootSolid(1)) {
          this.player.grounded = true;
          this.player.jumping = false;
          this.player.groundSpeed = this.player.vx;
          this.player.vy = 0;
        }
        return;
      }

      for (let correction = 0; correction < TILE_SIZE * 2; correction += 1) {
        this.player.y -= 1;
        if (!this.isPlayerFootSolid(0)) {
          break;
        }
      }

      this.player.grounded = true;
      this.player.jumping = false;
      this.player.groundSpeed = this.player.vx;
      this.player.vy = 0;
      return;
    }

    if (this.player.springLaunchFrames > 0) {
      return;
    }

    const headY = () => this.player.y;
    const probeXs = () => [
      this.player.x + 4,
      this.player.x + this.player.width - 4,
    ];

    if (!probeXs().some((x) => this.isWorldSolidAt(x, headY(), "ceiling"))) {
      return;
    }

    if (this.canUseLoopMomentum()) {
      this.player.loopAssistFrames = Math.max(this.player.loopAssistFrames, 14);
      this.player.grounded = true;
      this.player.jumping = false;
      this.player.vy = 0;
      return;
    }

    for (let correction = 0; correction < TILE_SIZE * 2; correction += 1) {
      this.player.y += 1;
      if (!probeXs().some((x) => this.isWorldSolidAt(x, headY(), "ceiling"))) {
        break;
      }
    }

    this.player.vy = 0;
  }

  private snapPlayerToGround(maxDistance = 8): boolean {
    if (this.alignPlayerToGroundSurface(maxDistance)) {
      this.player.groundSpeed = this.player.vx / Math.max(0.2, Math.cos(this.player.groundAngle));
      this.player.vy = 0;
      return true;
    }

    let moved = 0;
    while (moved < maxDistance) {
      this.player.y += 1;
      moved += 1;
      if (this.isPlayerFootSolid(1)) {
        this.player.grounded = true;
        this.player.jumping = false;
        this.player.groundSpeed = this.player.vx;
        this.player.groundAngle = 0;
        this.player.vy = 0;
        return true;
      }
    }

    this.player.y -= moved;
    return false;
  }

  private isPlayerFootSolid(offsetY: number): boolean {
    const footY = this.player.y + this.player.height + offsetY;
    return [
      this.player.x + 4,
      this.player.x + Math.floor(this.player.width / 2),
      this.player.x + this.player.width - 4,
    ].some((x) => this.isWorldSolidAt(x, footY, "floor"));
  }

  private applyGroundVelocity(): void {
    this.player.vx = Math.cos(this.player.groundAngle) * this.player.groundSpeed;
    this.player.vy = Math.sin(this.player.groundAngle) * this.player.groundSpeed;
  }

  private alignPlayerToGroundSurface(maxDistance: number): boolean {
    const surface = this.sampleGroundSurface(maxDistance);
    if (!surface) {
      return false;
    }

    this.player.y = surface.y - this.player.height;
    this.player.groundAngle = surface.angle;
    this.player.grounded = true;
    this.player.jumping = false;
    this.player.vy = 0;
    return true;
  }

  private sampleGroundSurface(maxDistance: number): GroundSurface | null {
    const footY = this.player.y + this.player.height;
    const leftX = this.player.x + SONIC_SENSOR_INSET;
    const centerX = this.player.x + Math.floor(this.player.width / 2);
    const rightX = this.player.x + this.player.width - SONIC_SENSOR_INSET;
    const leftY = this.findFloorSurfaceY(leftX, footY, maxDistance, 10);
    const centerY = this.findFloorSurfaceY(centerX, footY, maxDistance, 10);
    const rightY = this.findFloorSurfaceY(rightX, footY, maxDistance, 10);
    const candidates = [leftY, centerY, rightY].filter((value): value is number => value !== null);
    if (candidates.length === 0) {
      return null;
    }

    const y = Math.round(candidates.reduce((sum, value) => sum + value, 0) / candidates.length);
    const slopeLeft = leftY ?? centerY ?? y;
    const slopeRight = rightY ?? centerY ?? y;
    const angle = Math.atan2(slopeRight - slopeLeft, rightX - leftX);
    return { y, angle: Math.max(-1.05, Math.min(1.05, angle)) };
  }

  private findFloorSurfaceY(x: number, footY: number, maxDown: number, maxUp: number): number | null {
    for (let offset = -maxUp; offset <= maxDown; offset += 1) {
      const probeY = Math.floor(footY + offset);
      if (!this.isWorldSolidAt(x, probeY, "floor")) {
        continue;
      }

      let surfaceY = probeY;
      while (surfaceY > probeY - TILE_SIZE * 3 && this.isWorldSolidAt(x, surfaceY - 1, "floor")) {
        surfaceY -= 1;
      }

      return surfaceY;
    }

    return null;
  }

  private setPlayerRolling(rolling: boolean): boolean {
    if (this.player.rolling === rolling) {
      return true;
    }

    const previousBottom = this.player.y + this.player.height;
    if (!rolling && !this.canStandAt(previousBottom - SONIC_NORMAL_HEIGHT)) {
      return false;
    }

    this.player.rolling = rolling;
    this.player.crouching = false;
    this.player.height = rolling ? SONIC_ROLL_HEIGHT : SONIC_NORMAL_HEIGHT;
    this.player.y = previousBottom - this.player.height;
    if (rolling) {
      this.player.loopAssistFrames = Math.max(this.player.loopAssistFrames, 12);
    }

    return true;
  }

  private canStandAt(candidateY: number): boolean {
    const headY = candidateY + 2;
    return ![
      this.player.x + SONIC_SENSOR_INSET,
      this.player.x + Math.floor(this.player.width / 2),
      this.player.x + this.player.width - SONIC_SENSOR_INSET,
    ].some((x) => this.isWorldSolidAt(x, headY, "ceiling"));
  }

  private canUseLoopMomentum(): boolean {
    return (
      this.player.rolling
      || this.player.loopAssistFrames > 0
      || Math.abs(this.player.groundSpeed || this.player.vx) >= SONIC_LOOP_MIN_SPEED
    );
  }

  private getGroundSnapDistance(): number {
    if (this.canUseLoopMomentum()) {
      return SONIC_LOOP_GROUND_SNAP;
    }

    return SONIC_MAX_GROUND_SNAP;
  }

  private tryLoopStepUp(direction: -1 | 1, probeYs: () => number[], maxLift: number): boolean {
    const originalY = this.player.y;
    const sideX = () => direction > 0 ? this.player.x + this.player.width : this.player.x;

    for (let lift = 1; lift <= maxLift; lift += 1) {
      this.player.y = originalY - lift;
      if (!probeYs().some((y) => this.isWorldSolidAt(sideX(), y, "wall"))) {
        this.player.loopAssistFrames = Math.max(this.player.loopAssistFrames, 22);
        this.player.grounded = true;
        this.player.jumping = false;
        this.player.vy = 0;
        return true;
      }
    }

    this.player.y = originalY;
    return false;
  }

  private maintainLoopContact(wasGrounded: boolean): void {
    if (!this.canUseLoopMomentum()) {
      return;
    }

    if (this.player.grounded) {
      this.player.loopAssistFrames = Math.max(this.player.loopAssistFrames, 8);
      return;
    }

    if (wasGrounded || this.player.loopAssistFrames > 0) {
      if (this.snapPlayerToGround(this.getGroundSnapDistance())) {
        this.player.loopAssistFrames = Math.max(this.player.loopAssistFrames, 10);
        return;
      }

      if (this.attachPlayerToLoopCeiling(22)) {
        this.player.loopAssistFrames = Math.max(this.player.loopAssistFrames, 10);
      }
    }
  }

  private attachPlayerToLoopCeiling(maxDistance: number): boolean {
    const probeXs = [
      this.player.x + 4,
      this.player.x + Math.floor(this.player.width / 2),
      this.player.x + this.player.width - 4,
    ];

    for (let distance = 0; distance <= maxDistance; distance += 1) {
      const probeY = this.player.y - distance;
      if (!probeXs.some((x) => this.isWorldSolidAt(x, probeY))) {
        continue;
      }

      while (probeXs.some((x) => this.isWorldSolidAt(x, this.player.y))) {
        this.player.y += 1;
      }

      this.player.grounded = true;
      this.player.jumping = false;
      this.player.vy = 0;
      return true;
    }

    return false;
  }

  private resolveLevelObjectCollisions(previousY: number): void {
    if (this.resolveSpringCollisions(previousY)) {
      return;
    }

    this.resolvePlatformObjectCollisions(previousY);
  }

  private resolveSpringCollisions(previousY: number): boolean {
    if (this.player.springLaunchFrames > 0) {
      return false;
    }

    const playerRect = this.getPlayerRect();
    const previousBottom = previousY + this.player.height;
    for (const object of this.levelObjects) {
      if (!object.active || !this.isSpringObjectType(object.type)) {
        continue;
      }

      const springRect = this.getSpringRect(object);
      if (!this.intersects(playerRect, springRect)) {
        continue;
      }

      if (previousBottom > springRect.y + 8 && this.player.vy >= 0) {
        continue;
      }

      this.player.y = springRect.y - this.player.height;
      this.player.vy = -SONIC_SPRING_SPEED;
      this.player.grounded = false;
      this.player.jumping = true;
      this.player.groundSpeed = this.player.vx;
      this.player.springLaunchFrames = SONIC_SPRING_LAUNCH_FRAMES;
      this.jumpBufferFrames = 0;
      this.groundedGraceFrames = 0;
      object.stateFrame = 14;
      return true;
    }

    return false;
  }

  private resolvePlatformObjectCollisions(previousY: number): void {
    if (this.player.vy < 0) {
      return;
    }

    const previousBottom = previousY + this.player.height;
    const playerRect = this.getPlayerRect();
    for (const object of this.levelObjects) {
      const rect = this.getObjectPlatformRect(object);
      if (!rect || previousBottom > rect.y + 4 || !this.intersects(playerRect, rect)) {
        continue;
      }

      this.player.y = rect.y - this.player.height;
      this.player.vy = 0;
      this.player.grounded = true;
      this.player.jumping = false;
      this.player.groundSpeed = this.player.vx;
      return;
    }
  }

  private updateLevelObjects(): void {
    for (const object of this.levelObjects) {
      if (object.stateFrame > 0) {
        object.stateFrame -= 1;
      }
    }
  }

  private updateEnemies(): void {
    for (const enemy of this.levelEnemies) {
      if (!enemy.alive) {
        continue;
      }

      enemy.x += enemy.direction * 0.35;
      if (Math.abs(enemy.x - enemy.originX) > 36) {
        enemy.direction *= -1;
      }
    }
  }

  private collectRings(): void {
    const playerRect = this.getPlayerRect();
    for (const ring of this.levelRings) {
      if (ring.collected || !this.intersects(playerRect, { x: ring.x - 6, y: ring.y - 6, width: 12, height: 12 })) {
        continue;
      }

      ring.collected = true;
      this.rings += 1;
      this.score += 100;
      this.saveGameProgress();
    }
  }

  private collectItemBoxes(): void {
    const playerRect = this.getPlayerRect();
    for (const object of this.levelObjects) {
      if (!object.active || !isItemBoxObjectType(object.type)) {
        continue;
      }

      if (!this.intersects(playerRect, this.getItemBoxRect(object))) {
        continue;
      }

      object.active = false;
      this.applyItemBoxReward(object.count);
      this.score += 100;
      this.saveGameProgress();
    }
  }

  private applyItemBoxReward(kind: number): void {
    switch (kind) {
      case 2:
        this.lives += 1;
        break;
      case 6:
        this.rings += 10;
        break;
      default:
        this.score += 500;
        break;
    }
  }

  private checkEnemyCollisions(): void {
    const playerRect = this.getPlayerRect();
    for (const enemy of this.levelEnemies) {
      if (!enemy.alive || !this.intersects(playerRect, enemy)) {
        continue;
      }

      if (this.player.rolling && Math.abs(this.player.groundSpeed || this.player.vx) > SONIC_ROLL_MIN_SPEED * 0.35) {
        enemy.alive = false;
        this.player.groundSpeed *= 0.86;
        this.score += 500;
      } else if (this.player.vy > 0 && this.player.y + this.player.height - enemy.y < 14) {
        enemy.alive = false;
        this.player.vy = this.player.vy > SONIC_ENEMY_BOUNCE_SPEED
          ? -SONIC_ENEMY_BOUNCE_SPEED
          : -Math.max(Math.abs(this.player.vy), SONIC_JUMP_SPEED);
        this.jumpBufferFrames = 0;
        this.groundedGraceFrames = 0;
        this.score += 500;
      } else {
        this.damagePlayer();
      }
    }
  }

  private damagePlayer(): void {
    if (this.player.hurtTimer > 0) {
      return;
    }

    if (this.rings > 0) {
      this.rings = 0;
      this.player.hurtTimer = 90;
      this.player.vx = -this.player.facing * SONIC_HURT_X_SPEED;
      this.player.vy = -SONIC_HURT_Y_SPEED;
      this.player.jumping = true;
      this.player.grounded = false;
      this.jumpBufferFrames = 0;
      this.groundedGraceFrames = 0;
      this.setPlayerRolling(false);
      this.saveGameProgress();
      return;
    }

    this.killPlayer();
  }

  private killPlayer(): void {
    this.player.alive = false;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.groundSpeed = 0;
    this.player.jumping = false;
    this.setPlayerRolling(false);
    this.saveGameProgress();
  }

  private updateCamera(): void {
    const targetX = this.player.x - (this.getWidth() >> 1) + 42;
    this.cameraX += (targetX - this.cameraX) * 0.18;
    this.cameraX = Math.max(0, Math.min(this.worldWidth - this.getWidth(), this.cameraX));
    const targetY = this.player.y - (this.getHeight() - 92);
    this.cameraY += (targetY - this.cameraY) * 0.18;
    this.cameraY = Math.max(0, Math.min(this.worldHeight - this.getHeight(), this.cameraY));
  }

  private drawTileLayer(g: Graphics, priority: boolean | null): void {
    const startColumn = Math.max(0, Math.floor(this.cameraX / TILE_SIZE) - 1);
    const endColumn = Math.min(this.tilemap[0]?.length ?? 0, startColumn + Math.ceil(this.getWidth() / TILE_SIZE) + 3);
    const offsetX = Math.floor(this.cameraX);
    const startRow = Math.max(0, Math.floor(this.cameraY / TILE_SIZE) - 1);
    const endRow = Math.min(this.tilemap.length, startRow + Math.ceil(this.getHeight() / TILE_SIZE) + 3);
    const offsetY = Math.floor(this.cameraY);

    for (let row = startRow; row < endRow; row += 1) {
      for (let column = startColumn; column < endColumn; column += 1) {
        const tile = this.tilemap[row][column];
        if (tile.tileId === 0 || (priority !== null && tile.priority !== priority)) {
          continue;
        }

        this.drawTile(g, tile, column * TILE_SIZE - offsetX, row * TILE_SIZE - offsetY);
      }
    }
  }

  private drawTile(g: Graphics, tile: LevelTile, x: number, y: number): void {
    if (!this.zoneImage) {
      g.setColor(tile.solid ? 0x44b638 : 0x8b5a2b);
      g.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      return;
    }

    this.drawRegion(
      g,
      this.zoneImage,
      (tile.tileId & 15) * TILE_SIZE,
      (tile.tileId >> 4) * TILE_SIZE,
      TILE_SIZE,
      TILE_SIZE,
      tile.transform,
      x,
      y,
      TOP | LEFT,
    );
  }

  private drawRings(g: Graphics): void {
    const cameraX = Math.floor(this.cameraX);
    const cameraY = Math.floor(this.cameraY);
    for (const ring of this.levelRings) {
      if (ring.collected) {
        continue;
      }

      const x = Math.round(ring.x - cameraX);
      const y = Math.round(ring.y - cameraY);
      if (x < -16 || x > this.getWidth() + 16) {
        continue;
      }

      if (this.ringImage) {
        const frame = Math.floor(this.frame / 8) % 4;
        this.drawRegion(g, this.ringImage, 0, frame * 12, 12, 12, 0, x, y, HCENTER | VCENTER);
      } else {
        g.setColor(0xf8d820);
        g.fillRect(x - 3, y - 3, 6, 6);
      }
    }
  }

  private drawLevelObjects(g: Graphics): void {
    const cameraX = Math.floor(this.cameraX);
    const cameraY = Math.floor(this.cameraY);

    for (const object of this.levelObjects) {
      if (!object.active || object.ring || this.isEnemyObjectType(object.type)) {
        continue;
      }

      const image = this.objectImages.get(object.type);
      if (!image) {
        continue;
      }

      if (isBridgeObjectType(object.type)) {
        this.drawBridgeObject(g, image, object, cameraX, cameraY);
        continue;
      }

      if (isItemBoxObjectType(object.type)) {
        this.drawItemBoxObject(g, image, object, cameraX, cameraY);
        continue;
      }

      const x = Math.round(object.x - cameraX);
      const y = Math.round(object.y - cameraY);
      if (x < -64 || x > this.getWidth() + 64 || y < -80 || y > this.getHeight() + 80) {
        continue;
      }

      this.drawObjectSprite(
        g,
        image,
        object.type,
        x,
        y,
        (object.param & 1) === 1 ? TRANS_MIRROR : TRANS_NONE,
        this.getObjectAnchor(object.type),
        this.getLevelObjectFrameIndex(object),
      );
    }
  }

  private drawBridgeObject(
    g: Graphics,
    image: Image,
    object: ActiveLevelObject,
    cameraX: number,
    cameraY: number,
  ): void {
    const size = this.getObjectRuntimeSize(object.type, {
      width: Math.max(TILE_SIZE, object.count * TILE_SIZE),
      height: TILE_SIZE,
    });
    const segments = Math.max(1, Math.round(size.width / TILE_SIZE));
    const width = segments * TILE_SIZE;
    const verticalStrip = image.getWidth() <= TILE_SIZE && image.getHeight() > TILE_SIZE * 4;
    const segmentHeight = verticalStrip ? Math.max(1, Math.floor(image.getHeight() / 14)) : Math.min(TILE_SIZE, image.getHeight());
    const left = Math.round(object.x - width / 2 - cameraX);
    const top = Math.round(object.y - segmentHeight / 2 - cameraY);
    if (left < -width - 24 || left > this.getWidth() + 24 || top < -24 || top > this.getHeight() + 24) {
      return;
    }

    for (let index = 0; index < segments; index += 1) {
      const sourceColumns = Math.max(1, Math.floor(image.getWidth() / TILE_SIZE));
      const sx = verticalStrip ? 0 : (index % sourceColumns) * TILE_SIZE;
      const sy = 0;
      const sw = Math.min(TILE_SIZE, image.getWidth() - sx);
      this.drawRegion(g, image, sx, sy, sw, segmentHeight, TRANS_NONE, left + index * TILE_SIZE, top, LEFT | TOP);
    }
  }

  private drawItemBoxObject(
    g: Graphics,
    image: Image,
    object: ActiveLevelObject,
    cameraX: number,
    cameraY: number,
  ): void {
    const x = Math.round(object.x - cameraX);
    const y = Math.round(object.y - cameraY);
    if (x < -32 || x > this.getWidth() + 32 || y < -32 || y > this.getHeight() + 32) {
      return;
    }

    const frameHeight = Math.min(image.getWidth(), 24);
    const frames = Math.max(1, Math.floor(image.getHeight() / frameHeight));
    const frame = Math.max(0, Math.min(frames - 1, object.count));
    this.drawRegion(
      g,
      image,
      0,
      frame * frameHeight,
      image.getWidth(),
      frameHeight,
      TRANS_NONE,
      x,
      y,
      HCENTER | VCENTER,
    );
  }

  private drawEnemies(g: Graphics): void {
    const cameraX = Math.floor(this.cameraX);
    const cameraY = Math.floor(this.cameraY);

    for (const enemy of this.levelEnemies) {
      if (!enemy.alive) {
        continue;
      }

      const x = Math.round(enemy.x - cameraX);
      const y = Math.round(enemy.y - cameraY);
      if (x < -40 || x > this.getWidth() + 40) {
        continue;
      }

      const image = this.objectImages.get(enemy.sourceType) ?? (enemy.type === "bee" ? this.beeImage : this.enemyImage);
      if (image) {
        this.drawObjectSprite(
          g,
          image,
          enemy.sourceType,
          x + Math.floor(enemy.width / 2),
          y + Math.floor(enemy.height / 2),
          enemy.direction === -1 ? TRANS_MIRROR : TRANS_NONE,
          HCENTER | VCENTER,
          undefined,
        );
      } else {
        g.setColor(0xe34a2f);
        g.fillRect(x, y, enemy.width, enemy.height);
      }
    }
  }

  private drawObjectSprite(
    g: Graphics,
    image: Image,
    type: number,
    x: number,
    y: number,
    transform: number,
    anchor: number,
    frameIndex?: number,
  ): void {
    const frames = this.frameData[getFrameDataType(type)] ?? [];
    if (frames.length > 0) {
      const frame = frames[frameIndex ?? Math.floor(this.frame / 8) % frames.length] ?? frames[0];
      if (frame) {
        this.drawRegion(
          g,
          image,
          frame[0] ?? 0,
          frame[1] ?? 0,
          frame[2] ?? image.getWidth(),
          frame[3] ?? image.getHeight(),
          transform,
          x,
          y + (frame[4] ?? 0),
          anchor,
        );
      }
      return;
    }

    this.drawRegion(g, image, 0, 0, image.getWidth(), image.getHeight(), transform, x, y, anchor);
  }

  private drawPlayer(g: Graphics): void {
    const x = Math.round(this.player.x - Math.floor(this.cameraX));
    const y = Math.round(this.player.y - Math.floor(this.cameraY));
    if (this.player.hurtTimer > 0 && (this.frame & 2) === 0) {
      return;
    }

    if (this.sonicImage) {
      const spriteFrame = this.getSonicSpriteFrame();
      const transform = this.player.facing === -1 ? TRANS_MIRROR : TRANS_NONE;
      this.drawRegion(
        g,
        this.sonicImage,
        spriteFrame.sx,
        spriteFrame.sy,
        spriteFrame.width,
        spriteFrame.height,
        transform,
        x + Math.floor(this.player.width / 2),
        y + this.player.height + spriteFrame.offsetY,
        BOTTOM | HCENTER,
      );
      return;
    }

    g.setColor(0x245bdb);
    g.fillRect(x, y, this.player.width, this.player.height);
  }

  private drawHud(g: Graphics): void {
    g.setFont(Font.getFont(Font.FACE_SYSTEM, Font.STYLE_BOLD, Font.SIZE_SMALL));
    this.drawStringWithBorder(g, `SCORE ${this.score.toString().padStart(6, "0")}`, 4, 4, TOP | LEFT, 0xffffff, 0x000000);
    this.drawStringWithBorder(g, `RINGS ${this.rings.toString().padStart(2, "0")}`, 4, 18, TOP | LEFT, 0xffffff, 0x000000);
    this.drawStringWithBorder(g, `TIME ${this.formatTimer()}`, this.getWidth() - 4, 4, TOP | RIGHT, 0xffffff, 0x000000);
    this.drawStringWithBorder(g, `LIVES ${this.lives}`, this.getWidth() - 4, 18, TOP | RIGHT, 0xffffff, 0x000000);
    g.setFont(GameCanvas.defaultFont);
  }

  private formatTimer(): string {
    const seconds = Math.floor(this.actTimerFrames / 60);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
  }

  private getPlayerRect(): CollisionRect {
    return {
      x: this.player.x,
      y: this.player.y,
      width: this.player.width,
      height: this.player.height,
    };
  }

  private intersects(a: CollisionRect, b: CollisionRect): boolean {
    return a.x < b.x + b.width
      && a.x + a.width > b.x
      && a.y < b.y + b.height
      && a.y + a.height > b.y;
  }

  private isWorldSolidAt(canvasX: number, canvasY: number, purpose: "any" | "floor" | "wall" | "ceiling" = "any"): boolean {
    if (canvasX < 0 || canvasY < 0) {
      return true;
    }

    if (this.collisionMasks.length === 0) {
      return this.collisionRects.some((rect) => (
        canvasX >= rect.x
        && canvasX < rect.x + rect.width
        && canvasY >= rect.y
        && canvasY < rect.y + rect.height
      ));
    }

    const originalX = Math.floor(canvasX / MAIN_CANVAS_TO_CANVAS_SCALE);
    const originalY = Math.floor(canvasY / MAIN_CANVAS_TO_CANVAS_SCALE);
    const column = Math.floor(originalX / 16);
    const row = Math.floor(originalY / 16);
    const tile = this.tilemap[row]?.[column];
    if (!tile || !tile.solid || (!tile.collisionA && !tile.collisionB)) {
      return false;
    }

    if (
      purpose !== "floor"
      && this.canUseLoopMomentum()
      && SONIC_LOOP_GATE_BLOCKS.has(tile.blockId)
    ) {
      return false;
    }

    const localX = originalX & 15;
    const localY = originalY & 15;
    const maskBase = tile.collisionMask << 5;
    let maskIndex = maskBase + (localX << 1) + (localY >> 3);
    let bit = 7 - (localY & 7);

    if (tile.collisionTransform === 1) {
      maskIndex = maskBase + ((15 - localX) << 1) + (localY >> 3);
      bit = 7 - (localY & 7);
    } else if (tile.collisionTransform === 2) {
      maskIndex = maskBase + (localX << 1) + ((15 - localY) >> 3);
      bit = localY & 7;
    } else if (tile.collisionTransform === 3) {
      maskIndex = maskBase + ((15 - localX) << 1) + ((15 - localY) >> 3);
      bit = localY & 7;
    }

    return (((this.collisionMasks[maskIndex] ?? 0) >> bit) & 1) === 1;
  }

  protected handleCommandAction(): boolean {
    return false;
  }

  protected resetPressedKeys(): void {
    this.pressedKeys.fill(false);
    this.repeatedKeys.fill(false);
  }

  protected consumeKeyPress(code: number): boolean {
    const pressed = this.pressedKeys[code] === true;
    if (pressed && !this.repeatedKeys[code]) {
      this.repeatedKeys[code] = true;
      return true;
    }

    if (!pressed) {
      this.repeatedKeys[code] = false;
    }

    return false;
  }

  private initialCameraY(): number {
    const targetY = this.player.y - (this.getHeight() - 92);
    return Math.max(0, Math.min(this.worldHeight - this.getHeight(), targetY));
  }

  private toCanvasCoordinate(value: number): number {
    return Math.floor(value * MAIN_CANVAS_TO_CANVAS_SCALE);
  }

  private getObjectRuntimeSize(type: number, fallback: ObjectSize = { width: 24, height: 24 }): ObjectSize {
    const sourceSize = this.objectSizeTable[type];
    const width = sourceSize?.width;
    const height = sourceSize?.height;

    return {
      width: width !== undefined && width > 0 ? Math.max(1, this.toCanvasCoordinate(width)) : fallback.width,
      height: height !== undefined && height > 0 ? Math.max(1, this.toCanvasCoordinate(height)) : fallback.height,
    };
  }

  private isEnemyObjectType(type: number): boolean {
    return isKnownEnemyObjectType(type);
  }

  private isSpringObjectType(type: number): boolean {
    return isKnownSpringObjectType(type);
  }

  private getSpringRect(object: ActiveLevelObject): CollisionRect {
    const size = this.getObjectRuntimeSize(object.type, { width: 24, height: 18 });
    return {
      x: object.x - Math.floor(size.width / 2),
      y: object.y - Math.floor(size.height / 2),
      width: size.width,
      height: Math.max(12, Math.floor(size.height * 0.65)),
    };
  }

  private getItemBoxRect(object: ActiveLevelObject): CollisionRect {
    const size = this.getObjectRuntimeSize(object.type, { width: 24, height: 24 });
    return {
      x: object.x - Math.floor(size.width / 2),
      y: object.y - Math.floor(size.height / 2),
      width: size.width,
      height: size.height,
    };
  }

  private getObjectPlatformRect(object: ActiveLevelObject): CollisionRect | null {
    if (!object.active) {
      return null;
    }

    if (isBridgeObjectType(object.type)) {
      const size = this.getObjectRuntimeSize(object.type, {
        width: Math.max(TILE_SIZE, object.count * TILE_SIZE),
        height: TILE_SIZE,
      });
      return {
        x: object.x - Math.floor(size.width / 2),
        y: object.y - Math.floor(size.height / 2),
        width: size.width,
        height: Math.max(6, Math.min(TILE_SIZE, size.height)),
      };
    }

    if (object.type === OBJECT_BREAK_PLATFORM) {
      return {
        x: object.x - 18,
        y: object.y - 10,
        width: 36,
        height: 10,
      };
    }

    return null;
  }

  private getLevelObjectFrameIndex(object: ActiveLevelObject): number | undefined {
    if (this.isSpringObjectType(object.type)) {
      if (object.stateFrame <= 0) {
        return 0;
      }

      return object.stateFrame > 7 ? 2 : 1;
    }

    return undefined;
  }

  private getObjectAnchor(type: number): number {
    if ((this.frameData[getFrameDataType(type)]?.length ?? 0) > 0) {
      return HCENTER | VCENTER;
    }

    if (isBottomAnchoredObjectType(type)) {
      return BOTTOM | HCENTER;
    }

    return HCENTER | VCENTER;
  }

  private createEnemyFromObject(object: ActiveLevelObject): LevelEnemy {
    const type = this.getEnemyKind(object.type);
    const dimensions = this.getEnemyDimensions(object.type);
    const x = object.x - Math.floor(dimensions.width / 2);
    const y = object.y - Math.floor(dimensions.height / 2);
    return {
      x,
      y,
      originX: x,
      sourceType: object.type,
      width: dimensions.width,
      height: dimensions.height,
      alive: true,
      type,
      direction: (object.param & 1) === 1 ? -1 : 1,
    };
  }

  private getEnemyKind(type: number): LevelEnemy["type"] {
    if (type === OBJECT_HACHI) {
      return "bee";
    }

    if (type === OBJECT_FISH) {
      return "fish";
    }

    if (type === OBJECT_KAMERE) {
      return "kamere";
    }

    if (type === OBJECT_KANI) {
      return "kani";
    }

    return "moto";
  }

  private getEnemyDimensions(type: number): { width: number; height: number } {
    const objectSize = this.getObjectRuntimeSize(type, { width: 0, height: 0 });
    if (objectSize.width > 0 && objectSize.height > 0) {
      return objectSize;
    }

    const frame = this.frameData[getFrameDataType(type)]?.[0];
    if (frame) {
      return {
        width: frame[2] ?? 24,
        height: frame[3] ?? 24,
      };
    }

    const image = this.objectImages.get(type);
    if (image) {
      return {
        width: image.getWidth(),
        height: Math.min(image.getHeight(), 32),
      };
    }

    return { width: 24, height: 24 };
  }

  private getSonicSpriteFrame(): { sx: number; sy: number; width: number; height: number; offsetY: number } {
    const frames = this.frameData[151] ?? [];
    let frameIndex = 0;
    const speed = Math.abs(this.player.groundSpeed || this.player.vx);
    const animationStep = Math.floor(this.player.animationDistance / (MAIN_CANVAS_PHYSICS.maxSpeed * 4));

    if (this.player.rolling || this.player.jumping || !this.player.grounded) {
      frameIndex = 6 + (animationStep % 5);
    } else if (speed <= SONIC_STOP_EPSILON) {
      if (this.player.idleTimer < 75) {
        frameIndex = 0;
      } else if (this.player.idleTimer < 90) {
        frameIndex = 1;
      } else if (this.player.idleTimer < 105) {
        frameIndex = 2;
      } else {
        frameIndex = 3 + (Math.floor(this.player.idleTimer / 8) % 2);
      }
    } else if (speed < SONIC_GROUND_TOP_SPEED) {
      frameIndex = 12 + (animationStep % 6);
    } else {
      frameIndex = 18 + (animationStep % 4);
    }

    const frame = frames[frameIndex] ?? frames[0] ?? [0, 0, 21, 30, 0];
    return {
      sx: frame[0] ?? 0,
      sy: frame[1] ?? 0,
      width: frame[2] ?? 21,
      height: frame[3] ?? 30,
      offsetY: frame[4] ?? 0,
    };
  }

  private approach(value: number, target: number, amount: number): number {
    if (value < target) {
      return Math.min(target, value + amount);
    }

    if (value > target) {
      return Math.max(target, value - amount);
    }

    return target;
  }

  private updatePlayerAnimation(frameScale: number): void {
    const movingSpeed = Math.abs(this.player.vx);
    if (this.player.rolling || this.player.jumping || !this.player.grounded) {
      this.player.animationDistance += MAIN_CANVAS_PHYSICS.maxSpeed * frameScale;
      this.player.idleTimer = 0;
      return;
    }

    if (movingSpeed > SONIC_STOP_EPSILON) {
      this.player.animationDistance += Math.min(
        runtimeVelocityToMainCanvas(movingSpeed),
        MAIN_CANVAS_PHYSICS.maxSpeed,
      ) * frameScale;
      this.player.idleTimer = 0;
      return;
    }

    this.player.animationDistance = 0;
    this.player.idleTimer += frameScale;
  }
}
