import type { Drone, Track, TruthEntity } from "@/types/domain";
import { add, dist, norm, scale, sub } from "@/sim/geo";

/**
 * Drone verification state machine, stepped at 4 Hz:
 * IDLE → ENROUTE (fly to the target's snapshot coordinates)
 *      → ORBIT (200 m ring, 15 s)
 *      → RESOLVE (band the contact RED or GREEN)
 *      → RTB → IDLE
 */

export const ORBIT_RADIUS_M = 200;
export const ORBIT_DURATION_S = 15;
export const ENROUTE_SPEED = 30;
export const RTB_SPEED = 34;
const ARRIVE_EPS = 12;

export function idleDrone(): Drone {
  return {
    pos: { x: 0, y: 0 },
    phase: "IDLE",
    targetTrackId: null,
    targetPos: null,
    orbitElapsed: 0,
    orbitAngle: 0,
    headingDeg: 0,
  };
}

export function taskDrone(drone: Drone, track: Track): void {
  drone.phase = "ENROUTE";
  drone.targetTrackId = track.id;
  // Snapshot coordinates at tasking time — the drone does not chase.
  drone.targetPos = { ...track.pos };
  drone.orbitElapsed = 0;
}

export function recallDrone(drone: Drone): void {
  drone.phase = drone.phase === "IDLE" ? "IDLE" : "RTB";
  drone.targetTrackId = null;
  drone.targetPos = null;
}

export interface DroneStepResult {
  /**
   * Set on the tick the drone completes its orbit. "inconclusive" means no
   * ground-truth entity remained near the snapshot point — the contact
   * departed during the flight — and the track's band must stay unchanged.
   */
  resolved?: { trackId: string; resolution: "confirmed-hostile" | "confirmed-decoy" | "inconclusive" };
  phaseChanged?: Drone["phase"];
}

function headingOf(v: { x: number; y: number }): number {
  return ((Math.atan2(v.x, v.y) * 180) / Math.PI + 360) % 360;
}

/**
 * Advance the drone by dt seconds. `truthNear` resolves ground truth for the
 * verification verdict: the engine passes the nearest live truth entity to the
 * orbited point (or null), keeping this module pure and testable.
 */
export function stepDrone(
  drone: Drone,
  dt: number,
  tracks: Track[],
  truthNear: (pos: { x: number; y: number }) => TruthEntity | null,
): DroneStepResult {
  const result: DroneStepResult = {};

  if (drone.phase === "ENROUTE") {
    if (!drone.targetPos) {
      drone.phase = "RTB";
      return { phaseChanged: "RTB" };
    }
    const standoff = dist(drone.pos, drone.targetPos);
    if (standoff <= ORBIT_RADIUS_M + ARRIVE_EPS) {
      drone.phase = "ORBIT";
      drone.orbitElapsed = 0;
      const rel = sub(drone.pos, drone.targetPos);
      drone.orbitAngle = Math.atan2(rel.y, rel.x);
      return { phaseChanged: "ORBIT" };
    }
    const dir = norm(sub(drone.targetPos, drone.pos));
    drone.pos = add(drone.pos, scale(dir, ENROUTE_SPEED * dt));
    drone.headingDeg = headingOf(dir);
  } else if (drone.phase === "ORBIT") {
    if (!drone.targetPos) {
      drone.phase = "RTB";
      return { phaseChanged: "RTB" };
    }
    drone.orbitElapsed += dt;
    const omega = ENROUTE_SPEED / ORBIT_RADIUS_M;
    drone.orbitAngle += omega * dt;
    drone.pos = {
      x: drone.targetPos.x + Math.cos(drone.orbitAngle) * ORBIT_RADIUS_M,
      y: drone.targetPos.y + Math.sin(drone.orbitAngle) * ORBIT_RADIUS_M,
    };
    drone.headingDeg = headingOf({
      x: -Math.sin(drone.orbitAngle),
      y: Math.cos(drone.orbitAngle),
    });
    if (drone.orbitElapsed >= ORBIT_DURATION_S) {
      drone.phase = "RESOLVE";
      return { phaseChanged: "RESOLVE" };
    }
  } else if (drone.phase === "RESOLVE") {
    const track = tracks.find((tr) => tr.id === drone.targetTrackId);
    if (track && drone.targetPos) {
      const truth = truthNear(drone.targetPos);
      // Absence of evidence is not confirmation: with nothing observable at
      // the snapshot point, the pass is inconclusive.
      const resolution =
        truth === null ? "inconclusive" : truth.kind === "decoy" ? "confirmed-decoy" : "confirmed-hostile";
      result.resolved = { trackId: track.id, resolution };
    }
    drone.phase = "RTB";
    drone.targetTrackId = null;
    drone.targetPos = null;
    result.phaseChanged = "RTB";
  } else if (drone.phase === "RTB") {
    const home = { x: 0, y: 0 };
    if (dist(drone.pos, home) <= ARRIVE_EPS) {
      drone.pos = home;
      drone.phase = "IDLE";
      return { ...result, phaseChanged: "IDLE" };
    }
    const dir = norm(sub(home, drone.pos));
    drone.pos = add(drone.pos, scale(dir, RTB_SPEED * dt));
    drone.headingDeg = headingOf(dir);
  }

  return result;
}
