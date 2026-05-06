export class Image {
  private readonly source: CanvasImageSource;
  private readonly width: number;
  private readonly height: number;

  private constructor(source: CanvasImageSource, width: number, height: number) {
    this.source = source;
    this.width = width;
    this.height = height;
  }

  static async createImage(path: string): Promise<Image> {
    return new Promise((resolve, reject) => {
      const element = new globalThis.Image();
      element.onload = () => resolve(Image.fromLoadedElement(element));
      element.onerror = () => reject(new Error(`Unable to load image: ${path}`));
      element.src = path;
    });
  }

  getWidth(): number {
    return this.width;
  }

  getHeight(): number {
    return this.height;
  }

  getElement(): CanvasImageSource {
    return this.source;
  }

  private static fromLoadedElement(element: HTMLImageElement): Image {
    const width = element.naturalWidth || element.width;
    const height = element.naturalHeight || element.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return new Image(element, width, height);
    }

    context.imageSmoothingEnabled = false;
    context.drawImage(element, 0, 0);
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;
    let converted = false;

    for (let index = 0; index < data.length; index += 4) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      if (red > 240 && green < 24 && blue > 240) {
        data[index + 3] = 0;
        converted = true;
      }
    }

    if (!converted) {
      return new Image(element, width, height);
    }

    context.putImageData(imageData, 0, 0);
    return new Image(canvas, width, height);
  }
}
