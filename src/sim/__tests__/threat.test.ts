import { describe, expect, it } from "vitest";
import type { Track } from "@/types/domain";
import { bandFor, BAND_THRESHOLDS, disagreementScore, kinematicRisk, updateThreat } from "@/sim/threat";

function baseTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: "T-1",
    pos: { x: 200, y: 0 },
    velocity: { x: 0, y: 0 },
    sigma: 10,
    logOdds: 1,
    confidence: 0.73,
    targetClass: "uas",
    firstSeen: 0,
    lastSeen: 10,
    hits: 12,
    evidence: {
      EO: { hits: 5, lastSeen: 10, meanConfidence: 0.8 },
      IR: { hits: 4, lastSeen: 10, meanConfidence: 0.75 },
      RADAR: { hits: 3, lastSeen: 10, meanConfidence: 0.6 },
      RF: { hits: 3, lastSeen: 10, meanConfidence: 0.7 },
    },
    threat: {
      classThreat: 0,
      kinematicRisk: 0,
      disagreement: 0,
      confidence: 0.73,
      score: 0,
      band: "GREEN",
    },
    decoySuspect: false,
    resolution: null,
    ...overrides,
  };
}

function decoyEvidence(): Track["evidence"] {
  return {
    EO: { hits: 6, lastSeen: 10, meanConfidence: 0.85 },
    IR: { hits: 5, lastSeen: 10, meanConfidence: 0.8 },
    RADAR: { hits: 1, lastSeen: 4, meanConfidence: 0.5 },
    RF: { hits: 0, lastSeen: -1, meanConfidence: 0 },
  };
}

describe("cross-modal disagreement (decoy signature)", () => {
  it("fires when EO and IR are solid but RF is silent", () => {
    const track = baseTrack({ evidence: decoyEvidence() });
    expect(disagreementScore(track, 10)).toBe(1);
  });

  it("does not fire when RF has seen the track", () => {
    const track = baseTrack();
    expect(disagreementScore(track, 10)).toBe(0);
  });

  it("does not fire on young tracks", () => {
    const track = baseTrack({ evidence: decoyEvidence(), firstSeen: 8 });
    expect(disagreementScore(track, 10)).toBe(0);
  });

  it("is weakened by a solid RADAR return", () => {
    const evidence = decoyEvidence();
    evidence.RADAR = { hits: 6, lastSeen: 10, meanConfidence: 0.7 };
    const track = baseTrack({ evidence });
    expect(disagreementScore(track, 10)).toBeLessThan(1);
    expect(disagreementScore(track, 10)).toBeGreaterThan(0);
  });
});

describe("kinematic risk", () => {
  it("scores an inbound track higher than an outbound one", () => {
    const inbound = baseTrack({ velocity: { x: -15, y: 0 } });
    const outbound = baseTrack({ velocity: { x: 15, y: 0 } });
    expect(kinematicRisk(inbound)).toBeGreaterThan(kinematicRisk(outbound));
  });

  it("scores a close track higher than a distant one at equal velocity", () => {
    const close = baseTrack({ pos: { x: 100, y: 0 } });
    const far = baseTrack({ pos: { x: 700, y: 0 } });
    expect(kinematicRisk(close)).toBeGreaterThan(kinematicRisk(far));
  });
});

describe("banding", () => {
  it("maps score thresholds to bands", () => {
    expect(bandFor(BAND_THRESHOLDS.red + 0.01)).toBe("RED");
    expect(bandFor(BAND_THRESHOLDS.yellow + 0.01)).toBe("YELLOW");
    expect(bandFor(BAND_THRESHOLDS.yellow - 0.01)).toBe("GREEN");
  });

  it("pins a suspected decoy at YELLOW — verify, do not engage", () => {
    const track = baseTrack({
      evidence: decoyEvidence(),
      velocity: { x: -20, y: 0 },
      pos: { x: 120, y: 0 },
      confidence: 0.95,
    });
    updateThreat(track, 10);
    expect(track.decoySuspect).toBe(true);
    expect(track.threat.band).toBe("YELLOW");
  });

  it("forces RED after a confirmed-hostile resolution", () => {
    const track = baseTrack({ resolution: "confirmed-hostile", velocity: { x: 1, y: 0 }, pos: { x: 700, y: 0 } });
    updateThreat(track, 10);
    expect(track.threat.band).toBe("RED");
  });

  it("forces GREEN after a confirmed-decoy resolution, clearing the suspect flag", () => {
    const track = baseTrack({ evidence: decoyEvidence(), resolution: "confirmed-decoy" });
    updateThreat(track, 10);
    expect(track.decoySuspect).toBe(false);
    expect(track.threat.band).toBe("GREEN");
  });

  it("holds RED for brand-new RF-silent tracks until RF correlation can run", () => {
    const young = baseTrack({
      firstSeen: 9,
      lastSeen: 10,
      evidence: {
        EO: { hits: 2, lastSeen: 10, meanConfidence: 0.9 },
        IR: { hits: 1, lastSeen: 10, meanConfidence: 0.9 },
        RADAR: { hits: 1, lastSeen: 10, meanConfidence: 0.7 },
        RF: { hits: 0, lastSeen: -1, meanConfidence: 0 },
      },
      velocity: { x: -22, y: 0 },
      pos: { x: 90, y: 0 },
      confidence: 0.97,
      hits: 2,
    });
    updateThreat(young, 10);
    expect(young.threat.band).toBe("YELLOW");
  });

  it("allows an aged RF-silent track to band RED when EO+IR disagreement does not fire", () => {
    const track = baseTrack({
      firstSeen: 0,
      lastSeen: 20,
      evidence: {
        // EO-heavy, IR-thin: a real RF-silent threat (e.g. fiber-guided)
        // without the full decoy signature.
        EO: { hits: 8, lastSeen: 20, meanConfidence: 0.9 },
        IR: { hits: 1, lastSeen: 12, meanConfidence: 0.6 },
        RADAR: { hits: 6, lastSeen: 20, meanConfidence: 0.7 },
        RF: { hits: 0, lastSeen: -1, meanConfidence: 0 },
      },
      velocity: { x: -22, y: 0 },
      pos: { x: 90, y: 0 },
      confidence: 0.97,
      hits: 20,
      threat: {
        classThreat: 0.9,
        kinematicRisk: 0.9,
        disagreement: 0,
        confidence: 0.97,
        score: 0.8,
        band: "RED",
      },
    });
    updateThreat(track, 20);
    expect(track.decoySuspect).toBe(false);
    expect(track.threat.band).toBe("RED");
  });

  it("applies the disagreement penalty to the score", () => {
    const clean = baseTrack();
    const suspect = baseTrack({ evidence: decoyEvidence() });
    updateThreat(clean, 10);
    updateThreat(suspect, 10);
    expect(suspect.threat.score).toBeLessThan(clean.threat.score);
  });
});
