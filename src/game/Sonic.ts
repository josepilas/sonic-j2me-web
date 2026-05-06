import { Display } from "../platform/j2me/Display";
import { MIDlet } from "../platform/j2me/MIDlet";
import { Game } from "./Game";

export class Sonic extends MIDlet {
  static midlet: Sonic | null = null;
  static display: Display | null = null;

  private game: Game;

  constructor() {
    super();
    console.log("sonic");
    console.log("Version 1.0.12");
    console.log("Build 3805");
    Sonic.midlet = this;
    Sonic.display = Display.getDisplay(this);
    this.game = new Game(this, -1);
    Sonic.display.setCurrent(this.game);
    this.game.start();
  }

  override startApp(): void {}

  override pauseApp(): void {
    console.error("pauseapp");
    this.saveState();
    this.game.pauseApp();
  }

  override destroyApp(unconditional: boolean): void {
    void unconditional;
    this.saveState();
    this.game.pauseApp();
  }

  saveState(): void {
    this.game.saveConfig();
    this.game.saveGameProgress();
    this.game.saveHighscore();
  }
}
