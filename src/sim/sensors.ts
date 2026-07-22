import type { Detection, Modality, TargetClass, TruthEntity, TruthKind } from "@/types/domain";
import { MODALITIES } from "@/types/domain";
import type { Rng } from "@/sim/rng";

/**
 * Synthetic multi-sensor harness: EO, IR, RADAR, RF.
 *
 * The decoy signature is baked into the detection-probability table:
 * decoys present strongly to EO/IR, weakly to RADAR, and never to RF —
 * a multi-spectral decoy has no control link to emit on.
 */

interface ModalityProfile {
  /** Detections per second against one entity of the given kind. */
  ratePerSec: Record<TruthKind, number>;
  /** 1-sigma position noise, meters. */
  sigma: number;
  /** Base confidence and spread. */
  conf: number;
  confSpread: number;
  /** Probability the sensor reports the correct coarse class. */
  classAccuracy: number;
}

export const SENSOR_PROFILES: Record<Modality, ModalityProfile> = {
  EO: {
    ratePerSec: { "hostile-uas": 0.55, decoy: 0.6, "civilian-vehicle": 0.5 },
    sigma: 12,
    conf: 0.82,
    confSpread: 0.1,
    classAccuracy: 0.85,
  },
  IR: {
    ratePerSec: { "hostile-uas": 0.5, decoy: 0.55, "civilian-vehicle": 0.35 },
    sigma: 18,
    conf: 0.74,
    confSpread: 0.12,
    classAccuracy: 0.75,
  },
  RADAR: {
    ratePerSec: { "hostile-uas": 0.45, decoy: 0.12, "civilian-vehicle": 0.4 },
    sigma: 26,
    conf: 0.68,
    confSpread: 0.14,
    classAccuracy: 0.6,
  },
  RF: {
    ratePerSec: { "hostile-uas": 0.5, decoy: 0, "civilian-vehicle": 0.18 },
    sigma: 42,
    conf: 0.7,
    confSpread: 0.15,
    classAccuracy: 0.65,
  },
};

const TRUE_CLASS: Record<TruthKind, TargetClass> = {
  "hostile-uas": "uas",
  decoy: "uas", // A good decoy *looks like* a UAS to imaging sensors.
  "civilian-vehicle": "vehicle",
};

const MISCLASS_POOL: TargetClass[] = ["uas", "vehicle", "person", "unknown"];

let detSeq = 0;

/** Reset the detection id counter (used when the engine resets). */
export function resetDetectionSeq(): void {
  detSeq = 0;
}

export function generateDetections(
  truth: TruthEntity[],
  t: number,
  dt: number,
  rng: Rng,
): Detection[] {
  const out: Detection[] = [];
  for (const e of truth) {
    if (!e.alive) continue;
    for (const modality of MODALITIES) {
      const profile = SENSOR_PROFILES[modality];
      const p = profile.ratePerSec[e.kind] * dt;
      if (p <= 0 || !rng.chance(p)) continue;

      const trueClass = TRUE_CLASS[e.kind];
      const reportedClass = rng.chance(profile.classAccuracy)
        ? trueClass
        : MISCLASS_POOL[Math.floor(rng.range(0, MISCLASS_POOL.length))];

      detSeq += 1;
      out.push({
        id: detSeq,
        sensorId: `${modality.toLowerCase()}-01`,
        modality,
        pos: {
          x: e.pos.x + rng.gaussian() * profile.sigma,
          y: e.pos.y + rng.gaussian() * profile.sigma,
        },
        sigma: profile.sigma,
        confidence: Math.min(0.99, Math.max(0.2, profile.conf + rng.gaussian() * profile.confSpread)),
        targetClass: reportedClass,
        t,
      });
    }
  }
  return out;
}
