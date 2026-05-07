import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(rootDir, "public/assets/source-j2me");
const runtimeRoot = path.join(rootDir, "public/assets");
const staticDataPath = path.join(sourceRoot, "levels/maincanvas-static-data.json");

const sourceTileSize = 16;
const runtimeTileSize = 12;
const runtimeAtlasColumns = 16;

const mapAliases = [
  ["mc_zone1_map_data.bin", "mc_gh_map_data.bin"],
  ["mc_zone2_map_data.bin"],
  ["mc_zone3_map_data.bin", "mc_ma_map_data.bin"],
  ["mc_zone4_map_data.bin"],
  ["mc_zone5_map_data.bin", "mc_sy_map_data.bin"],
  ["mc_zone6_map_data.bin"],
];

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function readChunks(buffer) {
  if (!buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error("PNG signature not found");
  }

  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    const type = buffer.subarray(offset, offset + 4).toString("ascii");
    offset += 4;
    const data = buffer.subarray(offset, offset + length);
    offset += length;
    offset += 4;
    chunks.push({ type, data });
    if (type === "IEND") {
      break;
    }
  }

  return chunks;
}

function paethPredictor(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) {
    return left;
  }

  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function unfilterScanlines(inflated, width, height, bitDepth) {
  const scanlineBytes = Math.ceil((width * bitDepth) / 8);
  const rows = [];
  let offset = 0;
  let previous = new Uint8Array(scanlineBytes);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[offset++];
    const source = inflated.subarray(offset, offset + scanlineBytes);
    offset += scanlineBytes;
    const row = new Uint8Array(scanlineBytes);

    for (let x = 0; x < scanlineBytes; x += 1) {
      const left = x > 0 ? row[x - 1] : 0;
      const up = previous[x] ?? 0;
      const upperLeft = x > 0 ? previous[x - 1] : 0;
      let value = source[x];

      if (filter === 1) {
        value = (value + left) & 0xff;
      } else if (filter === 2) {
        value = (value + up) & 0xff;
      } else if (filter === 3) {
        value = (value + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        value = (value + paethPredictor(left, up, upperLeft)) & 0xff;
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter ${filter}`);
      }

      row[x] = value;
    }

    rows.push(row);
    previous = row;
  }

  return rows;
}

function paletteIndexAt(row, x, bitDepth) {
  if (bitDepth === 8) {
    return row[x];
  }

  if (bitDepth === 4) {
    const byte = row[x >> 1];
    return x % 2 === 0 ? byte >> 4 : byte & 0x0f;
  }

  if (bitDepth === 2) {
    return (row[x >> 2] >> (6 - ((x & 3) * 2))) & 0x03;
  }

  if (bitDepth === 1) {
    return (row[x >> 3] >> (7 - (x & 7))) & 0x01;
  }

  throw new Error(`Unsupported indexed PNG bit depth ${bitDepth}`);
}

function decodeIndexedPng(filePath) {
  const chunks = readChunks(fs.readFileSync(filePath));
  const ihdr = chunks.find((chunk) => chunk.type === "IHDR")?.data;
  if (!ihdr) {
    throw new Error(`PNG has no IHDR: ${filePath}`);
  }

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];
  if (colorType !== 3 || interlace !== 0) {
    throw new Error(`Only non-interlaced indexed PNGs are supported: ${filePath}`);
  }

  const paletteData = chunks.find((chunk) => chunk.type === "PLTE")?.data;
  if (!paletteData) {
    throw new Error(`Indexed PNG has no palette: ${filePath}`);
  }

  const transparency = chunks.find((chunk) => chunk.type === "tRNS")?.data;
  const idat = Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data));
  const rows = unfilterScanlines(zlib.inflateSync(idat), width, height, bitDepth);
  const pixels = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const row = rows[y];
    for (let x = 0; x < width; x += 1) {
      const paletteIndex = paletteIndexAt(row, x, bitDepth);
      const paletteOffset = paletteIndex * 3;
      const outputOffset = (y * width + x) * 4;
      pixels[outputOffset] = paletteData[paletteOffset] ?? 0;
      pixels[outputOffset + 1] = paletteData[paletteOffset + 1] ?? 0;
      pixels[outputOffset + 2] = paletteData[paletteOffset + 2] ?? 0;
      pixels[outputOffset + 3] = transparency?.[paletteIndex] ?? 255;
    }
  }

  return { width, height, pixels };
}

function makeChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodeRgbaPng(image) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const outputOffset = y * (stride + 1);
    raw[outputOffset] = 0;
    Buffer.from(image.pixels.buffer, image.pixels.byteOffset + y * stride, stride).copy(raw, outputOffset + 1);
  }

  return Buffer.concat([
    pngSignature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", zlib.deflateSync(raw)),
    makeChunk("IEND"),
  ]);
}

function nearestScale(image, targetWidth, targetHeight) {
  const pixels = new Uint8Array(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor((y * image.height) / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor((x * image.width) / targetWidth));
      const sourceOffset = (sourceY * image.width + sourceX) * 4;
      const outputOffset = (y * targetWidth + x) * 4;
      pixels[outputOffset] = image.pixels[sourceOffset];
      pixels[outputOffset + 1] = image.pixels[sourceOffset + 1];
      pixels[outputOffset + 2] = image.pixels[sourceOffset + 2];
      pixels[outputOffset + 3] = image.pixels[sourceOffset + 3];
    }
  }

  return { width: targetWidth, height: targetHeight, pixels };
}

function repackZoneAtlas(image) {
  const sourceColumns = Math.floor(image.width / sourceTileSize);
  const sourceRows = Math.floor(image.height / sourceTileSize);
  const tileCount = sourceColumns * sourceRows;
  const targetRows = Math.ceil(tileCount / runtimeAtlasColumns);
  const target = {
    width: runtimeAtlasColumns * runtimeTileSize,
    height: targetRows * runtimeTileSize,
    pixels: new Uint8Array(runtimeAtlasColumns * runtimeTileSize * targetRows * runtimeTileSize * 4),
  };

  for (let tile = 0; tile < tileCount; tile += 1) {
    const sourceTileX = (tile % sourceColumns) * sourceTileSize;
    const sourceTileY = Math.floor(tile / sourceColumns) * sourceTileSize;
    const targetTileX = (tile % runtimeAtlasColumns) * runtimeTileSize;
    const targetTileY = Math.floor(tile / runtimeAtlasColumns) * runtimeTileSize;

    for (let y = 0; y < runtimeTileSize; y += 1) {
      const sourceY = sourceTileY + Math.floor((y * sourceTileSize) / runtimeTileSize);
      for (let x = 0; x < runtimeTileSize; x += 1) {
        const sourceX = sourceTileX + Math.floor((x * sourceTileSize) / runtimeTileSize);
        const sourceOffset = (sourceY * image.width + sourceX) * 4;
        const targetOffset = ((targetTileY + y) * target.width + targetTileX + x) * 4;
        target.pixels[targetOffset] = image.pixels[sourceOffset];
        target.pixels[targetOffset + 1] = image.pixels[sourceOffset + 1];
        target.pixels[targetOffset + 2] = image.pixels[sourceOffset + 2];
        target.pixels[targetOffset + 3] = image.pixels[sourceOffset + 3];
      }
    }
  }

  return target;
}

function convertImages() {
  const sourceDir = path.join(sourceRoot, "images");
  const outputDir = path.join(runtimeRoot, "images");
  fs.mkdirSync(outputDir, { recursive: true });

  let count = 0;
  for (const name of fs.readdirSync(sourceDir).filter((candidate) => candidate.endsWith(".png"))) {
    const source = decodeIndexedPng(path.join(sourceDir, name));
    const isZoneAtlas = /^zone\d+\.png$/i.test(name);
    const image = isZoneAtlas
      ? repackZoneAtlas(source)
      : nearestScale(source, Math.max(1, Math.round(source.width * 0.75)), Math.max(1, Math.round(source.height * 0.75)));
    fs.writeFileSync(path.join(outputDir, name), encodeRgbaPng(image));
    if (isZoneAtlas) {
      const distantImage = nearestScale(
        source,
        Math.max(1, Math.round(source.width * 0.75)),
        Math.max(1, Math.round(source.height * 0.75)),
      );
      fs.writeFileSync(path.join(outputDir, `distant_${name}`), encodeRgbaPng(distantImage));
    }

    count += 1;
  }

  return count;
}

function writeInt(buffer, offset, value) {
  buffer.writeInt32BE(value | 0, offset);
}

function javaInt3DToBuffer(value) {
  const bytes = [];
  const pushInt = (number) => {
    const buffer = Buffer.alloc(4);
    writeInt(buffer, 0, number);
    bytes.push(buffer);
  };
  const push1D = (array) => {
    pushInt(array.length);
    for (const item of array) {
      pushInt(item);
    }
  };
  const push2D = (array) => {
    pushInt(array.length);
    for (const item of array) {
      push1D(item);
    }
  };

  pushInt(value.length);
  for (const item of value) {
    push2D(item);
  }

  return Buffer.concat(bytes);
}

function copyLevelBinariesAndGenerateMaps() {
  const sourceDir = path.join(sourceRoot, "levels");
  const outputDir = path.join(runtimeRoot, "levels");
  fs.mkdirSync(outputDir, { recursive: true });

  let copied = 0;
  for (const name of fs.readdirSync(sourceDir)) {
    if (/\.(act|bct|blt|bmd|scd)$/i.test(name)) {
      fs.copyFileSync(path.join(sourceDir, name), path.join(outputDir, name));
      copied += 1;
    }
  }

  const staticData = JSON.parse(fs.readFileSync(staticDataPath, "utf8"));
  const worldMapData = staticData.fields.worldMapData;
  for (let zone = 0; zone < worldMapData.length; zone += 1) {
    const payload = javaInt3DToBuffer(worldMapData[zone]);
    for (const fileName of mapAliases[zone] ?? [`mc_zone${zone + 1}_map_data.bin`]) {
      fs.writeFileSync(path.join(outputDir, fileName), payload);
    }
  }

  return copied;
}

function copyTextFiles() {
  const sourceDir = path.join(sourceRoot, "text");
  const outputDir = path.join(runtimeRoot, "text");
  fs.mkdirSync(outputDir, { recursive: true });
  let count = 0;

  for (const name of fs.readdirSync(sourceDir).filter((candidate) => candidate.endsWith(".txt"))) {
    fs.copyFileSync(path.join(sourceDir, name), path.join(outputDir, name));
    count += 1;
  }

  return count;
}

function main() {
  if (!fs.existsSync(staticDataPath)) {
    throw new Error("Run `npm run extract:sonicjar` before preparing runtime assets");
  }

  const imageCount = convertImages();
  const levelCount = copyLevelBinariesAndGenerateMaps();
  const textCount = copyTextFiles();
  console.log(`Prepared ${imageCount} images, ${levelCount} level binaries, and ${textCount} text files from source-j2me`);
}

main();
