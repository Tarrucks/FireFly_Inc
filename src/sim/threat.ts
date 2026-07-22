import type { Band, TargetClass, Track } from "@/types/domain";
import { clamp, dot, len, norm, sub } from "@/sim/geo";

/**
 * Threat scoring: weighted sum of classification threat, kinematic risk
 * relative to the operator, and fused confidence, minus a cross-modal
 * disagreement penalty. The disagreement signature (EO and IR see it,
 * RF is silent where it should be loud) marks a suspected decoy, which
 * pins the track at YELLOW — verify before you shoot — until a drone
 * pass resolves it.
 */

export const CLASS_THREAT: Record<TargetClass, number> = {
  uas: 0.9,
  ugv: 0.8,
  vehicle: 0.5,
  person: 0.4,
  unknown: 0.6,
};

export const WEIGHTS = {
  classThreat: 0.4,
  kinematicRisk: 0.35,
  confidence: 0.25,
  disagreementPenalty: 0.25,
} as const;

export const BAND_THRESHOLDS = { red: 0.6, yellow: 0.32 } as const;

/** Speed used to normalize closing velocity, m/s. */
const MAX_CLOSING_SPEED = 25;
/** Ranges beyond this contribute no proximity risk, meters. */
const MAX_RISK_RANGE = 800;
/** Modality hit counts required before the disagreement signature can fire. */
const DISAGREEMENT_MIN_HITS = 3;
const DISAGREEMENT_MIN_AGE_S = 4;

export function kinematicRisk(track: Track): number {
  const operator = { x: 0, y: 0 };
  const toOperator = sub(operator, track.pos);
  const range = len(toOperator);
  const closing = dot(track.velocity, norm(toOperator));
  const closingTerm = clamp(closing / MAX_CLOSING_SPEED, 0, 1);
  const proximityTerm = clamp(1 - range / MAX_RISK_RANGE, 0, 1);
  return clamp(0.6 * closingTerm + 0.4 * proximityTerm, 0, 1);
}

/**
 * Cross-modal disagreement, 0..1. Fires when EO and IR both have solid
 * evidence but RF has never seen the track. A weak RADAR return sharpens
 * the call — a physical airframe with no emissions and a faint radar
 * cross-section is the canonical multi-spectral decoy.
 */
export function disagreementScore(track: Track, t: number): number {
  const { EO, IR, RADAR, RF } = track.evidence;
  if (t - track.firstSeen < DISAGREEMENT_MIN_AGE_S) return 0;
  if (EO.hits < DISAGREEMENT_MIN_HITS || IR.hits < DISAGREEMENT_MIN_HITS) return 0;
  if (RF.hits > 0) return 0;
  return RADAR.hits <= 2 ? 1 : 0.7;
}

export function bandFor(score: number): Band {
  if (score >= BAND_THRESHOLDS.red) return "RED";
  if (score >= BAND_THRESHOLDS.yellow) return "YELLOW";
  return "GREEN";
}

export function updateThreat(track: Track, t: number): void {
  const classThreat = CLASS_THREAT[track.targetClass];
  const kin = kinematicRisk(track);
  const disagreement = disagreementScore(track, t);

  const raw = clamp(
    WEIGHTS.classThreat * classThreat +
      WEIGHTS.kinematicRisk * kin +
      WEIGHTS.confidence * track.confidence -
      WEIGHTS.disagreementPenalty * disagreement,
    0,
    1,
  );
  // Exponential smoothing keeps the band from flapping when the raw score
  // hovers at a threshold (updated at 8 Hz → ~1 s time constant).
  const score = track.hits <= 2 ? raw : track.threat.score + 0.15 * (raw - track.threat.score);

  track.decoySuspect = track.resolution === null && disagreement >= 0.5;

  let band = bandFor(score);
  if (track.decoySuspect) {
    // A suspected decoy is a verification problem, not an engagement problem.
    band = "YELLOW";
  }
  // Hold RED for brand-new RF-silent tracks until RF correlation has had a
  // chance to run. This is a short hold, not a suppression: an RF-silent
  // real threat (fiber-guided, waypoint-only) can still band RED once the
  // window passes — only the full EO+IR+weak-RADAR signature pins YELLOW.
  const rfCorrelationPending =
    track.evidence.RF.hits === 0 && t - track.firstSeen < DISAGREEMENT_MIN_AGE_S + 1;
  if (band === "RED" && rfCorrelationPending && track.resolution === null) {
    band = "YELLOW";
  }
  if (track.resolution === "confirmed-hostile") band = "RED";
  if (track.resolution === "confirmed-decoy") band = "GREEN";

  track.threat = {
    classThreat,
    kinematicRisk: kin,
    disagreement,
    confidence: track.confidence,
    score,
    band,
  };
}
