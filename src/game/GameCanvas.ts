import {
  APP_STATE_GAME,
  APP_STATE_LOADING_ACT,
  APP_STATE_MAIN_MENU,
  APP_STATE_PAUSE_MENU,
  J2ME_SCREEN_HEIGHT,
  J2ME_SCREEN_WIDTH,
  TILE_SIZE,
} from "../data/constants";
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
import type { LevelTile } from "./LevelLoader";
import { LevelLoader } from "./LevelLoader";
import type { GameProgress, HighscoreEntry } from "./SaveManager";
import { SaveManager } from "./SaveManager";

interface CollisionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LevelRing {
  x: number;
  y: number;
  collected: boolean;
}

interface LevelEnemy {
  x: number;
  y: number;
  width: number;
  height: number;
  alive: boolean;
  type: "moto" | "bee";
  direction: -1 | 1;
}

interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  groundSpeed: number;
  animationDistance: number;
  idleTimer: number;
  width: number;
  height: number;
  facing: -1 | 1;
  grounded: boolean;
  jumping: boolean;
  hurtTimer: number;
  alive: boolean;
}

const SONIC_FIXED_SCALE = 256;
const SONIC_BASE_SPEED_FIXED = 1536;
const SONIC_GROUND_ACCELERATION = 12 / SONIC_FIXED_SCALE;
const SONIC_BRAKE_ACCELERATION = 128 / SONIC_FIXED_SCALE;
const SONIC_GRAVITY = 56 / SONIC_FIXED_SCALE;
const SONIC_JUMP_SPEED = 1664 / SONIC_FIXED_SCALE;
const SONIC_SHORT_JUMP_SPEED = 896 / SONIC_FIXED_SCALE;
const SONIC_GROUND_TOP_SPEED = SONIC_BASE_SPEED_FIXED / SONIC_FIXED_SCALE;
const SONIC_AIR_TOP_SPEED = 4096 / SONIC_FIXED_SCALE;
const SONIC_STOP_EPSILON = 0.015;

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
  private readonly saveManager = new SaveManager();
  private titleImage: Image | null = null;
  private logoImage: Image | null = null;
  private ringImage: Image | null = null;
  private cursorImage: Image | null = null;
  private zoneImage: Image | null = null;
  private sonicImage: Image | null = null;
  private enemyImage: Image | null = null;
  private beeImage: Image | null = null;
  private itemImage: Image | null = null;
  private initialized = false;
  private selectedMenuItem = 0;
  private loadingTicks = 0;
  private startupLanguageSelection = false;
  private firstActLoadPromise: Promise<void> | null = null;
  private firstActAssetsLoaded = false;
  private loadingStatus = "READY";
  private loadingError = "";
  private readonly firstActData = new Map<string, Uint8Array>();
  private highscoreEntries: HighscoreEntry[] = [];
  private tilemap: LevelTile[][] = [];
  private frameData: number[][][] = [];
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

    if (this.startupLanguageSelection) {
      this.startupLanguageSelection = false;
      return;
    }

    void this.loadTexts();
    void this.audio.preloadTrack(0);
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
    this.loadingStatus = "LOADING IMAGES";
    const [zoneImage, sonicImage, ringImage, enemyImage, beeImage, itemImage] = await Promise.all([
      this.resources.loadImage("zone1.png"),
      this.resources.loadImage("sonic.png"),
      this.resources.loadImage("ring.png"),
      this.resources.loadImage("musi.png"),
      this.resources.loadImage("hachi.png"),
      this.resources.loadImage("item.png"),
    ]);

    this.zoneImage = zoneImage;
    this.sonicImage = sonicImage;
    this.ringImage = ringImage;
    this.enemyImage = enemyImage;
    this.beeImage = beeImage;
    this.itemImage = itemImage;
    void this.audio.preloadTrack(0);

    this.loadingStatus = "LOADING LEVEL DATA";
    const levelNames = [
      "zone1.bmd",
      "zone1.blt",
      "ZONE1ACT.act",
      "MapLzone1.blt",
      "mc_gh_map_data.bin",
      "mc_obj_size_table.bin",
      "blkcol.bct",
      "framedata.bin",
      "scddirtbl.blt",
      "scdtblwk.scd",
    ];
    const levelData = await Promise.all(levelNames.map((name) => this.levelLoader.loadLevelBinary(name)));
    for (let index = 0; index < levelNames.length; index += 1) {
      this.firstActData.set(levelNames[index], levelData[index]);
    }

    this.loadingStatus = "DECODING LEVEL";
    const [decodedLevel, frameData] = await Promise.all([
      this.levelLoader.loadGreenHillAct(this.actID),
      this.levelLoader.loadFrameData(),
    ]);

    this.tilemap = decodedLevel.tiles;
    this.frameData = frameData;
    this.worldWidth = decodedLevel.width;
    this.worldHeight = decodedLevel.height;
    this.rebuildCollisionRects();
  }

  update(_delta: number): void {}

  render(g: Graphics): void {
    this.drawScreenBackground(g, 0, 0, this.getWidth(), this.getHeight());
  }

  drawScreenBackground(g: Graphics, x: number, y: number, w: number, h: number): void {
    g.setColor(0x0046a8);
    g.fillRect(x, y, w, h);
    g.setColor(0x0075d8);
    g.fillRect(x, y + Math.floor(h * 0.45), w, Math.ceil(h * 0.55));
    g.setColor(0x00a84f);
    g.fillRect(x, y + h - 54, w, 54);
    g.setColor(0x8b5a2b);
    g.fillRect(x, y + h - 20, w, 20);
  }

  drawSonicLogo(g: Graphics): void {
    if (this.titleImage) {
      g.drawImage(this.titleImage, this.getWidth() >> 1, 22, HCENTER | TOP);
      return;
    }

    this.drawStringWithBorder(g, "SONIC", this.getWidth() >> 1, 28, HCENTER | TOP, 0xfadf34, 0x003a8c);
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

    if (this.logoImage) {
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
      void this.audio.interruptTrackAndPlay(0, -1);
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
    this.updateEnemies();
    this.collectRings();
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
    const total = 10;
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
    this.drawScreenBackground(g, 0, 0, this.getWidth(), this.getHeight());
    this.drawTileLayer(g, false);
    this.drawRings(g);
    this.drawEnemies(g);
    this.drawGoalObject(g);
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
    this.cameraX = 0;
    this.cameraY = this.initialCameraY();
    this.rings = 0;
    this.score = Math.max(0, this.score);
    this.actTimerFrames = 0;
    this.actCleared = false;
    this.actClearFrames = 0;
    this.levelRings = [
      this.createRing(184, 42),
      this.createRing(216, 54),
      this.createRing(248, 42),
      this.createRing(448, 42),
      this.createRing(480, 54),
      this.createRing(512, 42),
      this.createRing(760, 42),
      this.createRing(792, 54),
      this.createRing(824, 42),
    ];
    this.levelEnemies = [
      this.createEnemy(352, "moto", -1),
      this.createEnemy(620, "bee", 1),
      this.createEnemy(980, "moto", -1),
    ];
  }

  private createInitialPlayer(): PlayerState {
    const x = 40;
    const width = 20;
    const height = 28;
    const groundY = this.findGroundYAt(x + Math.floor(width / 2));
    return {
      x,
      y: groundY > 0 ? groundY - height : 190,
      vx: 0,
      vy: 0,
      groundSpeed: 0,
      animationDistance: 0,
      idleTimer: 0,
      width,
      height,
      facing: 1,
      grounded: groundY > 0,
      jumping: false,
      hurtTimer: 0,
      alive: true,
    };
  }

  private respawnPlayer(): void {
    this.lives = Math.max(0, this.lives - 1);
    this.rings = 0;
    this.player = this.createInitialPlayer();
    this.saveGameProgress();
  }

  private updatePlayer(delta: number): void {
    const frameScale = Math.max(0.25, Math.min(2, delta / 16));
    const leftPressed = this.pressedKeys[KEY_LEFT] === true;
    const rightPressed = this.pressedKeys[KEY_RIGHT] === true;
    const jumpPressed = this.consumeKeyPress(KEY_FIRE);
    const acceleration = SONIC_GROUND_ACCELERATION * frameScale;
    const brakeAcceleration = SONIC_BRAKE_ACCELERATION * frameScale;

    if (jumpPressed && this.player.grounded) {
      this.player.vy = -SONIC_JUMP_SPEED;
      this.player.grounded = false;
      this.player.jumping = true;
    }

    if (this.player.grounded) {
      if (leftPressed && !rightPressed) {
        this.player.facing = -1;
        this.player.vx = this.player.vx > 0
          ? this.approach(this.player.vx, 0, brakeAcceleration)
          : this.player.vx - acceleration * (Math.abs(this.player.vx) <= SONIC_STOP_EPSILON ? 2 : 1);
      } else if (rightPressed && !leftPressed) {
        this.player.facing = 1;
        this.player.vx = this.player.vx < 0
          ? this.approach(this.player.vx, 0, brakeAcceleration)
          : this.player.vx + acceleration * (Math.abs(this.player.vx) <= SONIC_STOP_EPSILON ? 2 : 1);
      } else {
        this.player.vx = this.approach(this.player.vx, 0, acceleration);
      }

      this.player.vx = Math.max(-SONIC_GROUND_TOP_SPEED, Math.min(SONIC_GROUND_TOP_SPEED, this.player.vx));
      this.player.groundSpeed = this.player.vx;
    } else {
      if (leftPressed && !rightPressed) {
        this.player.facing = -1;
        this.player.vx = this.player.vx === 0 ? -brakeAcceleration * 2 : this.player.vx - acceleration;
        if (this.player.vx > 0) {
          this.player.vx -= acceleration;
        }
      } else if (rightPressed && !leftPressed) {
        this.player.facing = 1;
        this.player.vx = this.player.vx === 0 ? brakeAcceleration * 2 : this.player.vx + acceleration;
        if (this.player.vx < 0) {
          this.player.vx += acceleration;
        }
      }

      if (!this.pressedKeys[KEY_FIRE] && this.player.vy < -SONIC_SHORT_JUMP_SPEED) {
        this.player.vy = -SONIC_SHORT_JUMP_SPEED;
      }

      this.player.vx = Math.max(-SONIC_AIR_TOP_SPEED, Math.min(SONIC_AIR_TOP_SPEED, this.player.vx));
      this.player.vy += SONIC_GRAVITY * frameScale;
    }

    this.player.x += this.player.vx * frameScale;
    this.resolveHorizontalCollisions();
    this.player.y += this.player.vy * frameScale;
    this.resolveVerticalCollisions();
    this.updatePlayerAnimation(frameScale);

    this.player.x = Math.max(0, Math.min(this.worldWidth - this.player.width, this.player.x));
    if (this.player.y > this.worldHeight + 40) {
      this.killPlayer();
    }

    if (this.player.hurtTimer > 0) {
      this.player.hurtTimer -= 1;
    }
  }

  private resolveHorizontalCollisions(): void {
    const playerRect = this.getPlayerRect();
    for (const rect of this.collisionRects) {
      if (!this.intersects(playerRect, rect)) {
        continue;
      }

      if (this.player.vx > 0) {
        this.player.x = rect.x - this.player.width;
      } else if (this.player.vx < 0) {
        this.player.x = rect.x + rect.width;
      }
      this.player.vx = 0;
      this.player.groundSpeed = 0;
      return;
    }
  }

  private resolveVerticalCollisions(): void {
    this.player.grounded = false;
    const playerRect = this.getPlayerRect();
    for (const rect of this.collisionRects) {
      if (!this.intersects(playerRect, rect)) {
        continue;
      }

      if (this.player.vy >= 0) {
        this.player.y = rect.y - this.player.height;
        this.player.grounded = true;
        this.player.jumping = false;
        this.player.groundSpeed = this.player.vx;
      } else {
        this.player.y = rect.y + rect.height;
      }
      this.player.vy = 0;
      return;
    }
  }

  private updateEnemies(): void {
    for (const enemy of this.levelEnemies) {
      if (!enemy.alive) {
        continue;
      }

      enemy.x += enemy.direction * 0.35;
      if (enemy.x < 300 || enemy.x > 1040) {
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

  private checkEnemyCollisions(): void {
    const playerRect = this.getPlayerRect();
    for (const enemy of this.levelEnemies) {
      if (!enemy.alive || !this.intersects(playerRect, enemy)) {
        continue;
      }

      if (this.player.vy > 0 && this.player.y + this.player.height - enemy.y < 14) {
        enemy.alive = false;
        this.player.vy = -3.8;
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
      this.player.vx = -this.player.facing * 2.4;
      this.player.vy = -3.2;
      this.player.jumping = true;
      this.player.grounded = false;
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

  private drawTileLayer(g: Graphics, priority: boolean): void {
    const startColumn = Math.max(0, Math.floor(this.cameraX / TILE_SIZE) - 1);
    const endColumn = Math.min(this.tilemap[0]?.length ?? 0, startColumn + Math.ceil(this.getWidth() / TILE_SIZE) + 3);
    const offsetX = Math.floor(this.cameraX);
    const startRow = Math.max(0, Math.floor(this.cameraY / TILE_SIZE) - 1);
    const endRow = Math.min(this.tilemap.length, startRow + Math.ceil(this.getHeight() / TILE_SIZE) + 3);
    const offsetY = Math.floor(this.cameraY);

    for (let row = startRow; row < endRow; row += 1) {
      for (let column = startColumn; column < endColumn; column += 1) {
        const tile = this.tilemap[row][column];
        if (tile.tileId === 0 || tile.priority !== priority) {
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
    for (const ring of this.levelRings) {
      if (ring.collected) {
        continue;
      }

      const x = Math.round(ring.x - this.cameraX);
      const y = Math.round(ring.y - this.cameraY);
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

  private drawEnemies(g: Graphics): void {
    for (const enemy of this.levelEnemies) {
      if (!enemy.alive) {
        continue;
      }

      const x = Math.round(enemy.x - this.cameraX);
      const y = Math.round(enemy.y - this.cameraY);
      if (x < -40 || x > this.getWidth() + 40) {
        continue;
      }

      const image = enemy.type === "bee" ? this.beeImage : this.enemyImage;
      if (image) {
        const frameCount = enemy.type === "bee" ? 3 : 3;
        const frameHeight = Math.floor(image.getHeight() / frameCount);
        const frame = Math.floor(this.frame / 8) % frameCount;
        this.drawRegion(
          g,
          image,
          0,
          frame * frameHeight,
          image.getWidth(),
          frameHeight,
          enemy.direction === -1 ? TRANS_MIRROR : TRANS_NONE,
          x,
          y,
          TOP | LEFT,
        );
      } else {
        g.setColor(0xe34a2f);
        g.fillRect(x, y, enemy.width, enemy.height);
      }
    }
  }

  private drawGoalObject(g: Graphics): void {
    const x = Math.round(this.worldWidth - 72 - this.cameraX);
    const groundY = this.findGroundYAt(this.worldWidth - 60);
    const y = (groundY > 0 ? groundY : 240) - 32 - Math.floor(this.cameraY);
    if (x < -32 || x > this.getWidth() + 32) {
      return;
    }

    if (this.itemImage) {
      const frameHeight = 24;
      const frame = Math.floor(this.frame / 8) % Math.max(1, Math.floor(this.itemImage.getHeight() / frameHeight));
      this.drawRegion(g, this.itemImage, 0, frame * frameHeight, 24, frameHeight, 0, x, y, TOP | LEFT);
      return;
    }

    g.setColor(0xffffff);
    g.fillRect(x, y, 16, 32);
  }

  private drawPlayer(g: Graphics): void {
    const x = Math.round(this.player.x - this.cameraX);
    const y = Math.round(this.player.y - this.cameraY);
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

  private findGroundYAt(x: number): number {
    const column = Math.max(0, Math.min((this.tilemap[0]?.length ?? 1) - 1, Math.floor(x / TILE_SIZE)));
    for (let row = 0; row < this.tilemap.length; row += 1) {
      if (this.tilemap[row][column]?.solid) {
        return row * TILE_SIZE;
      }
    }

    return 0;
  }

  private createRing(x: number, groundOffset: number): LevelRing {
    const groundY = this.findGroundYAt(x);
    return {
      x,
      y: (groundY > 0 ? groundY : 240) - groundOffset,
      collected: false,
    };
  }

  private createEnemy(x: number, type: LevelEnemy["type"], direction: -1 | 1): LevelEnemy {
    const width = type === "bee" ? 35 : 30;
    const height = type === "bee" ? 43 : 24;
    const groundY = this.findGroundYAt(x + Math.floor(width / 2));
    return {
      x,
      y: (groundY > 0 ? groundY : 240) - (type === "bee" ? 84 : height),
      width,
      height,
      alive: true,
      type,
      direction,
    };
  }

  private getSonicSpriteFrame(): { sx: number; sy: number; width: number; height: number; offsetY: number } {
    const frames = this.frameData[151] ?? [];
    let frameIndex = 0;
    const speed = Math.abs(this.player.groundSpeed || this.player.vx);
    const animationStep = Math.floor(this.player.animationDistance / (SONIC_BASE_SPEED_FIXED * 4));

    if (this.player.jumping || !this.player.grounded) {
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
    if (this.player.jumping || !this.player.grounded) {
      this.player.animationDistance += SONIC_BASE_SPEED_FIXED * frameScale;
      this.player.idleTimer = 0;
      return;
    }

    if (movingSpeed > SONIC_STOP_EPSILON) {
      this.player.animationDistance += Math.min(movingSpeed * SONIC_FIXED_SCALE, SONIC_BASE_SPEED_FIXED) * frameScale;
      this.player.idleTimer = 0;
      return;
    }

    this.player.animationDistance = 0;
    this.player.idleTimer += frameScale;
  }
}
