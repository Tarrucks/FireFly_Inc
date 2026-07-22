import { beforeEach, describe, expect, it } from "vitest";
import type { Detection } from "@/types/domain";
import {
  associationDistance,
  fuseDetections,
  mergeTracks,
  newTrack,
  resetTrackSeq,
  STALE_DROP_S,
} from "@/sim/fusion";

let seq = 0;

function det(overrides: Partial<Detection> = {}): Detection {
  seq += 1;
  return {
    id: seq,
    sensorId: "eo-01",
    modality: "EO",
    pos: { x: 100, y: 100 },
    sigma: 12,
    confidence: 0.8,
    targetClass: "uas",
    t: 0,
    ...overrides,
  };
}

beforeEach(() => {
  resetTrackSeq();
  seq = 0;
});

describe("association gate", () => {
  it("associates a detection near the track", () => {
    const track = newTrack(det({ t: 0 }));
    const near = det({ pos: { x: 110, y: 95 }, t: 1 });
    expect(associationDistance(track, near)).toBeLessThanOrEqual(3);
  });

  it("rejects a detection far outside the gate", () => {
    const track = newTrack(det({ t: 0 }));
    const far = det({ pos: { x: 400, y: -300 }, t: 1 });
    expect(associationDistance(track, far)).toBeGreaterThan(3);
  });

  it("widens the gate for fast-moving tracks (motion-aware floor)", () => {
    const slow = newTrack(det({ t: 0 }));
    const fast = newTrack(det({ t: 0 }));
    fast.velocity = { x: 30, y: 0 };
    const probe = det({ pos: { x: 160, y: 100 }, t: 1 });
    // Same innovation, but the fast track's floor is wider → smaller normalized distance.
    expect(associationDistance(fast, probe)).toBeLessThan(associationDistance(slow, probe));
  });
});

describe("inverse-variance fusion", () => {
  it("pulls the fused position between prediction and measurement and shrinks sigma", () => {
    const track = newTrack(det({ t: 0 }));
    const sigmaBefore = track.sigma;
    const { created } = fuseDetections([track], [det({ pos: { x: 120, y: 100 }, t: 0.5 })], 0.5, 0.125);
    expect(created).toHaveLength(0);
    expect(track.pos.x).toBeGreaterThan(100);
    expect(track.pos.x).toBeLessThan(120);
    expect(track.sigma).toBeLessThan(sigmaBefore);
  });

  it("raises confidence through repeated high-confidence hits (log-odds update)", () => {
    const track = newTrack(det({ t: 0 }));
    const c0 = track.confidence;
    const tracks = [track];
    for (let i = 1; i <= 8; i++) {
      fuseDetections(tracks, [det({ pos: { x: 100, y: 100 }, t: i * 0.5 })], i * 0.5, 0.125);
    }
    expect(track.confidence).toBeGreaterThan(c0);
    expect(track.confidence).toBeGreaterThan(0.8);
  });
});

describe("track lifecycle", () => {
  it("creates a new track for an unassociated detection", () => {
    const track = newTrack(det({ t: 0 }));
    const tracks = [track];
    const { created } = fuseDetections(tracks, [det({ pos: { x: -400, y: 350 }, t: 1 })], 1, 0.125);
    expect(created).toHaveLength(1);
    expect(tracks).toHaveLength(2);
  });

  it("drops tracks unseen past the staleness window", () => {
    const track = newTrack(det({ t: 0 }));
    const tracks = [track];
    const { dropped } = fuseDetections(tracks, [], STALE_DROP_S + 1, 0.125);
    expect(dropped.map((d) => d.id)).toContain(track.id);
    expect(tracks).toHaveLength(0);
  });

  it("merges duplicate tracks that agree in position and velocity", () => {
    const a = newTrack(det({ t: 0 }));
    for (let i = 1; i <= 4; i++) {
      // Build up evidence so `a` is the survivor.
      fuseDetections([a], [det({ pos: { x: 100, y: 100 }, t: i * 0.5 })], i * 0.5, 0.125);
    }
    const b = newTrack(det({ pos: { x: 115, y: 105 }, modality: "RF", sigma: 42, t: 2 }));
    const tracks = [a, b];
    const merges = mergeTracks(tracks);
    expect(merges).toHaveLength(1);
    expect(merges[0].absorbed.id).toBe(b.id);
    expect(merges[0].into.id).toBe(a.id);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].evidence.RF.hits).toBe(1);
  });

  it("does not merge tracks moving in different directions", () => {
    const a = newTrack(det({ t: 0 }));
    a.velocity = { x: 12, y: 0 };
    const b = newTrack(det({ pos: { x: 110, y: 100 }, t: 0 }));
    b.velocity = { x: -12, y: 0 };
    const tracks = [a, b];
    expect(mergeTracks(tracks)).toHaveLength(0);
    expect(tracks).toHaveLength(2);
  });
});
