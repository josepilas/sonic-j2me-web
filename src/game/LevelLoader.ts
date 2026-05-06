import { ResourceLoader } from "../platform/j2me/ResourceLoader";
import { transforms } from "../data/transforms";
import { readInt32BE, readUint16BE } from "../utils/binary";

export interface LevelTile {
  tileId: number;
  transform: number;
  priority: boolean;
  solid: boolean;
  collisionMask: number;
  collisionTransform: number;
  collisionA: boolean;
  collisionB: boolean;
}

export interface DecodedLevel {
  tiles: LevelTile[][];
  collisionMasks: Uint8Array<ArrayBufferLike>;
  width: number;
  height: number;
  columns: number;
  rows: number;
}

export interface LevelObject {
  type: number;
  x: number;
  y: number;
  param: number;
  count: number;
  sourceIndex: number;
  instanceIndex: number;
  ring: boolean;
}

export class LevelLoader {
  private readonly resources = new ResourceLoader();

  async loadLevelBinary(name: string): Promise<Uint8Array> {
    return this.resources.loadBinary(`/assets/levels/${name}`);
  }

  async loadGreenHillAct(actID: number): Promise<DecodedLevel> {
    const [mapData, zoneBmd, zoneBlt, mapLayer, collisionMasks] = await Promise.all([
      this.loadLevelBinary("mc_gh_map_data.bin"),
      this.loadLevelBinary("zone1.bmd"),
      this.loadLevelBinary("zone1.blt"),
      this.loadLevelBinary("MapLzone1.blt"),
      this.loadLevelBinary("blkcol.bct"),
    ]);

    const maps = this.parseJavaInt3D(mapData);
    const blockMap = maps[actID] ?? maps[0];
    return this.decodeBlockTilemap(blockMap, zoneBmd, zoneBlt, mapLayer, collisionMasks);
  }

  async loadFrameData(): Promise<number[][][]> {
    return this.parseJavaInt3D(await this.loadLevelBinary("framedata.bin"));
  }

  async loadGreenHillObjects(actID: number): Promise<LevelObject[]> {
    const actData = await this.loadLevelBinary("ZONE1ACT.act");
    const chunks = this.parseActChunks(actData);
    const chunk = chunks[Math.min(Math.max(actID, 0), chunks.length - 1)] ?? chunks[0] ?? new Uint8Array();
    return this.decodeActObjects(chunk);
  }

  private parseActChunks(data: Uint8Array): Uint8Array[] {
    const lengths = [
      readUint16BE(data, 0),
      readUint16BE(data, 2),
      readUint16BE(data, 4),
      readUint16BE(data, 6),
    ];
    let offset = 8;
    return lengths.map((length) => {
      const chunk = data.slice(offset, offset + length);
      offset += length;
      return chunk;
    });
  }

  private decodeActObjects(chunk: Uint8Array): LevelObject[] {
    const objects: LevelObject[] = [];
    const records = Math.floor(chunk.length / 7);

    for (let sourceIndex = 0; sourceIndex < records; sourceIndex += 1) {
      const offset = sourceIndex * 7;
      const baseX = ((chunk[offset] ?? 0) << 8) | (chunk[offset + 1] ?? 0);
      const baseY = ((chunk[offset + 2] ?? 0) << 8) | (chunk[offset + 3] ?? 0);
      const param = chunk[offset + 4] ?? 0;
      const type = chunk[offset + 5] ?? 0;
      const count = chunk[offset + 6] ?? 0;
      const instances = this.isRingPatternType(type) ? count + 1 : 1;

      for (let instanceIndex = 0; instanceIndex < instances; instanceIndex += 1) {
        const position = this.expandActObjectPosition(type, baseX, baseY, instanceIndex);
        objects.push({
          type,
          x: position.x,
          y: position.y,
          param,
          count,
          sourceIndex,
          instanceIndex,
          ring: this.isRingPatternType(type),
        });
      }
    }

    return objects;
  }

  private isRingPatternType(type: number): boolean {
    return type === 0 || type === 1 || (type >= 63 && type <= 69);
  }

  private expandActObjectPosition(type: number, x: number, y: number, instanceIndex: number): { x: number; y: number } {
    switch (type) {
      case 0:
        return { x: x + instanceIndex * 24, y };
      case 1:
        return { x, y: y + instanceIndex * 24 };
      case 63:
        return { x: x - instanceIndex * 16, y: y + instanceIndex * 16 };
      case 64:
        return { x: x + instanceIndex * 16, y: y + instanceIndex * 16 };
      case 65:
        return { x: x + instanceIndex * 32, y: y + instanceIndex * 32 };
      case 66:
        return { x: x + instanceIndex * 16, y };
      case 67:
        return { x: x + instanceIndex * 32, y };
      case 68:
        return { x, y: y + instanceIndex * 16 };
      case 69:
        return { x, y: y + instanceIndex * 32 };
      default:
        return { x, y };
    }
  }

  private decodeBlockTilemap(
    blockMap: number[][],
    zoneBmd: Uint8Array,
    zoneBlt: Uint8Array,
    mapLayer: Uint8Array,
    collisionMasks: Uint8Array,
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
        const collisionMask = zoneBlt[tileId] ?? 0;
        const collisionA = ((flags >> 5) % 2) !== 0;
        const collisionB = (flags >> 5) > 1;

        tileRow.push({
          tileId,
          transform,
          priority: (mapLayer[tileId] ?? 0) !== 0,
          solid: collisionMask !== 0 && (collisionA || collisionB),
          collisionMask,
          collisionTransform: (flags >> 3) & 3,
          collisionA,
          collisionB,
        });
      }

      tiles.push(tileRow);
    }

    return {
      tiles,
      collisionMasks,
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
