import { Pause, Play, RotateCcw } from "lucide-react";
import type { SimEngine } from "@/sim/engine";
import type { Band } from "@/types/domain";
import { BAND_COLOR } from "@/lib/colors";
import { missionClock } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const SPEED_CYCLE = [1, 2, 4];

function BandTile({ band, count }: { band: Band; count: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`${band} tracks: ${count}`}>
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rotate-45"
        style={{ background: BAND_COLOR[band] }}
      />
      <span className="text-xs font-semibold text-secondary-foreground">{band}</span>
      <span className="tabular text-sm font-bold">{count}</span>
    </div>
  );
}

export function StatusBar({ engine }: { engine: SimEngine }) {
  const counts: Record<Band, number> = { RED: 0, YELLOW: 0, GREEN: 0 };
  for (const tr of engine.tracks) counts[tr.threat.band] += 1;
  const health = engine.sensorHealth();

  const cycleSpeed = () => {
    const idx = SPEED_CYCLE.indexOf(engine.speed);
    const next = SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length] ?? 1;
    engine.execute({ type: "SET_SPEED", multiplier: next });
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b bg-card px-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold tracking-widest">FIREFLY INTEL</span>
        <Badge>Mosaic console</Badge>
        <Badge variant="outline" className="border-[var(--band-yellow)]/60 text-[var(--band-yellow)]">
          Synthetic data
        </Badge>
      </div>

      <div className="tabular text-base font-semibold" aria-label="Mission clock">
        {missionClock(engine.simTime)}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={engine.paused ? "Resume simulation" : "Pause simulation"}
          onClick={() => engine.execute({ type: engine.paused ? "RESUME" : "PAUSE" })}
        >
          {engine.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="sm" className="tabular w-10" aria-label={`Simulation speed ${engine.speed}x`} onClick={cycleSpeed}>
          {engine.speed}x
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Reset scenario"
          onClick={() => engine.execute({ type: "RESET" })}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <div className="flex items-center gap-3">
          <BandTile band="RED" count={counts.RED} />
          <BandTile band="YELLOW" count={counts.YELLOW} />
          <BandTile band="GREEN" count={counts.GREEN} />
        </div>

        <div className="h-5 w-px bg-border" aria-hidden />

        <div className="flex items-center gap-2" aria-label="Sensor health">
          {health.map((h) => (
            <span key={h.modality} className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: h.healthy ? "var(--band-green)" : "var(--band-yellow)" }}
              />
              {h.modality}
              <span className="sr-only">{h.healthy ? "reporting" : "quiet"}</span>
            </span>
          ))}
        </div>

        <div className="h-5 w-px bg-border" aria-hidden />

        <span className="tabular text-xs text-muted-foreground">
          {engine.detectionRate.toFixed(1)} det/s
        </span>
        <span className="tabular text-xs text-muted-foreground" title="Cursor-on-Target events emitted to the TAK link (simulated)">
          CoT {engine.cotEvents}
        </span>
        <Badge variant="outline" aria-label={`Drone ${engine.drone.phase}`}>
          Drone · {engine.drone.phase}
        </Badge>
      </div>
    </header>
  );
}
