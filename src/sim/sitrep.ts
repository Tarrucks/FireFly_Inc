import type { Drone, Track } from "@/types/domain";
import { bearingDeg, missionClock } from "@/lib/utils";
import { len } from "@/sim/geo";

/**
 * Deterministic structured situation report — mirrors the agent shim's
 * GET /sitrep contract in the full MOSAIC stack. No model in the loop:
 * same state in, same words out.
 */
export function buildSitrep(args: {
  t: number;
  tracks: Track[];
  drone: Drone;
  detectionRate: number;
  cotEvents: number;
}): string {
  const { t, tracks, drone, detectionRate, cotEvents } = args;
  const red = tracks.filter((tr) => tr.threat.band === "RED");
  const yellow = tracks.filter((tr) => tr.threat.band === "YELLOW");
  const green = tracks.filter((tr) => tr.threat.band === "GREEN");
  const decoys = tracks.filter((tr) => tr.decoySuspect || tr.resolution === "confirmed-decoy");

  const lines: string[] = [];
  lines.push(`SITREP ${missionClock(t)}`);
  lines.push(`TRACKS ${tracks.length} — RED ${red.length} / YELLOW ${yellow.length} / GREEN ${green.length}`);

  const priority = [...tracks].sort((a, b) => b.threat.score - a.threat.score)[0];
  if (priority) {
    const rng = Math.round(len(priority.pos));
    const brg = Math.round(bearingDeg(priority.pos.x, priority.pos.y));
    lines.push(
      `PRIORITY ${priority.id} ${priority.targetClass.toUpperCase()} brg ${String(brg).padStart(3, "0")} rng ${rng}m ` +
        `conf ${priority.confidence.toFixed(2)} band ${priority.threat.band}`,
    );
  } else {
    lines.push("PRIORITY none — picture clear");
  }

  if (decoys.length > 0) {
    const ids = decoys.map((d) => d.id).join(", ");
    lines.push(`DECOY ASSESS ${decoys.length} contact(s) show EO/IR-yes RF-silent signature: ${ids}`);
  }

  if (drone.phase === "IDLE") {
    lines.push("DRONE ready at operator position");
  } else {
    const tgt = drone.targetTrackId ? ` tgt ${drone.targetTrackId}` : "";
    lines.push(`DRONE ${drone.phase}${tgt}`);
  }

  lines.push(`SENSORS ~${detectionRate.toFixed(1)} det/s across EO/IR/RADAR/RF (synthetic)`);
  lines.push(`COT ${cotEvents} events emitted to TAK (simulated)`);
  return lines.join("\n");
}
