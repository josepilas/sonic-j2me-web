export const OBJECT_RING_HORIZONTAL = 0;
export const OBJECT_RING_VERTICAL = 1;
export const OBJECT_SPRING = 2;
export const OBJECT_SWING_PLATFORM = 3;
export const OBJECT_SPIKED_BRIDGE = 4;
export const OBJECT_FALLING_BRIDGE = OBJECT_SPIKED_BRIDGE;
export const OBJECT_BRIDGE = 5;
export const OBJECT_BREAK_PLATFORM = 6;
export const OBJECT_SPIKES = 9;
export const OBJECT_SWITCH = 15;
export const OBJECT_KAMERE = 39;
export const OBJECT_HACHI = 40;
export const OBJECT_MUSI = 41;
export const OBJECT_ITEM_BOX = 42;
export const OBJECT_ITEM_BOX_STATIC = 43;
export const OBJECT_SCOLI = 47;
export const OBJECT_SCOLI_ALT = 48;
export const OBJECT_IMO = 49;
export const OBJECT_BROBO = 50;
export const OBJECT_BUTA = 51;
export const OBJECT_KANI = 57;
export const OBJECT_TEKKYU = 60;
export const OBJECT_SIGNAL = 61;
export const OBJECT_RING_DIAGONAL_UP_LEFT = 63;
export const OBJECT_RING_DIAGONAL_DOWN_RIGHT = 64;
export const OBJECT_RING_LONG_DIAGONAL = 65;
export const OBJECT_RING_SHORT_HORIZONTAL = 66;
export const OBJECT_RING_LONG_HORIZONTAL = 67;
export const OBJECT_RING_SHORT_VERTICAL = 68;
export const OBJECT_RING_LONG_VERTICAL = 69;
export const OBJECT_ARUMA = 70;
export const OBJECT_YADO = 71;
export const OBJECT_UNI = 74;
export const OBJECT_BAT = 78;
export const OBJECT_MOGURA = 81;
export const OBJECT_FISH = 86;
export const OBJECT_FISH2 = 87;
export const OBJECT_SIDE_SPRING = 153;

export const RING_PATTERN_OBJECT_TYPES = new Set<number>([
  OBJECT_RING_HORIZONTAL,
  OBJECT_RING_VERTICAL,
  OBJECT_RING_DIAGONAL_UP_LEFT,
  OBJECT_RING_DIAGONAL_DOWN_RIGHT,
  OBJECT_RING_LONG_DIAGONAL,
  OBJECT_RING_SHORT_HORIZONTAL,
  OBJECT_RING_LONG_HORIZONTAL,
  OBJECT_RING_SHORT_VERTICAL,
  OBJECT_RING_LONG_VERTICAL,
]);

export const ENEMY_OBJECT_TYPES = new Set<number>([
  OBJECT_SCOLI,
  OBJECT_SCOLI_ALT,
  OBJECT_IMO,
  OBJECT_BROBO,
  OBJECT_BUTA,
  OBJECT_KAMERE,
  OBJECT_HACHI,
  OBJECT_MUSI,
  OBJECT_KANI,
  OBJECT_ARUMA,
  OBJECT_YADO,
  OBJECT_UNI,
  OBJECT_BAT,
  OBJECT_MOGURA,
  OBJECT_FISH,
  OBJECT_FISH2,
]);

export const SOURCE_OBJECT_IMAGE_FILES: Readonly<Record<number, string>> = {
  2: "sjump.png",
  3: "buranko.png",
  4: "thashi.png",
  5: "hashi.png",
  6: "break.png",
  7: "yuka.png",
  8: "turi.png",
  9: "toge.png",
  10: "item.png",
  11: "fblock.png",
  12: "masin.png",
  13: "yogan2.png",
  14: "myogan.png",
  15: "switch2.png",
  16: "shima.png",
  17: "dai2.png",
  18: "brkabe.png",
  19: "pedal.png",
  20: "break.png",
  21: "step.png",
  22: "fun.png",
  23: "sisoo.png",
  24: "beltcon.png",
  25: "paka2.png",
  26: "fire6.png",
  27: "bryuka.png",
  28: "mawaru.png",
  29: "yukai.png",
  30: "door.png",
  31: "yukae.png",
  32: "dai4.png",
  33: "ele.png",
  34: "beltc.png",
  35: "noko.png",
  36: "save.png",
  37: "kageb.png",
  38: "block.png",
  39: "kamere.png",
  40: "hachi.png",
  41: "musi.png",
  42: "item.png",
  43: "item.png",
  44: "gole.png",
  45: "bten.png",
  46: "bten.png",
  47: "imo.png",
  48: "imo.png",
  49: "imo.png",
  50: "brobo.png",
  51: "buta.png",
  52: "masin.png",
  53: "masin.png",
  54: "dai.png",
  55: "masin.png",
  56: "bobin.png",
  57: "kani.png",
  58: "jyama.png",
  59: "tama.png",
  60: "tekyu.png",
  61: "signal.png",
  62: "dai2.png",
  70: "aruma.png",
  71: "yado.png",
  72: "elev.png",
  73: "elev.png",
  74: "uni.png",
  75: "mfire.png",
  76: "yoganc.png",
  77: "yoganc.png",
  78: "bat.png",
  79: "ochi.png",
  80: "yari.png",
  81: "mogura.png",
  82: "kazari.png",
  83: "dai3.png",
  84: "mizu.png",
  85: "awa.png",
  86: "fish.png",
  87: "fish2.png",
  88: "kassya.png",
  89: "shima5.png",
  90: "shima5.png",
  91: "bou.png",
  92: "ben.png",
  93: "ben.png",
};

export const FRAME_DATA_ALIASES: Readonly<Record<number, number>> = {
  47: 49,
  48: 49,
};

export const BOTTOM_ANCHORED_OBJECT_TYPES = new Set<number>([
  OBJECT_BREAK_PLATFORM,
  OBJECT_SPIKES,
  10,
  11,
  13,
  OBJECT_SWITCH,
  16,
  17,
  18,
  20,
  21,
  22,
  30,
  31,
  32,
  33,
  34,
  35,
  36,
  37,
  38,
  OBJECT_ITEM_BOX,
  OBJECT_ITEM_BOX_STATIC,
  44,
  45,
  46,
  54,
  56,
  58,
  59,
  61,
  62,
  72,
  73,
  75,
  76,
  77,
  79,
  80,
  82,
  83,
  84,
  85,
  88,
  89,
  90,
  91,
  92,
  93,
]);

export function isRingPatternObjectType(type: number): boolean {
  return RING_PATTERN_OBJECT_TYPES.has(type);
}

export function isEnemyObjectType(type: number): boolean {
  return ENEMY_OBJECT_TYPES.has(type);
}

export function isSpringObjectType(type: number): boolean {
  return type === OBJECT_SPRING || type === OBJECT_SIDE_SPRING;
}

export function isBridgeObjectType(type: number): boolean {
  return type === OBJECT_BRIDGE || type === OBJECT_SPIKED_BRIDGE;
}

export function isItemBoxObjectType(type: number): boolean {
  return type === OBJECT_ITEM_BOX || type === OBJECT_ITEM_BOX_STATIC;
}

export function getFrameDataType(type: number): number {
  return FRAME_DATA_ALIASES[type] ?? type;
}

export function isBottomAnchoredObjectType(type: number): boolean {
  return BOTTOM_ANCHORED_OBJECT_TYPES.has(type);
}

export function expandRingPatternPosition(
  type: number,
  x: number,
  y: number,
  instanceIndex: number,
): { x: number; y: number } {
  switch (type) {
    case OBJECT_RING_HORIZONTAL:
      return { x: x + instanceIndex * 24, y };
    case OBJECT_RING_VERTICAL:
      return { x, y: y + instanceIndex * 24 };
    case OBJECT_RING_DIAGONAL_UP_LEFT:
      return { x: x - instanceIndex * 16, y: y + instanceIndex * 16 };
    case OBJECT_RING_DIAGONAL_DOWN_RIGHT:
      return { x: x + instanceIndex * 16, y: y + instanceIndex * 16 };
    case OBJECT_RING_LONG_DIAGONAL:
      return { x: x + instanceIndex * 32, y: y + instanceIndex * 32 };
    case OBJECT_RING_SHORT_HORIZONTAL:
      return { x: x + instanceIndex * 16, y };
    case OBJECT_RING_LONG_HORIZONTAL:
      return { x: x + instanceIndex * 32, y };
    case OBJECT_RING_SHORT_VERTICAL:
      return { x, y: y + instanceIndex * 16 };
    case OBJECT_RING_LONG_VERTICAL:
      return { x, y: y + instanceIndex * 32 };
    default:
      return { x, y };
  }
}
