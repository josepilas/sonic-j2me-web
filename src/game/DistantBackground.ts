import { MAIN_CANVAS_TO_CANVAS_SCALE } from "../data/sonicjarPhysics";
import { LEFT, TOP, TRANS_NONE } from "../platform/j2me/Graphics";
import type { Graphics } from "../platform/j2me/Graphics";
import type { Image } from "../platform/j2me/Image";

export interface DistantBgTablesPayload {
  fields: Record<string, number[]>;
}

const GREEN_HILL_LAYERS = [
  { field: "data4", divisor: 5 },
  { field: "data5", divisor: 3 },
  { field: "data6", divisor: 2 },
] as const;

export class DistantBackground {
  private tables: Record<string, number[]> = {};

  setTables(payload: DistantBgTablesPayload): void {
    this.tables = payload.fields;
  }

  draw(g: Graphics, zoneID: number, image: Image | null, cameraX: number, _cameraY: number): boolean {
    if (zoneID !== 0 || !image) {
      return false;
    }

    for (const layer of GREEN_HILL_LAYERS) {
      const data = this.tables[layer.field];
      if (data) {
        this.drawParts(g, image, data, Math.floor(cameraX / layer.divisor), 0);
      }
    }

    return true;
  }

  private drawParts(g: Graphics, image: Image, data: number[], scrollX: number, scrollY: number): void {
    this.drawPartsSub(g, image, data, scrollX, scrollY, 0);
    this.drawPartsSub(g, image, data, scrollX, scrollY, 256);
  }

  private drawPartsSub(
    g: Graphics,
    image: Image,
    data: number[],
    scrollX: number,
    scrollY: number,
    repeatOffset: number,
  ): void {
    let y = scrollY;
    if (repeatOffset === 0) {
      const fillHeight = data[0] ?? 0;
      if (fillHeight > 0) {
        g.setColor(data[2] ?? 0);
        g.fillRect(0, this.toRuntime(data[1] ?? 0) + this.toRuntime(y), 240, this.toRuntime(fillHeight));
      }
    }

    let x = repeatOffset - scrollX;
    let transform = TRANS_NONE;
    const count = data[3] ?? 0;
    let offset = 4;

    for (let index = 0; index < count && offset + 3 < data.length; index += 1) {
      x = (x + (data[offset] ?? 0)) & 511;
      const width = data[offset + 1] ?? 0;
      const regionX = data[offset + 2] ?? 0;
      const arg = data[offset + 3] ?? 0;

      if (regionX === -2) {
        y += width;
        transform = arg;
        offset += 4;
        continue;
      }

      if (x >= 496 || (x < 256 && x + width < 256)) {
        offset += 4;
        continue;
      }

      const drawX = this.toRuntime(x - 256);
      const drawY = this.toRuntime(y);
      const drawW = Math.max(1, this.toRuntime(width));
      const drawH = this.toRuntime(16);

      if (regionX === -1) {
        g.setColor(arg);
        g.fillRect(drawX, drawY, drawW, drawH);
      } else if (regionX >= 0) {
        g.drawRegion(
          image,
          this.toRuntime(regionX),
          this.toRuntime(arg),
          drawW,
          drawH,
          transform,
          drawX,
          drawY,
          LEFT | TOP,
        );
      } else {
        this.drawRepeatedTile(g, image, regionX, arg, transform, drawX, drawY, drawW, drawH);
      }

      offset += 4;
    }
  }

  private drawRepeatedTile(
    g: Graphics,
    image: Image,
    regionX: number,
    regionY: number,
    transform: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const sourceX = this.toRuntime(-(regionX + 16));
    const sourceY = this.toRuntime(regionY);
    for (let remaining = width, drawX = x; remaining > 0; remaining -= height, drawX += height) {
      const tileWidth = Math.min(height, remaining);
      g.drawRegion(image, sourceX, sourceY, tileWidth, height, transform, drawX, y, LEFT | TOP);
    }
  }

  private toRuntime(value: number): number {
    return Math.round(value * MAIN_CANVAS_TO_CANVAS_SCALE);
  }
}
