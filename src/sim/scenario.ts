import type { FriendlyUnit, Obstacle, TruthEntity, Vec2 } from "@/types/domain";
import { add, dist, fromBearing, norm, scale, sub } from "@/sim/geo";
import type { Rng } from "@/sim/rng";

/**
 * Scripted demo scenario, mirroring the MOSAIC narrative:
 * a decoy group draws attention from the southwest while the real
 * swarm arrives later from the opposite vector (northeast).
 */

export interface ScenarioEvent {
  at: number;
  fired: boolean;
  description: string;
  spawn: (rng: Rng) => TruthEntity[];
}

let truthSeq = 0;

function entity(kind: TruthEntity["kind"], pos: Vec2, vel: Vec2, t: number): TruthEntity {
  truthSeq += 1;
  return { id: `E-${truthSeq}`, kind, pos, vel, spawnedAt: t, alive: true };
}

export function makeDecoyGroup(t: number, rng: Rng, bearing = 225): TruthEntity[] {
  const out: TruthEntity[] = [];
  for (let i = 0; i < 3; i++) {
    const pos = add(fromBearing(bearing + rng.range(-8, 8), rng.range(380, 440)), {
      x: rng.range(-25, 25),
      y: rng.range(-25, 25),
    });
    // Decoys drift slowly to mimic loitering aircraft without an RF control link.
    out.push(entity("decoy", pos, { x: rng.range(-1.2, 1.2), y: rng.range(-1.2, 1.2) }, t));
  }
  return out;
}

export function makeHostile(t: number, rng: Rng, bearing = 30): TruthEntity[] {
  const pos = fromBearing(bearing + rng.range(-6, 6), rng.range(460, 500));
  const inbound = scale(norm(sub({ x: 0, y: 0 }, pos)), 12);
  return [entity("hostile-uas", pos, inbound, t)];
}

export function initialScenario(): {
  truth: TruthEntity[];
  timeline: ScenarioEvent[];
  friendlies: FriendlyUnit[];
  obstacles: Obstacle[];
} {
  truthSeq = 0;
  const timeline: ScenarioEvent[] = [
    {
      at: 8,
      fired: false,
      description: "Decoy group inbound from the southwest",
      spawn: (r) => makeDecoyGroup(8, r, 225),
    },
    {
      at: 14,
      fired: false,
      description: "Civilian vehicle transiting north of the position",
      spawn: (r) =>
        [entity("civilian-vehicle", { x: -500, y: r.range(330, 370) }, { x: 13, y: 0 }, 14)],
    },
    {
      at: 24,
      fired: false,
      description: "Single UAS ingress from the north",
      spawn: (r) => makeHostile(24, r, 0),
    },
    {
      at: 100,
      fired: false,
      description: "Swarm ingress from the northeast — the vector opposite the decoys",
      spawn: (r) => [...makeHostile(100, r, 38), ...makeHostile(100, r, 46), ...makeHostile(100, r, 54)],
    },
  ];

  const friendlies: FriendlyUnit[] = [
    { id: "F-1", callsign: "REAPER 1-1", pos: { x: -190, y: -60 } },
    { id: "F-2", callsign: "REAPER 1-2", pos: { x: 175, y: -110 } },
  ];

  const obstacles: Obstacle[] = [
    { id: "O-1", kind: "minefield", label: "MINEFIELD", pos: { x: -330, y: 260 }, radius: 85 },
    { id: "O-2", kind: "rally", label: "RALLY PT BRAVO", pos: { x: 30, y: -380 }, radius: 30 },
    { id: "O-3", kind: "caution", label: "CAUTION UXO", pos: { x: 370, y: -70 }, radius: 95 },
  ];

  return { truth: [], timeline, friendlies, obstacles };
}

/** Advance ground truth one step: fire timeline spawns and move entities. */
export function stepScenario(
  truth: TruthEntity[],
  timeline: ScenarioEvent[],
  t: number,
  dt: number,
  rng: Rng,
): { spawned: ScenarioEvent[] } {
  const spawned: ScenarioEvent[] = [];
  for (const ev of timeline) {
    if (!ev.fired && t >= ev.at) {
      ev.fired = true;
      truth.push(...ev.spawn(rng));
      spawned.push(ev);
    }
  }

  for (const e of truth) {
    if (!e.alive) continue;
    if (e.kind === "hostile-uas") {
      const range = dist(e.pos, { x: 0, y: 0 });
      if (range > 240) {
        // Ingress toward the operator, with light weave.
        const dir = norm(sub({ x: 0, y: 0 }, e.pos));
        const weave = { x: -dir.y, y: dir.x };
        e.vel = add(scale(dir, 12), scale(weave, Math.sin(t * 0.5 + e.pos.x) * 3));
      } else {
        // Threatening orbit at standoff range.
        const tangent = norm({ x: -e.pos.y, y: e.pos.x });
        e.vel = scale(tangent, 11);
      }
    } else if (e.kind === "decoy") {
      // Slow drift with occasional heading change.
      if (rng.chance(0.01)) {
        e.vel = { x: rng.range(-1.2, 1.2), y: rng.range(-1.2, 1.2) };
      }
    } else if (e.kind === "civilian-vehicle") {
      if (e.pos.x > 520) e.alive = false;
    }
    e.pos = add(e.pos, scale(e.vel, dt));
  }

  return { spawned };
}
