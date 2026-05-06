import { Sonic } from "../game/Sonic";
import { Display } from "../platform/j2me/Display";

export class SonicApp {
  private readonly canvas: HTMLCanvasElement;
  private sonic: Sonic | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  start(): void {
    const display = Display.getDisplay();
    display.attachCanvasElement(this.canvas);
    display.attachTouchControls(document);
    const fullscreenButton = document.querySelector<HTMLElement>("#fullscreen-toggle");
    const fullscreenTarget = document.querySelector<HTMLElement>("#app");
    if (fullscreenButton && fullscreenTarget) {
      display.attachFullscreenButton(fullscreenButton, fullscreenTarget);
    }
    this.sonic = new Sonic();
    this.sonic.startApp();
    window.addEventListener("beforeunload", () => {
      this.sonic?.saveState();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.sonic?.saveState();
      }
    });
  }
}
