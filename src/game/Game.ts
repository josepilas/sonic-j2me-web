import {
  APP_STATE_GAME,
  APP_STATE_LOADING_ACT,
  APP_STATE_LOADING_DONE,
  APP_STATE_MAIN_MENU,
  APP_STATE_PAUSE_MENU,
  FIXED_FRAME_MS,
} from "../data/constants";
import type { Graphics } from "../platform/j2me/Graphics";
import type { MIDlet } from "../platform/j2me/MIDlet";
import { GameCanvas } from "./GameCanvas";

export class Game extends GameCanvas {
  public field_328 = 0;

  private running = false;
  private accumulator = 0;
  private lastTime = 0;
  private animationFrameId = 0;

  constructor(midlet: MIDlet, resume: number) {
    super(midlet, resume);
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.init();
    this.startTime = performance.now();
    this.lastTime = performance.now();

    const loop = (now: number) => {
      if (!this.running) {
        return;
      }

      this.startFrameTime = now;
      const elapsed = Math.min(100, now - this.lastTime);
      this.lastTime = now;
      this.accumulator += elapsed;

      while (this.accumulator >= FIXED_FRAME_MS) {
        this.tick(FIXED_FRAME_MS);
        this.accumulator -= FIXED_FRAME_MS;
      }

      this.rendering = true;
      this.storeFrameDelay(now - this.startFrameTime);
      this.repaint();

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  override update(delta: number): void {
    if (this.handleCommandAction()) {
      this.resetPressedKeys();
      return;
    }

    switch (this.appState) {
      case APP_STATE_MAIN_MENU:
        this.updateMainMenu();
        break;
      case APP_STATE_LOADING_ACT:
        this.updateLoadingAct(delta);
        break;
      case APP_STATE_LOADING_DONE:
      case APP_STATE_GAME:
        this.updateGameplay(delta);
        break;
      case APP_STATE_PAUSE_MENU:
        this.updatePauseMenu();
        break;
      default:
        break;
    }
  }

  override render(g: Graphics): void {
    switch (this.appState) {
      case APP_STATE_MAIN_MENU:
        this.renderMainMenu(g);
        break;
      case APP_STATE_LOADING_ACT:
        this.renderLoading(g);
        break;
      case APP_STATE_LOADING_DONE:
      case APP_STATE_GAME:
        this.renderGamePlaceholder(g);
        break;
      case APP_STATE_PAUSE_MENU:
        this.renderPauseMenu(g);
        break;
      default:
        this.drawScreenBackground(g, 0, 0, this.getWidth(), this.getHeight());
        break;
    }

    if (this.redrawSonicLogo) {
      this.drawSonicLogo(g);
      this.redrawSonicLogo = false;
    }
  }

  pauseApp(): void {
    this.running = false;
    cancelAnimationFrame(this.animationFrameId);
  }

  private tick(delta: number): void {
    this.update(delta);
    this.frame += 1;
    this.gameElapsedTime = this.frame * FIXED_FRAME_MS;
    this.appElapsedTime = performance.now() - this.startTime;
  }

  private storeFrameDelay(delay: number): void {
    this.frameDelays[this.frameDelayIndex] = delay;
    this.frameDelayIndex = (this.frameDelayIndex + 1) % this.frameDelays.length;
    this.minFrameDeplay = this.frameDelays.reduce((sum, value) => sum + value, 0) / this.frameDelays.length;
  }
}
