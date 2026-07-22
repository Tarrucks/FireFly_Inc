import type {
  AgentCommand,
  CommandResult,
  Drone,
  EventItem,
  EventSeverity,
  FriendlyUnit,
  Modality,
  Obstacle,
  SensorHealth,
  Track,
  TruthEntity,
} from "@/types/domain";
import { MODALITIES } from "@/types/domain";
import { Rng } from "@/sim/rng";
import { dist } from "@/sim/geo";
import { initialScenario, makeDecoyGroup, makeHostile, stepScenario, type ScenarioEvent } from "@/sim/scenario";
import { generateDetections, resetDetectionSeq } from "@/sim/sensors";
import { fuseDetections, mergeTracks, resetTrackSeq } from "@/sim/fusion";
import { updateThreat } from "@/sim/threat";
import { idleDrone, recallDrone, stepDrone, taskDrone } from "@/sim/drone";
import { buildSitrep } from "@/sim/sitrep";
import { parseCommand } from "@/sim/commands";

/** Fixed integration step: 8 Hz, matching the ~8 det/s synthetic feed. */
export const FIXED_DT = 0.125;
/** Drone state machine cadence: 4 Hz, as in the MOSAIC backend. */
const DRONE_DT = 0.25;
/** CoT emission period, seconds. */
const COT_PERIOD_S = 2;
const MAX_EVENTS = 250;
const MAX_SPEED = 8;
/** Truth entities farther than this from the orbit point can't resolve a track. */
const RESOLVE_RADIUS_M = 150;

export class SimEngine {
  readonly seed: number;
  private rng: Rng;

  simTime = 0;
  paused = false;
  speed = 1;

  tracks: Track[] = [];
  truth: TruthEntity[] = [];
  friendlies: FriendlyUnit[] = [];
  obstacles: Obstacle[] = [];
  drone: Drone = idleDrone();
  events: EventItem[] = [];
  cotEvents = 0;
  detectionRate = 0;
  version = 0;

  private timeline: ScenarioEvent[] = [];
  private lastDetTime: Record<Modality, number>;
  private eventSeq = 0;
  private accum = 0;
  private droneAccum = 0;
  private lastCot = 0;
  private listeners = new Set<() => void>();

  constructor(seed = 20260522) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.lastDetTime = { EO: -999, IR: -999, RADAR: -999, RF: -999 };
    this.init();
  }

  private init(): void {
    resetTrackSeq();
    resetDetectionSeq();
    const scenario = initialScenario();
    this.truth = scenario.truth;
    this.timeline = scenario.timeline;
    this.friendlies = scenario.friendlies;
    this.obstacles = scenario.obstacles;
    this.pushEvent("SYS", "info", "MOSAIC console online — synthetic multi-sensor feed active");
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  getVersion = (): number => this.version;

  private notify(): void {
    this.version += 1;
    for (const cb of this.listeners) cb();
  }

  /** Advance the simulation by real elapsed seconds (scaled by speed). */
  advance(realDt: number): void {
    if (this.paused) return;
    this.accum += Math.min(realDt, 0.5) * this.speed;
    let steps = 0;
    while (this.accum >= FIXED_DT && steps < 64) {
      this.accum -= FIXED_DT;
      this.step(FIXED_DT);
      steps += 1;
    }
    if (steps > 0) this.notify();
  }

  private step(dt: number): void {
    this.simTime += dt;

    const { spawned } = stepScenario(this.truth, this.timeline, this.simTime, dt, this.rng);
    for (const ev of spawned) {
      this.pushEvent("SYS", "warn", `Scenario: ${ev.description}`);
    }

    const detections = generateDetections(this.truth, this.simTime, dt, this.rng);
    this.detectionRate = this.detectionRate * 0.98 + (detections.length / dt) * 0.02;
    for (const d of detections) this.lastDetTime[d.modality] = this.simTime;

    const prevBand = new Map(this.tracks.map((tr) => [tr.id, tr.threat.band]));
    const prevDecoy = new Map(this.tracks.map((tr) => [tr.id, tr.decoySuspect]));

    const { created, dropped } = fuseDetections(this.tracks, detections, this.simTime, dt);
    for (const tr of created) {
      const firstModality = MODALITIES.find((m) => tr.evidence[m].hits > 0) ?? "EO";
      this.pushEvent("FUSION", "info", `New track ${tr.id} (${tr.targetClass.toUpperCase()}) via ${firstModality}`);
    }
    for (const tr of dropped) {
      this.pushEvent("FUSION", "info", `Track ${tr.id} dropped — stale`);
    }

    for (const merge of mergeTracks(this.tracks)) {
      this.pushEvent("FUSION", "info", `Track ${merge.absorbed.id} merged into ${merge.into.id}`);
      if (this.drone.targetTrackId === merge.absorbed.id) {
        this.drone.targetTrackId = merge.into.id;
      }
    }

    for (const tr of this.tracks) {
      updateThreat(tr, this.simTime);
      const prev = prevBand.get(tr.id);
      if (prev && prev !== tr.threat.band) {
        const sev: EventSeverity =
          tr.threat.band === "RED" ? "critical" : tr.threat.band === "YELLOW" ? "warn" : "success";
        this.pushEvent("THREAT", sev, `${tr.id} ${prev} → ${tr.threat.band} (score ${tr.threat.score.toFixed(2)})`);
      }
      if (prevDecoy.get(tr.id) === false && tr.decoySuspect) {
        this.pushEvent(
          "THREAT",
          "warn",
          `${tr.id} cross-modal disagreement: EO/IR track, RF silent — possible decoy, verify before engaging`,
        );
      }
    }

    this.droneAccum += dt;
    while (this.droneAccum >= DRONE_DT) {
      this.droneAccum -= DRONE_DT;
      this.stepDroneOnce();
    }

    if (this.simTime - this.lastCot >= COT_PERIOD_S) {
      this.lastCot = this.simTime;
      this.cotEvents += this.tracks.length;
    }
  }

  private stepDroneOnce(): void {
    const before = this.drone.phase;
    const result = stepDrone(this.drone, DRONE_DT, this.tracks, (pos) => this.nearestTruth(pos));

    if (result.resolved) {
      const track = this.tracks.find((tr) => tr.id === result.resolved?.trackId);
      if (track) {
        track.resolution = result.resolved.resolution;
        updateThreat(track, this.simTime);
        if (result.resolved.resolution === "confirmed-decoy") {
          this.pushEvent("DRONE", "success", `${track.id} CONFIRMED DECOY — disagreement signature verified, band GREEN`);
        } else {
          this.pushEvent("DRONE", "critical", `${track.id} CONFIRMED HOSTILE — band RED`);
        }
      }
    }

    if (result.phaseChanged && result.phaseChanged !== before) {
      if (result.phaseChanged === "ORBIT") {
        this.pushEvent("DRONE", "info", "Drone on station — 200m verification orbit (15s)");
      } else if (result.phaseChanged === "RTB") {
        this.pushEvent("DRONE", "info", "Drone RTB");
      } else if (result.phaseChanged === "IDLE") {
        this.pushEvent("DRONE", "info", "Drone recovered at operator position");
      }
    }
  }

  private nearestTruth(pos: { x: number; y: number }): TruthEntity | null {
    let best: TruthEntity | null = null;
    let bestD = RESOLVE_RADIUS_M;
    for (const e of this.truth) {
      if (!e.alive) continue;
      const d = dist(e.pos, pos);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  sensorHealth(): SensorHealth[] {
    return MODALITIES.map((m) => {
      const sinceLast = this.simTime - this.lastDetTime[m];
      return { modality: m, sinceLast, healthy: sinceLast < 6 };
    });
  }

  highestThreat(): Track | null {
    if (this.tracks.length === 0) return null;
    return [...this.tracks].sort((a, b) => b.threat.score - a.threat.score)[0];
  }

  /** Parse free text through the shim and execute the result. */
  handleText(text: string): CommandResult {
    const { command } = parseCommand(text);
    if (!command) {
      const result: CommandResult = {
        ok: false,
        rejectedBy: "intent",
        message: `No intent matched: "${text}"`,
      };
      this.pushEvent("AGENT", "warn", result.message);
      this.notify();
      return result;
    }
    return this.execute(command);
  }

  /**
   * Layers 2 (schema) and 3 (state) of the shim contract, then execution.
   */
  execute(command: AgentCommand): CommandResult {
    const result = this.executeInner(command);
    this.notify();
    return result;
  }

  private executeInner(command: AgentCommand): CommandResult {
    switch (command.type) {
      case "TASK_DRONE": {
        const track = command.trackId
          ? this.tracks.find((tr) => tr.id === command.trackId)
          : this.highestThreat();
        if (!track) {
          const message = command.trackId
            ? `Unknown track ${command.trackId}`
            : "No tracks to verify";
          this.pushEvent("AGENT", "warn", `Command rejected (schema): ${message}`);
          return { ok: false, rejectedBy: "schema", message };
        }
        if (this.drone.phase !== "IDLE") {
          const message = `Drone unavailable — ${this.drone.phase}`;
          this.pushEvent("AGENT", "warn", `Command rejected (state): ${message}`);
          return { ok: false, rejectedBy: "state", message };
        }
        if (track.resolution) {
          const message = `${track.id} already resolved (${track.resolution})`;
          this.pushEvent("AGENT", "warn", `Command rejected (state): ${message}`);
          return { ok: false, rejectedBy: "state", message };
        }
        taskDrone(this.drone, track);
        this.pushEvent("DRONE", "info", `Drone tasked to ${track.id} — flying to snapshot coordinates`);
        return { ok: true, message: `Drone enroute to ${track.id}`, focusTrackId: track.id };
      }
      case "RECALL_DRONE": {
        if (this.drone.phase === "IDLE") {
          return { ok: false, rejectedBy: "state", message: "Drone already at operator position" };
        }
        recallDrone(this.drone);
        this.pushEvent("DRONE", "info", "Drone recalled — RTB");
        return { ok: true, message: "Drone RTB" };
      }
      case "SITREP": {
        const sitrep = buildSitrep({
          t: this.simTime,
          tracks: this.tracks,
          drone: this.drone,
          detectionRate: this.detectionRate,
          cotEvents: this.cotEvents,
        });
        this.pushEvent("AGENT", "info", "SITREP generated");
        return { ok: true, message: "SITREP", sitrep };
      }
      case "FOCUS_TRACK": {
        const track = this.tracks.find((tr) => tr.id === command.trackId);
        if (!track) {
          const message = `Unknown track ${command.trackId}`;
          this.pushEvent("AGENT", "warn", `Command rejected (schema): ${message}`);
          return { ok: false, rejectedBy: "schema", message };
        }
        return { ok: true, message: `Focused ${track.id}`, focusTrackId: track.id };
      }
      case "PAUSE": {
        this.paused = true;
        this.pushEvent("SYS", "info", "Simulation paused");
        return { ok: true, message: "Paused" };
      }
      case "RESUME": {
        this.paused = false;
        this.pushEvent("SYS", "info", "Simulation resumed");
        return { ok: true, message: "Resumed" };
      }
      case "SET_SPEED": {
        if (!Number.isFinite(command.multiplier) || command.multiplier <= 0 || command.multiplier > MAX_SPEED) {
          const message = `Speed must be between 0 and ${MAX_SPEED}x`;
          this.pushEvent("AGENT", "warn", `Command rejected (schema): ${message}`);
          return { ok: false, rejectedBy: "schema", message };
        }
        this.speed = command.multiplier;
        this.pushEvent("SYS", "info", `Simulation speed ${command.multiplier}x`);
        return { ok: true, message: `Speed ${command.multiplier}x` };
      }
      case "SPAWN": {
        if (command.what === "decoy-swarm") {
          this.truth.push(...makeDecoyGroup(this.simTime, this.rng, this.rng.range(0, 360)));
          this.pushEvent("SYS", "warn", "Demo control: decoy group spawned");
        } else {
          this.truth.push(...makeHostile(this.simTime, this.rng, this.rng.range(0, 360)));
          this.pushEvent("SYS", "warn", "Demo control: hostile UAS spawned");
        }
        return { ok: true, message: `Spawned ${command.what}` };
      }
      case "RESET": {
        this.resetSim();
        return { ok: true, message: "Scenario reset" };
      }
    }
  }

  resetSim(): void {
    this.rng = new Rng(this.seed);
    this.simTime = 0;
    this.paused = false;
    this.speed = 1;
    this.tracks = [];
    this.drone = idleDrone();
    this.events = [];
    this.cotEvents = 0;
    this.detectionRate = 0;
    this.eventSeq = 0;
    this.accum = 0;
    this.droneAccum = 0;
    this.lastCot = 0;
    this.lastDetTime = { EO: -999, IR: -999, RADAR: -999, RF: -999 };
    this.init();
    this.notify();
  }

  private pushEvent(source: EventItem["source"], severity: EventSeverity, text: string): void {
    this.eventSeq += 1;
    this.events.push({ id: this.eventSeq, t: this.simTime, severity, source, text });
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
  }
}
