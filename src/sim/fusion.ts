import type { Detection, Modality, Track } from "@/types/domain";
import { MODALITIES } from "@/types/domain";
import { add, clamp, dist, logit, scale, sigmoid, sub } from "@/sim/geo";

/**
 * Track fusion:
 *  - association through a 3-sigma Mahalanobis-style gate with a motion-aware spatial floor
 *  - inverse-variance position fusion
 *  - log-odds Bayesian confidence update weighted by per-modality reliability priors
 */

export const RELIABILITY_PRIOR: Record<Modality, number> = {
  EO: 1.0,
  IR: 0.9,
  RADAR: 0.8,
  RF: 1.1, // An emitter fix is the strongest single cue that something is real.
};

const GATE_SIGMAS = 3;
/** Minimum gate radius so slow-updating tracks still associate. */
const BASE_FLOOR_M = 25;
/** The floor widens with track speed: fast movers outrun their last fix. */
const FLOOR_SPEED_GAIN = 1.5;
/** Uncertainty growth for unseen tracks, m/s. */
const PROCESS_NOISE = 2.5;
const MAX_SIGMA = 80;
const LOG_ODDS_STEP = 0.35;
const MAX_LOG_ODDS = 6;
/** Tracks unseen this long are dropped. */
export const STALE_DROP_S = 15;

let trackSeq = 0;

export function resetTrackSeq(): void {
  trackSeq = 0;
}

function emptyEvidence(): Track["evidence"] {
  const out = {} as Track["evidence"];
  for (const m of MODALITIES) {
    out[m] = { hits: 0, lastSeen: -1, meanConfidence: 0 };
  }
  return out;
}

export function newTrack(det: Detection): Track {
  trackSeq += 1;
  const track: Track = {
    id: `T-${trackSeq}`,
    pos: det.pos,
    velocity: { x: 0, y: 0 },
    sigma: det.sigma,
    logOdds: logit(0.5),
    confidence: 0.5,
    targetClass: det.targetClass,
    firstSeen: det.t,
    lastSeen: det.t,
    hits: 0,
    evidence: emptyEvidence(),
    threat: {
      classThreat: 0,
      kinematicRisk: 0,
      disagreement: 0,
      confidence: 0.5,
      score: 0,
      band: "GREEN",
    },
    decoySuspect: false,
    resolution: null,
  };
  applyDetection(track, det);
  return track;
}

/** Predicted position of a track at time t (constant-velocity extrapolation). */
export function predictPos(track: Track, t: number) {
  const dt = Math.max(0, t - track.lastSeen);
  return add(track.pos, scale(track.velocity, dt));
}

/**
 * Normalized association distance: Euclidean innovation over the combined
 * 1-sigma uncertainty, floored by the motion-aware spatial minimum.
 * A detection associates when the result is <= GATE_SIGMAS.
 */
export function associationDistance(track: Track, det: Detection): number {
  const predicted = predictPos(track, det.t);
  const innovation = dist(predicted, det.pos);
  const combined = Math.hypot(track.sigma, det.sigma);
  const speed = Math.hypot(track.velocity.x, track.velocity.y);
  const floor = BASE_FLOOR_M + FLOOR_SPEED_GAIN * speed;
  const effective = Math.max(combined, floor / GATE_SIGMAS);
  return innovation / effective;
}

/** Minimum baseline for a velocity estimate; shorter baselines amplify position noise. */
const VEL_BASELINE_S = 0.5;

export function applyDetection(track: Track, det: Detection): void {
  // Inverse-variance fusion of predicted track position and the measurement.
  const predicted = predictPos(track, det.t);
  const wTrack = 1 / (track.sigma * track.sigma);
  const wDet = 1 / (det.sigma * det.sigma);
  const wSum = wTrack + wDet;
  const fused = {
    x: (predicted.x * wTrack + det.pos.x * wDet) / wSum,
    y: (predicted.y * wTrack + det.pos.y * wDet) / wSum,
  };

  // Velocity over an anchored baseline (>= VEL_BASELINE_S) — per-detection
  // displacement at 8 Hz is dominated by measurement noise.
  const anchor = (track.velAnchor ??= { pos: track.pos, t: track.lastSeen });
  const baseline = det.t - anchor.t;
  if (baseline >= VEL_BASELINE_S) {
    const vObs = scale(sub(fused, anchor.pos), 1 / baseline);
    track.velocity =
      track.hits <= 2
        ? vObs
        : {
            x: track.velocity.x * 0.6 + vObs.x * 0.4,
            y: track.velocity.y * 0.6 + vObs.y * 0.4,
          };
    track.velAnchor = { pos: fused, t: det.t };
  }

  track.pos = fused;
  track.sigma = Math.max(4, Math.sqrt(1 / wSum));
  track.lastSeen = det.t;
  track.hits += 1;

  // Log-odds confidence update, weighted by the modality reliability prior.
  const step = RELIABILITY_PRIOR[det.modality] * LOG_ODDS_STEP * logit(det.confidence);
  track.logOdds = clamp(track.logOdds + step, -MAX_LOG_ODDS, MAX_LOG_ODDS);
  track.confidence = sigmoid(track.logOdds);

  // Class vote: adopt the majority-ish class by counting weighted hits.
  const ev = track.evidence[det.modality];
  ev.meanConfidence = ev.hits === 0 ? det.confidence : ev.meanConfidence * 0.8 + det.confidence * 0.2;
  ev.hits += 1;
  ev.lastSeen = det.t;

  // Class by reliability-weighted vote — a single confident misclassification
  // must not flip an established track.
  const votes = (track.classVotes ??= {});
  votes[det.targetClass] = (votes[det.targetClass] ?? 0) + det.confidence * RELIABILITY_PRIOR[det.modality];
  let bestClass = track.targetClass;
  let bestVotes = -1;
  for (const [cls, v] of Object.entries(votes)) {
    if (cls === "unknown") continue;
    if (v !== undefined && v > bestVotes) {
      bestVotes = v;
      bestClass = cls as Detection["targetClass"];
    }
  }
  if (bestVotes > 0) track.targetClass = bestClass;
}

export interface FusionStepResult {
  created: Track[];
  dropped: Track[];
}

/** Two tracks closer than this (or their combined uncertainty) with similar velocity are duplicates. */
const MERGE_DIST_M = 50;
const MERGE_VEL_MS = 10;

export interface TrackMerge {
  absorbed: Track;
  into: Track;
}

/**
 * Track-to-track merge: noisy wide-sigma modalities (RF, RADAR) occasionally
 * spawn a duplicate track next to an established one. When two tracks agree
 * in position and velocity, the one with more evidence absorbs the other.
 */
export function mergeTracks(tracks: Track[]): TrackMerge[] {
  const merges: TrackMerge[] = [];
  for (let i = 0; i < tracks.length; i++) {
    for (let j = tracks.length - 1; j > i; j--) {
      const a = tracks[i];
      const b = tracks[j];
      const gate = Math.max(MERGE_DIST_M, 1.5 * Math.hypot(a.sigma, b.sigma));
      if (dist(a.pos, b.pos) > gate) continue;
      const dv = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
      if (dv > MERGE_VEL_MS) continue;

      const [keep, drop] = b.hits > a.hits ? [b, a] : [a, b];

      const wk = 1 / (keep.sigma * keep.sigma);
      const wd = 1 / (drop.sigma * drop.sigma);
      keep.pos = {
        x: (keep.pos.x * wk + drop.pos.x * wd) / (wk + wd),
        y: (keep.pos.y * wk + drop.pos.y * wd) / (wk + wd),
      };
      keep.sigma = Math.max(4, Math.sqrt(1 / (wk + wd)));
      keep.hits += drop.hits;
      keep.firstSeen = Math.min(keep.firstSeen, drop.firstSeen);
      keep.lastSeen = Math.max(keep.lastSeen, drop.lastSeen);
      keep.logOdds = clamp(keep.logOdds + 0.5 * drop.logOdds, -MAX_LOG_ODDS, MAX_LOG_ODDS);
      keep.confidence = sigmoid(keep.logOdds);
      for (const m of MODALITIES) {
        const ke = keep.evidence[m];
        const de = drop.evidence[m];
        if (de.hits > 0) {
          ke.meanConfidence =
            ke.hits === 0 ? de.meanConfidence : (ke.meanConfidence * ke.hits + de.meanConfidence * de.hits) / (ke.hits + de.hits);
          ke.hits += de.hits;
          ke.lastSeen = Math.max(ke.lastSeen, de.lastSeen);
        }
      }
      if (drop.classVotes) {
        const votes = (keep.classVotes ??= {});
        for (const [cls, v] of Object.entries(drop.classVotes)) {
          if (v !== undefined) {
            votes[cls as Track["targetClass"]] = (votes[cls as Track["targetClass"]] ?? 0) + v;
          }
        }
      }
      if (drop.resolution && !keep.resolution) keep.resolution = drop.resolution;

      tracks[i] = keep;
      tracks.splice(j, 1);
      merges.push({ absorbed: drop, into: keep });
    }
  }
  return merges;
}

/**
 * One fusion step: associate each detection with the nearest gated track
 * (greedy nearest-neighbor), create tracks for the rest, age and drop stale tracks.
 */
export function fuseDetections(tracks: Track[], detections: Detection[], t: number, dt: number): FusionStepResult {
  const created: Track[] = [];

  for (const det of detections) {
    let best: Track | null = null;
    let bestD = Infinity;
    for (const track of tracks) {
      const d = associationDistance(track, det);
      if (d < bestD) {
        bestD = d;
        best = track;
      }
    }
    if (best && bestD <= GATE_SIGMAS) {
      applyDetection(best, det);
    } else {
      const track = newTrack(det);
      tracks.push(track);
      created.push(track);
    }
  }

  // Age unseen tracks: grow uncertainty, decay confidence toward neutral.
  for (const track of tracks) {
    if (t - track.lastSeen > 0.01) {
      track.sigma = Math.min(MAX_SIGMA, track.sigma + PROCESS_NOISE * dt);
      track.logOdds *= 1 - 0.03 * dt;
      track.confidence = sigmoid(track.logOdds);
    }
  }

  const dropped = tracks.filter((tr) => t - tr.lastSeen > STALE_DROP_S);
  if (dropped.length > 0) {
    const dropIds = new Set(dropped.map((d) => d.id));
    for (let i = tracks.length - 1; i >= 0; i--) {
      if (dropIds.has(tracks[i].id)) tracks.splice(i, 1);
    }
  }

  return { created, dropped };
}
