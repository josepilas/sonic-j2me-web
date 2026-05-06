import type { Display } from "./Display";
import type { Graphics } from "./Graphics";
import { mapKeyboardCode } from "./KeyCodes";

export class Canvas {
  private display: Display | null = null;
  private width = 240;
  private height = 320;
  private dirty = true;
  private fullScreen = false;

  getWidth(): number {
    return this.width;
  }

  getHeight(): number {
    return this.height;
  }

  setFullScreenMode(value: boolean): void {
    this.fullScreen = value;
  }

  repaint(): void {
    this.dirty = true;
    this.display?.requestRepaint(this);
  }

  serviceRepaints(): void {
    this.display?.paintNow(this);
  }

  paint(_g: Graphics): void {}

  keyPressed(_code: number): void {}

  keyReleased(_code: number): void {}

  showNotify(): void {}

  hideNotify(): void {}

  handleKeyDown(event: KeyboardEvent): boolean {
    const code = mapKeyboardCode(event.code);
    if (code === null) {
      return false;
    }

    this.keyPressed(code);
    this.repaint();
    return true;
  }

  handleKeyUp(event: KeyboardEvent): boolean {
    const code = mapKeyboardCode(event.code);
    if (code === null) {
      return false;
    }

    this.keyReleased(code);
    this.repaint();
    return true;
  }

  isFullScreenMode(): boolean {
    return this.fullScreen;
  }

  bindDisplay(display: Display, width: number, height: number): void {
    this.display = display;
    this.width = width;
    this.height = height;
  }

  consumeRepaintRequest(): boolean {
    const shouldPaint = this.dirty;
    this.dirty = false;
    return shouldPaint;
  }

  markDirty(): void {
    this.dirty = true;
  }
}
