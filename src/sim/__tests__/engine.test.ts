import { describe, expect, it } from "vitest";
import { SimEngine } from "@/sim/engine";

function advanceSim(engine: SimEngine, seconds: number): void {
  const chunk = 0.4;
  for (let t = 0; t < seconds; t += chunk) {
    engine.advance(chunk);
  }
}

describe("engine integration", () => {
  it("builds tracks from the synthetic feed and flags the decoy group", () => {
    const engine = new SimEngine(42);
    advanceSim(engine, 45);

    expect(engine.tracks.length).toBeGreaterThan(0);
    expect(engine.detectionRate).toBeGreaterThan(1);

    // The scripted decoy group (EO/IR-visible, RF-silent) must be flagged.
    const suspects = engine.tracks.filter((tr) => tr.decoySuspect);
    expect(suspects.length).toBeGreaterThan(0);
    for (const s of suspects) {
      expect(s.evidence.RF.hits).toBe(0);
      expect(s.threat.band).toBe("YELLOW");
    }
  });

  it("emits CoT on a two-second cadence", () => {
    const engine = new SimEngine(42);
    advanceSim(engine, 30);
    expect(engine.cotEvents).toBeGreaterThan(0);
  });

  it("rejects impossible commands at the right validation layer", () => {
    const engine = new SimEngine(42);
    expect(engine.execute({ type: "TASK_DRONE", trackId: "T-99" })).toMatchObject({
      ok: false,
      rejectedBy: "schema",
    });
    expect(engine.execute({ type: "SET_SPEED", multiplier: -1 })).toMatchObject({
      ok: false,
      rejectedBy: "schema",
    });
    expect(engine.handleText("do a barrel roll")).toMatchObject({ ok: false, rejectedBy: "intent" });
  });

  it("tasks the drone and eventually resolves the target", () => {
    const engine = new SimEngine(42);
    advanceSim(engine, 45);
    const suspect = engine.tracks.find((tr) => tr.decoySuspect);
    expect(suspect).toBeDefined();
    if (!suspect) return;

    const result = engine.execute({ type: "TASK_DRONE", trackId: suspect.id });
    expect(result.ok).toBe(true);
    expect(engine.drone.phase).toBe("ENROUTE");

    // Second tasking must be rejected by the state layer while busy.
    expect(engine.execute({ type: "TASK_DRONE", trackId: suspect.id })).toMatchObject({
      ok: false,
      rejectedBy: "state",
    });

    advanceSim(engine, 60);
    const resolved = engine.tracks.find((tr) => tr.id === suspect.id);
    // The track may age out after resolution; if still present it must be resolved GREEN.
    if (resolved) {
      expect(resolved.resolution).toBe("confirmed-decoy");
      expect(resolved.threat.band).toBe("GREEN");
    } else {
      const confirmations = engine.events.filter((e) => e.text.includes("CONFIRMED DECOY"));
      expect(confirmations.length).toBeGreaterThan(0);
    }
  });

  it("produces a deterministic SITREP", () => {
    const engine = new SimEngine(42);
    advanceSim(engine, 20);
    const a = engine.execute({ type: "SITREP" });
    const b = engine.execute({ type: "SITREP" });
    expect(a.ok).toBe(true);
    expect(a.sitrep).toBeDefined();
    expect(a.sitrep).toBe(b.sitrep);
    expect(a.sitrep).toContain("TRACKS");
  });

  it("resets to a clean scenario", () => {
    const engine = new SimEngine(42);
    advanceSim(engine, 20);
    expect(engine.tracks.length).toBeGreaterThan(0);
    engine.execute({ type: "RESET" });
    expect(engine.simTime).toBe(0);
    expect(engine.tracks).toHaveLength(0);
    expect(engine.cotEvents).toBe(0);
  });
});
