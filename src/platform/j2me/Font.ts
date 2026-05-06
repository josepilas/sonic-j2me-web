export const FACE_SYSTEM = 0;
export const STYLE_PLAIN = 0;
export const STYLE_BOLD = 1;
export const SIZE_SMALL = 8;
export const SIZE_MEDIUM = 0;
export const SIZE_LARGE = 16;

export class Font {
  static readonly FACE_SYSTEM = FACE_SYSTEM;
  static readonly STYLE_PLAIN = STYLE_PLAIN;
  static readonly STYLE_BOLD = STYLE_BOLD;
  static readonly SIZE_SMALL = SIZE_SMALL;
  static readonly SIZE_MEDIUM = SIZE_MEDIUM;
  static readonly SIZE_LARGE = SIZE_LARGE;

  private static measureContext: CanvasRenderingContext2D | null = null;

  private readonly face: number;
  private readonly style: number;
  private readonly size: number;

  private constructor(face: number, style: number, size: number) {
    this.face = face;
    this.style = style;
    this.size = size;
  }

  static getFont(face: number, style: number, size: number): Font {
    return new Font(face, style, size);
  }

  stringWidth(text: string): number {
    const context = Font.getMeasureContext();
    if (!context) {
      return Math.ceil(text.length * this.getApproximateGlyphWidth());
    }

    context.font = this.toCanvasFont();
    return Math.ceil(context.measureText(text).width);
  }

  getHeight(): number {
    return this.resolvePixelSize() + 3;
  }

  toCanvasFont(): string {
    const weight = this.style === STYLE_BOLD ? "700" : "400";
    const family = this.face === FACE_SYSTEM ? 'system-ui, "Segoe UI", sans-serif' : "sans-serif";
    return `${weight} ${this.resolvePixelSize()}px ${family}`;
  }

  private resolvePixelSize(): number {
    if (this.size === SIZE_SMALL) {
      return 10;
    }

    if (this.size === SIZE_LARGE) {
      return 16;
    }

    return 13;
  }

  private getApproximateGlyphWidth(): number {
    return Math.ceil(this.resolvePixelSize() * 0.58);
  }

  private static getMeasureContext(): CanvasRenderingContext2D | null {
    if (Font.measureContext) {
      return Font.measureContext;
    }

    const canvas = document.createElement("canvas");
    Font.measureContext = canvas.getContext("2d");
    return Font.measureContext;
  }
}
