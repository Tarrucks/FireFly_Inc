import type { Band, Modality } from "@/types/domain";

/**
 * Validated dark-surface palette roles (see src/index.css).
 * Status colors are always paired with a text label or map shape —
 * color never carries meaning alone.
 */
export const BAND_COLOR: Record<Band, string> = {
  RED: "var(--band-red)",
  YELLOW: "var(--band-yellow)",
  GREEN: "var(--band-green)",
};

export const BAND_LABEL: Record<Band, string> = {
  RED: "RED · ENGAGE",
  YELLOW: "YELLOW · VERIFY",
  GREEN: "GREEN · CLEAR",
};

export const MODALITY_COLOR: Record<Modality, string> = {
  EO: "var(--mod-eo)",
  IR: "var(--mod-ir)",
  RADAR: "var(--mod-radar)",
  RF: "var(--mod-rf)",
};

export const BLUE_FORCE = "var(--blue-force)";
export const DECOY_FLAG = "var(--decoy-flag)";
