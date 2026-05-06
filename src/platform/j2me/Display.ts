import type { MIDlet } from "./MIDlet";
import type { Canvas } from "./Canvas";
import { AudioPlayer } from "./AudioPlayer";
import { Graphics } from "./Graphics";
import { KEY_DOWN, KEY_FIRE, KEY_LEFT, KEY_PAUSE, KEY_RIGHT, KEY_UP, mapKeyAlias } from "./KeyCodes";

export class Display {
  private static instance: Display | null = null;

  private element: HTMLCanvasElement | null = null;
  private graphics: Graphics | null = null;
  private current: Canvas | null = null;
  private repaintQueued = false;
  private keyboardConnected = false;
  private touchConnected = false;
  private gamepadConnected = false;
  private readonly activeGamepadCodes = new Set<number>();

  static getDisplay(_midlet?: MIDlet): Display {
    if (!Display.instance) {
      Display.instance = new Display();
    }

    return Display.instance;
  }

  attachCanvasElement(element: HTMLCanvasElement): void {
    this.element = element;
    const context = element.getContext("2d");
    if (!context) {
      throw new Error("2D canvas context is not available.");
    }

    context.imageSmoothingEnabled = false;
    this.graphics = new Graphics(context, element.width, element.height);
    this.connectKeyboard();
    this.connectAudioUnlock();
    this.startGamepadPolling();
  }

  attachTouchControls(root: ParentNode): void {
    if (this.touchConnected) {
      return;
    }

    const buttons = root.querySelectorAll<HTMLElement>("[data-j2me-key]");
    for (const button of buttons) {
      const keyAlias = button.dataset.j2meKey;
      const keyCode = keyAlias ? mapKeyAlias(keyAlias) : null;
      if (keyCode === null) {
        continue;
      }

      const press = (event: PointerEvent) => {
        event.preventDefault();
        void AudioPlayer.unlock();
        button.setPointerCapture(event.pointerId);
        this.pressKey(keyCode);
      };
      const release = (event: PointerEvent) => {
        event.preventDefault();
        if (button.hasPointerCapture(event.pointerId)) {
          button.releasePointerCapture(event.pointerId);
        }
        this.releaseKey(keyCode);
      };

      button.addEventListener("pointerdown", press);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("pointerleave", release);
      button.addEventListener("contextmenu", (event) => event.preventDefault());
    }

    this.touchConnected = true;
  }

  attachFullscreenButton(button: HTMLElement, target: HTMLElement): void {
    button.addEventListener("click", () => {
      void AudioPlayer.unlock();
      if (document.fullscreenElement) {
        void document.exitFullscreen();
        return;
      }

      void target.requestFullscreen?.();
      this.element?.focus();
    });
  }

  setCurrent(canvas: Canvas): void {
    if (!this.element || !this.graphics) {
      throw new Error("Display must be attached to an HTMLCanvasElement before setCurrent().");
    }

    this.current?.hideNotify();
    this.current = canvas;
    canvas.bindDisplay(this, this.element.width, this.element.height);
    canvas.showNotify();
    canvas.repaint();
    this.element.focus();
  }

  getCurrent(): Canvas | null {
    return this.current;
  }

  requestRepaint(canvas: Canvas): void {
    if (canvas !== this.current || this.repaintQueued) {
      return;
    }

    this.repaintQueued = true;
    requestAnimationFrame(() => {
      this.repaintQueued = false;
      this.paintNow(canvas);
    });
  }

  paintNow(canvas: Canvas): void {
    if (canvas !== this.current || !this.graphics) {
      return;
    }

    if (!canvas.consumeRepaintRequest()) {
      return;
    }

    this.graphics.beginFrame();
    canvas.paint(this.graphics);
  }

  private connectKeyboard(): void {
    if (this.keyboardConnected || !this.element) {
      return;
    }

    this.keyboardConnected = true;
    this.element.addEventListener("keydown", (event) => {
      void AudioPlayer.unlock();
      if (!this.current?.handleKeyDown(event)) {
        return;
      }

      event.preventDefault();
    });

    this.element.addEventListener("keyup", (event) => {
      if (!this.current?.handleKeyUp(event)) {
        return;
      }

      event.preventDefault();
    });
  }

  private connectAudioUnlock(): void {
    const unlock = () => {
      void AudioPlayer.unlock();
      this.element?.removeEventListener("pointerdown", unlock);
      this.element?.removeEventListener("touchstart", unlock);
    };

    this.element?.addEventListener("pointerdown", unlock, { passive: true });
    this.element?.addEventListener("touchstart", unlock, { passive: true });
  }

  private startGamepadPolling(): void {
    if (this.gamepadConnected) {
      return;
    }

    this.gamepadConnected = true;
    const poll = () => {
      this.pollGamepads();
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }

  private pollGamepads(): void {
    const gamepads = navigator.getGamepads?.();
    if (!gamepads) {
      return;
    }

    const nextCodes = new Set<number>();
    for (const gamepad of gamepads) {
      if (!gamepad) {
        continue;
      }

      const axisX = gamepad.axes[0] ?? 0;
      const axisY = gamepad.axes[1] ?? 0;
      if (axisX < -0.35 || gamepad.buttons[14]?.pressed) {
        nextCodes.add(KEY_LEFT);
      }
      if (axisX > 0.35 || gamepad.buttons[15]?.pressed) {
        nextCodes.add(KEY_RIGHT);
      }
      if (axisY < -0.35 || gamepad.buttons[12]?.pressed) {
        nextCodes.add(KEY_UP);
      }
      if (axisY > 0.35 || gamepad.buttons[13]?.pressed) {
        nextCodes.add(KEY_DOWN);
      }
      if (gamepad.buttons[0]?.pressed || gamepad.buttons[1]?.pressed) {
        nextCodes.add(KEY_FIRE);
      }
      if (gamepad.buttons[9]?.pressed) {
        nextCodes.add(KEY_PAUSE);
      }
    }

    for (const code of nextCodes) {
      if (!this.activeGamepadCodes.has(code)) {
        this.pressKey(code);
      }
    }

    for (const code of this.activeGamepadCodes) {
      if (!nextCodes.has(code)) {
        this.releaseKey(code);
      }
    }

    this.activeGamepadCodes.clear();
    for (const code of nextCodes) {
      this.activeGamepadCodes.add(code);
    }
  }

  private pressKey(code: number): void {
    void AudioPlayer.unlock();
    this.current?.keyPressed(code);
    this.current?.repaint();
  }

  private releaseKey(code: number): void {
    this.current?.keyReleased(code);
    this.current?.repaint();
  }
}
