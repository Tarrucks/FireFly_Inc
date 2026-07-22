import { describe, expect, it } from "vitest";
import type { Track, TruthEntity } from "@/types/domain";
import {
  idleDrone,
  ORBIT_DURATION_S,
  recallDrone,
  stepDrone,
  taskDrone,
  type DroneStepResult,
} from "@/sim/drone";
import { dist } from "@/sim/geo";

function makeTrack(x: number, y: number): Track {
  return {
    id: "T-1",
    pos: { x, y },
    velocity: { x: 0, y: 0 },
    sigma: 10,
    logOdds: 1,
    confidence: 0.7,
    targetClass: "uas",
    firstSeen: 0,
    lastSeen: 0,
    hits: 5,
    evidence: {
      EO: { hits: 3, lastSeen: 0, meanConfidence: 0.8 },
      IR: { hits: 3, lastSeen: 0, meanConfidence: 0.8 },
      RADAR: { hits: 0, lastSeen: -1, meanConfidence: 0 },
      RF: { hits: 0, lastSeen: -1, meanConfidence: 0 },
    },
    threat: { classThreat: 0.9, kinematicRisk: 0, disagreement: 1, confidence: 0.7, score: 0.5, band: "YELLOW" },
    decoySuspect: true,
    resolution: null,
  };
}

const DT = 0.25;

function runUntil(
  drone: ReturnType<typeof idleDrone>,
  tracks: Track[],
  truth: TruthEntity | null,
  predicate: (r: DroneStepResult) => boolean,
  maxSteps = 600,
): DroneStepResult | null {
  for (let i = 0; i < maxSteps; i++) {
    const r = stepDrone(drone, DT, tracks, () => truth);
    if (predicate(r)) return r;
  }
  return null;
}

describe("drone state machine", () => {
  it("runs the full ENROUTE → ORBIT → RESOLVE → RTB → IDLE cycle", () => {
    const drone = idleDrone();
    const track = makeTrack(400, 0);
    taskDrone(drone, track);
    expect(drone.phase).toBe("ENROUTE");

    const orbit = runUntil(drone, [track], null, (r) => r.phaseChanged === "ORBIT");
    expect(orbit).not.toBeNull();
    expect(drone.phase).toBe("ORBIT");

    const resolvedAt = runUntil(drone, [track], null, (r) => r.resolved !== undefined);
    expect(resolvedAt).not.toBeNull();
    expect(drone.phase).toBe("RTB");

    const idle = runUntil(drone, [track], null, (r) => r.phaseChanged === "IDLE");
    expect(idle).not.toBeNull();
    expect(dist(drone.pos, { x: 0, y: 0 })).toBeLessThan(15);
  });

  it("orbits for the full verification duration before resolving", () => {
    const drone = idleDrone();
    const track = makeTrack(300, 0);
    taskDrone(drone, track);
    runUntil(drone, [track], null, (r) => r.phaseChanged === "ORBIT");

    let orbitTime = 0;
    let resolved: DroneStepResult | null = null;
    for (let i = 0; i < 600 && !resolved; i++) {
      const r = stepDrone(drone, DT, [track], () => null);
      orbitTime += DT;
      if (r.resolved) resolved = r;
    }
    expect(resolved).not.toBeNull();
    expect(orbitTime).toBeGreaterThanOrEqual(ORBIT_DURATION_S);
  });

  it("confirms a decoy when ground truth at the orbit point is a decoy", () => {
    const drone = idleDrone();
    const track = makeTrack(350, 100);
    const truth: TruthEntity = {
      id: "E-1",
      kind: "decoy",
      pos: { x: 350, y: 100 },
      vel: { x: 0, y: 0 },
      spawnedAt: 0,
      alive: true,
    };
    taskDrone(drone, track);
    const resolved = runUntil(drone, [track], truth, (r) => r.resolved !== undefined);
    expect(resolved?.resolved?.resolution).toBe("confirmed-decoy");
  });

  it("confirms hostile when ground truth is a real threat", () => {
    const drone = idleDrone();
    const track = makeTrack(350, 100);
    const truth: TruthEntity = {
      id: "E-2",
      kind: "hostile-uas",
      pos: { x: 350, y: 100 },
      vel: { x: 0, y: 0 },
      spawnedAt: 0,
      alive: true,
    };
    taskDrone(drone, track);
    const resolved = runUntil(drone, [track], truth, (r) => r.resolved !== undefined);
    expect(resolved?.resolved?.resolution).toBe("confirmed-hostile");
  });

  it("recall sends a busy drone home without resolving", () => {
    const drone = idleDrone();
    const track = makeTrack(400, 0);
    taskDrone(drone, track);
    stepDrone(drone, DT, [track], () => null);
    recallDrone(drone);
    expect(drone.phase).toBe("RTB");
    expect(drone.targetTrackId).toBeNull();
    const idle = runUntil(drone, [track], null, (r) => r.phaseChanged === "IDLE");
    expect(idle).not.toBeNull();
  });
});
