export const KEY_UP = 1;
export const KEY_LEFT = 2;
export const KEY_RIGHT = 5;
export const KEY_DOWN = 6;
export const KEY_FIRE = 8;
export const KEY_PAUSE = 10;

const keyAliases: Readonly<Record<string, number>> = {
  up: KEY_UP,
  left: KEY_LEFT,
  right: KEY_RIGHT,
  down: KEY_DOWN,
  fire: KEY_FIRE,
  pause: KEY_PAUSE,
};

const keyMap: Readonly<Record<string, number>> = {
  ArrowLeft: KEY_LEFT,
  ArrowRight: KEY_RIGHT,
  ArrowUp: KEY_UP,
  ArrowDown: KEY_DOWN,
  Enter: KEY_FIRE,
  Space: KEY_FIRE,
  KeyZ: KEY_FIRE,
  Escape: KEY_PAUSE,
};

export function mapKeyboardCode(code: string): number | null {
  return keyMap[code] ?? null;
}

export function mapKeyAlias(alias: string): number | null {
  return keyAliases[alias] ?? null;
}
