import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format sim seconds as a mission clock, e.g. "T+03:27". */
export function missionClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `T+${mm}:${ss}`;
}

/** Bearing in degrees (0 = north, clockwise) from origin to a point in east/north meters. */
export function bearingDeg(east: number, north: number): number {
  const deg = (Math.atan2(east, north) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Compact range string in meters, e.g. "412m". */
export function rangeStr(meters: number): string {
  return `${Math.round(meters)}m`;
}
