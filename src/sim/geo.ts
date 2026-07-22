import type { Vec2 } from "@/types/domain";

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, k: number): Vec2 {
  return { x: a.x * k, y: a.y * k };
}

export function len(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function norm(a: Vec2): Vec2 {
  const l = len(a);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** Point at polar (bearingDeg from north clockwise, range meters) from origin. */
export function fromBearing(bearingDeg: number, range: number): Vec2 {
  const rad = (bearingDeg * Math.PI) / 180;
  return { x: Math.sin(rad) * range, y: Math.cos(rad) * range };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function logit(p: number): number {
  const c = clamp(p, 1e-4, 1 - 1e-4);
  return Math.log(c / (1 - c));
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
