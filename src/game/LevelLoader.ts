import { ResourceLoader } from "../platform/j2me/ResourceLoader";
import { transforms } from "../data/transforms";
import { readInt32BE } from "../utils/binary";

export interface LevelTile {
  tileId: number;
  transform: number;
  priority: boolean;
  solid: boolean;
}

export interface DecodedLevel {
  tiles: LevelTile[][];
  width: number;
  height: number;
  columns: number;
  rows: number;
}

export class LevelLoader {
  private readonly resources = new ResourceLoader();

  async loadLevelBinary(name: string): Promise<Uint8Array> {
    return this.resources.loadBinary(`/assets/levels/${name}`);
  }

  async loadGreenHillAct(actID: number): Promise<DecodedLevel> {
    const [mapData, zoneBmd, zoneBlt, mapLayer] = await Promise.all([
      this.loadLevelBinary("mc_gh_map_data.bin"),
      this.loadLevelBinary("zone1.bmd"),
      this.loadLevelBinary("zone1.blt"),
      this.loadLevelBinary("MapLzone1.blt"),
    ]);

    const maps = this.parseJavaInt3D(mapData);
    const blockMap = maps[actID] ?? maps[0];
    return this.decodeBlockTilemap(blockMap, zoneBmd, zoneBlt, mapLayer);
  }

  async loadFrameData(): Promise<number[][][]> {
    return this.parseJavaInt3D(await this.loadLevelBinary("framedata.bin"));
  }

  private decodeBlockTilemap(
    blockMap: number[][],
    zoneBmd: Uint8Array,
    zoneBlt: Uint8Array,
    mapLayer: Uint8Array,
  ): DecodedLevel {
    const blockRows = blockMap.length;
    const blockColumns = blockMap[0]?.length ?? 0;
    const columns = blockColumns * 16;
    const rows = blockRows * 16;
    const tiles: LevelTile[][] = [];

    for (let row = 0; row < rows; row += 1) {
      const tileRow: LevelTile[] = [];
      for (let column = 0; column < columns; column += 1) {
        const blockY = Math.floor(row / 16);
        const blockX = Math.floor(column / 16);
        const blockId = blockMap[blockY]?.[blockX] ?? 0;
        const cellX = column & 15;
        const cellY = row & 15;
        const offset = (blockId << 9) + (((cellX + (cellY << 4)) << 1));
        const flags = zoneBmd[offset] ?? 0;
        const lowTileId = zoneBmd[offset + 1] ?? 0;
        const highTileId = this.decodeTileHighBits(flags);
        const tileId = lowTileId + (highTileId << 8);
        const transform = this.decodeTransform(flags);

        tileRow.push({
          tileId,
          transform,
          priority: (mapLayer[tileId] ?? 0) !== 0,
          solid: tileId !== 0 && (zoneBlt[tileId] ?? 0) !== 0,
        });
      }

      tiles.push(tileRow);
    }

    return {
      tiles,
      width: columns * 12,
      height: rows * 12,
      columns,
      rows,
    };
  }

  private decodeTileHighBits(flags: number): number {
    if ((flags & 1) === 1) {
      return 1;
    }

    if ((flags & 3) === 2) {
      return 2;
    }

    return 0;
  }

  private decodeTransform(flags: number): number {
    const transformBits = (flags >> 3) & 3;
    if (transformBits === 1) {
      return transforms[4];
    }

    if (transformBits === 2) {
      return transforms[6];
    }

    if (transformBits === 3) {
      return transforms[2];
    }

    return transforms[0];
  }

  private parseJavaInt3D(data: Uint8Array): number[][][] {
    let offset = 0;

    const readInt = () => {
      const value = readInt32BE(data, offset);
      offset += 4;
      return value;
    };

    const readIntArray = () => {
      const length = readInt();
      const values: number[] = [];
      for (let index = 0; index < length; index += 1) {
        values.push(readInt());
      }

      return values;
    };

    const readIntArray2D = () => {
      const length = readInt();
      const values: number[][] = [];
      for (let index = 0; index < length; index += 1) {
        values.push(readIntArray());
      }

      return values;
    };

    const length = readInt();
    const values: number[][][] = [];
    for (let index = 0; index < length; index += 1) {
      values.push(readIntArray2D());
    }

    return values;
  }
}
