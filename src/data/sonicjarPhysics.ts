export const MAIN_CANVAS_FIXED_SCALE = 256;
export const MAIN_CANVAS_TO_CANVAS_SCALE = 3 / 4;

export const MAIN_CANVAS_PHYSICS = {
  playerHeight: 32,
  maxSpeed: 1536,
  acceleration: 12,
  brakeAcceleration: 128,
  startAcceleration: 128,
  gravity: 56,
  jumpSpeed: 1664,
  shortJumpSpeed: 896,
  springSpeed: 4096,
  enemyBounceSpeed: 2560,
  hurtXSpeed: 512,
  hurtYSpeed: 1024,
  airTopSpeed: 4096,
} as const;

export function mainCanvasVelocityToRuntime(fixedValue: number): number {
  return (fixedValue / MAIN_CANVAS_FIXED_SCALE) * MAIN_CANVAS_TO_CANVAS_SCALE;
}

export function runtimeVelocityToMainCanvas(value: number): number {
  return (value / MAIN_CANVAS_TO_CANVAS_SCALE) * MAIN_CANVAS_FIXED_SCALE;
}
