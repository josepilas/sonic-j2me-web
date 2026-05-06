export function readUint16BE(data: Uint8Array, offset: number): number {
  return (data[offset] << 8) | data[offset + 1];
}

export function readInt16BE(data: Uint8Array, offset: number): number {
  const value = readUint16BE(data, offset);
  return value & 0x8000 ? value - 0x10000 : value;
}

export function readUint32BE(data: Uint8Array, offset: number): number {
  return (
    (data[offset] * 0x1000000)
    + ((data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3])
  ) >>> 0;
}

export function readInt32BE(data: Uint8Array, offset: number): number {
  const value = readUint32BE(data, offset);
  return value > 0x7fffffff ? value - 0x100000000 : value;
}
