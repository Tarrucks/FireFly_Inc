/**
 * Canonical domain types for the MOSAIC console simulation.
 * Positions are meters east (+x) / north (+y) relative to the operator at the origin.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export const MODALITIES = ["EO", "IR", "RADAR", "RF"] as const;
export type Modality = (typeof MODALITIES)[number];

export type TargetClass = "uas" | "ugv" | "vehicle" | "person" | "unknown";

export type Band = "RED" | "YELLOW" | "GREEN";

/** One synthetic sensor observation. */
export interface Detection {
  id: number;
  sensorId: string;
  modality: Modality;
  pos: Vec2;
  /** 1-sigma position uncertainty in meters. */
  sigma: number;
  /** Sensor-reported confidence, 0..1. */
  confidence: number;
  targetClass: TargetClass;
  t: number;
}

export interface ModalityEvidence {
  hits: number;
  lastSeen: number;
  meanConfidence: number;
}

export interface ThreatBreakdown {
  /** Weighted-sum inputs, each 0..1. */
  classThreat: number;
  kinematicRisk: number;
  /** Cross-modal disagreement (EO+IR present, RF silent): the decoy signature. */
  disagreement: number;
  confidence: number;
  /** Final weighted score, 0..1. */
  score: number;
  band: Band;
}

export type Resolution = "confirmed-hostile" | "confirmed-decoy";

export interface Track {
  id: string;
  pos: Vec2;
  velocity: Vec2;
  /** Fused 1-sigma position uncertainty in meters. */
  sigma: number;
  /** Log-odds accumulator behind `confidence`. */
  logOdds: number;
  confidence: number;
  targetClass: TargetClass;
  firstSeen: number;
  lastSeen: number;
  hits: number;
  evidence: Record<Modality, ModalityEvidence>;
  /** Reliability-weighted votes per reported class; targetClass is the argmax. */
  classVotes?: Partial<Record<TargetClass, number>>;
  /** Position/time anchor for velocity estimation over a stable baseline. */
  velAnchor?: { pos: Vec2; t: number };
  threat: ThreatBreakdown;
  /** True when the cross-modal disagreement signature is active and unresolved. */
  decoySuspect: boolean;
  /** Set once a drone verification pass resolves the track. */
  resolution: Resolution | null;
}

export type TruthKind = "hostile-uas" | "decoy" | "civilian-vehicle";

export interface TruthEntity {
  id: string;
  kind: TruthKind;
  pos: Vec2;
  vel: Vec2;
  spawnedAt: number;
  alive: boolean;
}

export type DronePhase = "IDLE" | "ENROUTE" | "ORBIT" | "RESOLVE" | "RTB";

export interface Drone {
  pos: Vec2;
  phase: DronePhase;
  targetTrackId: string | null;
  /** Snapshot of the target position taken at tasking time (drones fly to snapshot coords). */
  targetPos: Vec2 | null;
  orbitElapsed: number;
  orbitAngle: number;
  headingDeg: number;
}

export type EventSeverity = "info" | "warn" | "critical" | "success";

export interface EventItem {
  id: number;
  t: number;
  severity: EventSeverity;
  source: "FUSION" | "THREAT" | "DRONE" | "AGENT" | "COT" | "SYS";
  text: string;
}

export interface FriendlyUnit {
  id: string;
  callsign: string;
  pos: Vec2;
}

export type ObstacleKind = "minefield" | "rally" | "caution";

export interface Obstacle {
  id: string;
  kind: ObstacleKind;
  label: string;
  pos: Vec2;
  radius: number;
}

/** Structured command produced by the agent shim parser. */
export type AgentCommand =
  | { type: "TASK_DRONE"; trackId: string | null }
  | { type: "RECALL_DRONE" }
  | { type: "SITREP" }
  | { type: "FOCUS_TRACK"; trackId: string }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "SET_SPEED"; multiplier: number }
  | { type: "SPAWN"; what: "decoy-swarm" | "hostile" }
  | { type: "RESET" };

export interface CommandResult {
  ok: boolean;
  /** Which validation layer rejected the command, when not ok. */
  rejectedBy?: "intent" | "schema" | "state";
  message: string;
  sitrep?: string;
  focusTrackId?: string;
}

export interface SensorHealth {
  modality: Modality;
  /** Seconds since this modality last produced a detection. */
  sinceLast: number;
  healthy: boolean;
}
