import { Font } from "./Font";
import type { Image } from "./Image";
import {
  TRANS_MIRROR,
  TRANS_MIRROR_ROT180,
  TRANS_MIRROR_ROT270,
  TRANS_MIRROR_ROT90,
  TRANS_NONE,
  TRANS_ROT180,
  TRANS_ROT270,
  TRANS_ROT90,
} from "./Sprite";

export {
  TRANS_MIRROR,
  TRANS_MIRROR_ROT180,
  TRANS_MIRROR_ROT270,
  TRANS_MIRROR_ROT90,
  TRANS_NONE,
  TRANS_ROT180,
  TRANS_ROT270,
  TRANS_ROT90,
} from "./Sprite";

export const HCENTER = 1;
export const VCENTER = 2;
export const LEFT = 4;
export const RIGHT = 8;
export const TOP = 16;
export const BOTTOM = 32;

type Matrix = readonly [number, number, number, number, number, number];

export class Graphics {
  static readonly HCENTER = HCENTER;
  static readonly VCENTER = VCENTER;
  static readonly LEFT = LEFT;
  static readonly RIGHT = RIGHT;
  static readonly TOP = TOP;
  static readonly BOTTOM = BOTTOM;

  private readonly context: CanvasRenderingContext2D;
  private readonly width: number;
  private readonly height: number;
  private color = "#000000";
  private font = Font.getFont(Font.FACE_SYSTEM, Font.STYLE_PLAIN, Font.SIZE_MEDIUM);
  private translateX = 0;
  private translateY = 0;

  constructor(context: CanvasRenderingContext2D, width: number, height: number) {
    this.context = context;
    this.width = width;
    this.height = height;
    this.context.save();
    this.applyDrawingState();
  }

  beginFrame(): void {
    this.context.restore();
    this.context.save();
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.clearRect(0, 0, this.width, this.height);
    this.translateX = 0;
    this.translateY = 0;
    this.applyDrawingState();
  }

  setColor(rgb: number): void {
    const normalized = rgb & 0xffffff;
    this.color = `#${normalized.toString(16).padStart(6, "0")}`;
    this.applyDrawingState();
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.context.fillRect(x, y, w, h);
  }

  drawImage(image: Image, x: number, y: number, anchor: number): void {
    const width = image.getWidth();
    const height = image.getHeight();
    const position = this.applyAnchor(x, y, width, height, anchor);
    this.context.drawImage(image.getElement(), position.x, position.y);
  }

  drawRegion(
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
    const rotated = transform === TRANS_ROT90
      || transform === TRANS_ROT270
      || transform === TRANS_MIRROR_ROT90
      || transform === TRANS_MIRROR_ROT270;
    const dw = rotated ? sh : sw;
    const dh = rotated ? sw : sh;
    const position = this.applyAnchor(x, y, dw, dh, anchor);
    const matrix = this.getTransformMatrix(transform, sw, sh);

    this.context.save();
    this.context.translate(position.x, position.y);
    this.context.transform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
    this.context.drawImage(image.getElement(), sx, sy, sw, sh, 0, 0, sw, sh);
    this.context.restore();
  }

  drawString(text: string, x: number, y: number, anchor: number): void {
    this.applyDrawingState();
    const width = this.font.stringWidth(text);
    const height = this.font.getHeight();
    const position = this.applyAnchor(x, y, width, height, anchor);
    this.context.fillText(text, position.x, position.y);
  }

  setClip(x: number, y: number, w: number, h: number): void {
    this.context.restore();
    this.context.save();
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.translate(this.translateX, this.translateY);
    this.context.beginPath();
    this.context.rect(x, y, w, h);
    this.context.clip();
    this.applyDrawingState();
  }

  translate(x: number, y: number): void {
    this.translateX += x;
    this.translateY += y;
    this.context.translate(x, y);
  }

  getFont(): Font {
    return this.font;
  }

  setFont(font: Font): void {
    this.font = font;
    this.applyDrawingState();
  }

  private applyDrawingState(): void {
    this.context.fillStyle = this.color;
    this.context.strokeStyle = this.color;
    this.context.font = this.font.toCanvasFont();
    this.context.textAlign = "left";
    this.context.textBaseline = "top";
    this.context.imageSmoothingEnabled = false;
  }

  private applyAnchor(
    x: number,
    y: number,
    width: number,
    height: number,
    anchor: number,
  ): { x: number; y: number } {
    let drawX = x;
    let drawY = y;

    if ((anchor & RIGHT) !== 0) {
      drawX -= width;
    } else if ((anchor & HCENTER) !== 0) {
      drawX -= width / 2;
    }

    if ((anchor & BOTTOM) !== 0) {
      drawY -= height;
    } else if ((anchor & VCENTER) !== 0) {
      drawY -= height / 2;
    }

    return { x: Math.round(drawX), y: Math.round(drawY) };
  }

  private getTransformMatrix(transform: number, sw: number, sh: number): Matrix {
    switch (transform) {
      case TRANS_MIRROR:
        return [-1, 0, 0, 1, sw, 0];
      case TRANS_ROT180:
        return [-1, 0, 0, -1, sw, sh];
      case TRANS_MIRROR_ROT180:
        return [1, 0, 0, -1, 0, sh];
      case TRANS_ROT90:
        return [0, 1, -1, 0, sh, 0];
      case TRANS_ROT270:
        return [0, -1, 1, 0, 0, sw];
      case TRANS_MIRROR_ROT90:
        return [0, -1, -1, 0, sh, sw];
      case TRANS_MIRROR_ROT270:
        return [0, 1, 1, 0, 0, 0];
      case TRANS_NONE:
      default:
        return [1, 0, 0, 1, 0, 0];
    }
  }
}
