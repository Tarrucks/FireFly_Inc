import { describe, expect, it } from "vitest";
import { parseCommand } from "@/sim/commands";

describe("agent shim regex intent layer", () => {
  it("parses drone tasking with a track id", () => {
    expect(parseCommand("task drone to T-2").command).toEqual({ type: "TASK_DRONE", trackId: "T-2" });
    expect(parseCommand("send the bird to check track 7").command).toEqual({ type: "TASK_DRONE", trackId: "T-7" });
  });

  it("parses drone tasking without a track id", () => {
    expect(parseCommand("launch drone").command).toEqual({ type: "TASK_DRONE", trackId: null });
  });

  it("parses sitrep requests", () => {
    expect(parseCommand("sitrep").command).toEqual({ type: "SITREP" });
    expect(parseCommand("give me a situation report").command).toEqual({ type: "SITREP" });
  });

  it("parses focus commands", () => {
    expect(parseCommand("focus track 3").command).toEqual({ type: "FOCUS_TRACK", trackId: "T-3" });
    expect(parseCommand("show track T-12").command).toEqual({ type: "FOCUS_TRACK", trackId: "T-12" });
  });

  it("parses sim controls", () => {
    expect(parseCommand("pause").command).toEqual({ type: "PAUSE" });
    expect(parseCommand("resume").command).toEqual({ type: "RESUME" });
    expect(parseCommand("speed 2x").command).toEqual({ type: "SET_SPEED", multiplier: 2 });
  });

  it("parses demo spawns", () => {
    expect(parseCommand("spawn decoy swarm").command).toEqual({ type: "SPAWN", what: "decoy-swarm" });
    expect(parseCommand("spawn hostile").command).toEqual({ type: "SPAWN", what: "hostile" });
  });

  it("parses drone recall", () => {
    expect(parseCommand("recall the drone").command).toEqual({ type: "RECALL_DRONE" });
  });

  it("rejects unmatched intents", () => {
    expect(parseCommand("make me a sandwich").command).toBeNull();
    expect(parseCommand("").command).toBeNull();
  });
});
