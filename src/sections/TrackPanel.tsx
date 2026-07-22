import { Send } from "lucide-react";
import type { SimEngine } from "@/sim/engine";
import type { Modality, Track } from "@/types/domain";
import { MODALITIES } from "@/types/domain";
import { BAND_COLOR, BAND_LABEL, DECOY_FLAG, MODALITY_COLOR } from "@/lib/colors";
import { bearingDeg, rangeStr } from "@/lib/utils";
import { len } from "@/sim/geo";
import { WEIGHTS } from "@/sim/threat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function ScoreRow({ label, value, weight, color }: { label: string; value: number; weight: number; color?: string }) {
  const contribution = value * weight;
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-24 text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted" aria-hidden>
        <div
          className="h-full rounded"
          style={{ width: `${Math.min(100, contribution * 100)}%`, background: color ?? "var(--ink-secondary)" }}
        />
      </div>
      <span className="tabular w-12 text-right text-secondary-foreground">
        {value.toFixed(2)}×{weight}
      </span>
    </div>
  );
}

function EvidenceRow({ tr, modality, now }: { tr: Track; modality: Modality; now: number }) {
  const ev = tr.evidence[modality];
  const silent = ev.hits === 0;
  const silentIsSignal = silent && modality === "RF" && tr.decoySuspect;
  const sinceLast = now - ev.lastSeen;
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="flex w-16 items-center gap-1.5 font-medium text-secondary-foreground">
        <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: MODALITY_COLOR[modality] }} />
        {modality}
      </span>
      {silent ? (
        <span className={silentIsSignal ? "font-bold" : "text-muted-foreground"} style={silentIsSignal ? { color: DECOY_FLAG } : undefined}>
          {silentIsSignal ? "SILENT — decoy signature" : "no detections"}
        </span>
      ) : (
        <span className="tabular text-muted-foreground">
          {ev.hits} hits · conf {ev.meanConfidence.toFixed(2)} ·{" "}
          {sinceLast < 1 ? "live" : `${sinceLast.toFixed(0)}s ago`}
        </span>
      )}
    </div>
  );
}

function BandBadge({ track }: { track: Track }) {
  const band = track.threat.band;
  return (
    <Badge
      variant="outline"
      style={{ borderColor: BAND_COLOR[band], color: BAND_COLOR[band] }}
      aria-label={`Threat band ${BAND_LABEL[band]}`}
    >
      {BAND_LABEL[band]}
    </Badge>
  );
}

function TrackDetail({
  engine,
  track,
  onTaskDrone,
}: {
  engine: SimEngine;
  track: Track;
  onTaskDrone: (trackId: string) => void;
}) {
  const brg = Math.round(bearingDeg(track.pos.x, track.pos.y));
  const rng = len(track.pos);
  const speed = Math.hypot(track.velocity.x, track.velocity.y);
  const hdg = Math.round(bearingDeg(track.velocity.x, track.velocity.y));
  const age = engine.simTime - track.firstSeen;

  const droneBusy = engine.drone.phase !== "IDLE";
  const disabledReason = track.resolution
    ? `Already resolved: ${track.resolution}`
    : droneBusy
      ? `Drone unavailable (${engine.drone.phase})`
      : null;

  const stats: Array<[string, string]> = [
    ["BRG", `${String(brg).padStart(3, "0")}°`],
    ["RNG", rangeStr(rng)],
    ["SPD", `${speed.toFixed(1)} m/s`],
    ["HDG", `${String(hdg).padStart(3, "0")}°`],
    ["σ POS", `±${track.sigma.toFixed(0)}m`],
    ["AGE", `${age.toFixed(0)}s`],
  ];

  return (
    <div className="flex flex-col gap-2.5 border-t px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-sm font-bold">{track.id}</span>
        <span className="text-xs uppercase text-muted-foreground">{track.targetClass}</span>
        <BandBadge track={track} />
        {track.decoySuspect && (
          <Badge variant="outline" style={{ borderColor: DECOY_FLAG, color: DECOY_FLAG }}>
            Possible decoy
          </Badge>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-x-3 gap-y-1">
        {stats.map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <dt className="text-[10px] text-muted-foreground">{k}</dt>
            <dd className="tabular text-xs font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Threat score {track.threat.score.toFixed(2)}
        </span>
        <ScoreRow label="Class threat" value={track.threat.classThreat} weight={WEIGHTS.classThreat} />
        <ScoreRow label="Kinematic risk" value={track.threat.kinematicRisk} weight={WEIGHTS.kinematicRisk} />
        <ScoreRow label="Confidence" value={track.threat.confidence} weight={WEIGHTS.confidence} />
        <ScoreRow
          label="− Disagreement"
          value={track.threat.disagreement}
          weight={WEIGHTS.disagreementPenalty}
          color={DECOY_FLAG}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Modality evidence
        </span>
        {MODALITIES.map((m) => (
          <EvidenceRow key={m} tr={track} modality={m} now={engine.simTime} />
        ))}
      </div>

      {track.resolution ? (
        <div
          className="rounded border px-2 py-1.5 text-xs font-semibold"
          style={{
            borderColor: track.resolution === "confirmed-decoy" ? DECOY_FLAG : "var(--band-red)",
            color: track.resolution === "confirmed-decoy" ? DECOY_FLAG : "var(--band-red)",
          }}
        >
          {track.resolution === "confirmed-decoy"
            ? "✓ Drone verified: DECOY — EO/IR-only signature confirmed"
            : "✓ Drone verified: HOSTILE"}
        </div>
      ) : (
        <Button
          size="sm"
          className="w-full"
          disabled={disabledReason !== null}
          title={disabledReason ?? `Send drone to verify ${track.id}`}
          onClick={() => onTaskDrone(track.id)}
        >
          <Send className="h-3.5 w-3.5" />
          Task drone — verify {track.id}
        </Button>
      )}
    </div>
  );
}

export function TrackPanel({
  engine,
  selectedId,
  onSelect,
  onTaskDrone,
}: {
  engine: SimEngine;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onTaskDrone: (trackId: string) => void;
}) {
  const sorted = [...engine.tracks].sort((a, b) => b.threat.score - a.threat.score);
  const selected = selectedId ? engine.tracks.find((tr) => tr.id === selectedId) ?? null : null;

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l bg-card" aria-label="Track panel">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-widest">Tracks</span>
        <span className="tabular text-xs text-muted-foreground">{sorted.length} · priority sort</span>
      </div>

      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label="Fused tracks by priority">
        {sorted.length === 0 && (
          <p className="px-3 py-4 text-xs text-muted-foreground">No tracks. Sensor net is listening…</p>
        )}
        {sorted.map((tr) => (
          <button
            key={tr.id}
            type="button"
            role="option"
            aria-selected={tr.id === selectedId}
            onClick={() => onSelect(tr.id)}
            className={`flex w-full items-center gap-2 border-b border-border/60 px-3 py-1.5 text-left text-xs hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none ${
              tr.id === selectedId ? "bg-secondary" : ""
            }`}
          >
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 shrink-0 rotate-45"
              style={{ background: BAND_COLOR[tr.threat.band] }}
            />
            <span className="sr-only">{tr.threat.band}</span>
            <span className="w-9 shrink-0 font-mono font-bold">{tr.id}</span>
            <span className="w-14 shrink-0 uppercase text-muted-foreground">{tr.targetClass}</span>
            <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded bg-muted" aria-hidden>
              <span
                className="block h-full rounded"
                style={{ width: `${tr.threat.score * 100}%`, background: BAND_COLOR[tr.threat.band] }}
              />
            </span>
            <span className="tabular shrink-0 text-muted-foreground">{tr.threat.score.toFixed(2)}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1">
              {tr.decoySuspect && (
                <span title="Possible decoy — cross-modal disagreement" aria-label="Possible decoy" style={{ color: DECOY_FLAG }} className="font-bold">
                  ?
                </span>
              )}
              {tr.resolution && (
                <span
                  title={tr.resolution}
                  aria-label={tr.resolution}
                  style={{ color: tr.resolution === "confirmed-decoy" ? DECOY_FLAG : "var(--band-red)" }}
                  className="font-bold"
                >
                  ✓
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {selected ? (
        <TrackDetail engine={engine} track={selected} onTaskDrone={onTaskDrone} />
      ) : (
        <p className="border-t px-3 py-3 text-[11px] text-muted-foreground">
          Select a track on the map or in the list to see fused evidence, the threat-score breakdown, and drone tasking.
        </p>
      )}
    </aside>
  );
}
