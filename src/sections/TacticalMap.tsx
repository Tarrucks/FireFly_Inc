import type { KeyboardEvent, ReactNode } from "react";
import type { SimEngine } from "@/sim/engine";
import type { Obstacle, Track } from "@/types/domain";
import { BAND_COLOR, BLUE_FORCE, DECOY_FLAG } from "@/lib/colors";
import { bearingDeg } from "@/lib/utils";
import { len } from "@/sim/geo";

/**
 * ATAK-style tactical picture. World frame: meters east/north from the
 * operator; SVG y is flipped. Only the fused picture is drawn — ground
 * truth stays hidden, exactly as the operator would see it.
 *
 * Shape carries identity (diamond = air track, square = ground track,
 * rectangle = friendly, chevron = drone); band color reinforces it.
 */

const VIEW = 1160;
const HALF = VIEW / 2;
const RINGS = [125, 250, 375, 500];

function sx(x: number): number {
  return x;
}
function sy(y: number): number {
  return -y;
}

function trackAriaLabel(tr: Track): string {
  const brg = Math.round(bearingDeg(tr.pos.x, tr.pos.y));
  const rng = Math.round(len(tr.pos));
  return `Track ${tr.id}, ${tr.targetClass}, band ${tr.threat.band}, bearing ${brg}, range ${rng} meters`;
}

function ObstacleMark({ ob }: { ob: Obstacle }) {
  const x = sx(ob.pos.x);
  const y = sy(ob.pos.y);
  if (ob.kind === "rally") {
    return (
      <g transform={`translate(${x} ${y})`}>
        <path d="M 0 0 L 0 -22 L 16 -17 L 0 -12" fill="none" stroke={BLUE_FORCE} strokeWidth={2.5} />
        <circle r={3} fill={BLUE_FORCE} />
        <text y={16} textAnchor="middle" className="fill-[var(--ink-muted)]" fontSize={12}>
          {ob.label}
        </text>
      </g>
    );
  }
  const color = ob.kind === "minefield" ? "var(--band-red)" : "var(--band-yellow)";
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={ob.radius} fill={color} opacity={0.06} />
      <circle r={ob.radius} fill="none" stroke={color} strokeWidth={2} strokeDasharray="8 6" opacity={0.55} />
      <text textAnchor="middle" dy={4} fill={color} fontSize={12} fontWeight={600} opacity={0.9}>
        {ob.label}
      </text>
    </g>
  );
}

function TrackMark({
  tr,
  selected,
  onSelect,
}: {
  tr: Track;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const x = sx(tr.pos.x);
  const y = sy(tr.pos.y);
  const color = BAND_COLOR[tr.threat.band];
  const ring = Math.max(20, tr.sigma * 1.8);
  const isAir = tr.targetClass === "uas";
  const vel = { x: tr.velocity.x * 6, y: -tr.velocity.y * 6 };
  const speed = Math.hypot(tr.velocity.x, tr.velocity.y);

  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(tr.id);
    }
  };

  return (
    <g
      transform={`translate(${x} ${y})`}
      onClick={() => onSelect(tr.id)}
      onKeyDown={onKey}
      role="button"
      tabIndex={0}
      aria-label={trackAriaLabel(tr)}
      className="cursor-pointer focus:outline-none"
    >
      <title>{`${tr.id} · ${tr.targetClass.toUpperCase()} · ${tr.threat.band} · conf ${tr.confidence.toFixed(2)}`}</title>

      {/* Fused position uncertainty */}
      <circle r={ring} fill={color} opacity={0.1} />
      <circle r={ring} fill="none" stroke={color} strokeWidth={1.5} opacity={0.35} />

      {selected && (
        <circle r={26} fill="none" stroke="#ffffff" strokeWidth={1.75} strokeDasharray="5 4" />
      )}

      {tr.decoySuspect && (
        <circle r={34} fill="none" stroke={DECOY_FLAG} strokeWidth={2} strokeDasharray="3 5" />
      )}

      {/* Velocity vector */}
      {speed > 1 && (
        <line x1={0} y1={0} x2={vel.x} y2={vel.y} stroke={color} strokeWidth={2} opacity={0.8} />
      )}

      {/* Shape: diamond = air, square = ground */}
      {isAir ? (
        <path d="M 0 -14 L 14 0 L 0 14 L -14 0 Z" fill={color} stroke="#0d0d0d" strokeWidth={2} />
      ) : (
        <rect x={-11} y={-11} width={22} height={22} fill={color} stroke="#0d0d0d" strokeWidth={2} />
      )}

      <text x={18} y={-8} fontSize={14} fontWeight={700} className="fill-foreground" style={{ fill: "#ffffff" }}>
        {tr.id}
      </text>
      <text x={18} y={7} fontSize={12} style={{ fill: "var(--ink-secondary)" }}>
        {tr.targetClass.toUpperCase()} ·{" "}
        {tr.confidence.toFixed(2).replace(/^0/, "")}
      </text>
      {tr.decoySuspect && (
        <text x={18} y={22} fontSize={12} fontWeight={700} style={{ fill: DECOY_FLAG }}>
          DECOY?
        </text>
      )}
      {tr.resolution === "confirmed-decoy" && (
        <text x={18} y={22} fontSize={12} fontWeight={700} style={{ fill: DECOY_FLAG }}>
          ✓ DECOY
        </text>
      )}
      {tr.resolution === "confirmed-hostile" && (
        <text x={18} y={22} fontSize={12} fontWeight={700} style={{ fill: "var(--band-red)" }}>
          ✓ HOSTILE
        </text>
      )}
    </g>
  );
}

function LegendRow({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <svg width={16} height={16} viewBox="-8 -8 16 16" aria-hidden>
        {swatch}
      </svg>
      <span>{label}</span>
    </div>
  );
}

export function TacticalMap({
  engine,
  selectedId,
  onSelect,
}: {
  engine: SimEngine;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { drone } = engine;
  const gridLines: number[] = [];
  for (let v = -500; v <= 500; v += 100) gridLines.push(v);

  return (
    <div className="relative min-w-0 flex-1 bg-background">
      <svg
        viewBox={`${-HALF} ${-HALF} ${VIEW} ${VIEW}`}
        className="block h-full w-full"
        role="img"
        aria-label="Tactical map: fused threat picture around the operator"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid */}
        {gridLines.map((v) => (
          <g key={v}>
            <line x1={v} y1={-500} x2={v} y2={500} stroke="var(--map-grid)" strokeWidth={1} />
            <line x1={-500} y1={v} x2={500} y2={v} stroke="var(--map-grid)" strokeWidth={1} />
          </g>
        ))}

        {/* Range rings */}
        {RINGS.map((r) => (
          <g key={r}>
            <circle r={r} fill="none" stroke="var(--map-ring)" strokeWidth={1.5} />
            <text x={4} y={-r + 14} fontSize={11} style={{ fill: "var(--ink-muted)" }}>
              {r}m
            </text>
          </g>
        ))}

        {/* North arrow */}
        <g transform={`translate(${HALF - 40} ${-HALF + 48})`}>
          <path d="M 0 10 L 0 -14 M -6 -6 L 0 -14 L 6 -6" fill="none" stroke="var(--ink-muted)" strokeWidth={2.5} />
          <text y={28} textAnchor="middle" fontSize={14} fontWeight={700} style={{ fill: "var(--ink-muted)" }}>
            N
          </text>
        </g>

        {/* Scale bar */}
        <g transform={`translate(${HALF - 240} ${HALF - 36})`}>
          <line x1={0} y1={0} x2={200} y2={0} stroke="var(--ink-muted)" strokeWidth={2.5} />
          <line x1={0} y1={-5} x2={0} y2={5} stroke="var(--ink-muted)" strokeWidth={2.5} />
          <line x1={200} y1={-5} x2={200} y2={5} stroke="var(--ink-muted)" strokeWidth={2.5} />
          <text x={100} y={-8} textAnchor="middle" fontSize={12} style={{ fill: "var(--ink-muted)" }}>
            200 m
          </text>
        </g>

        {/* Persistent obstacles */}
        {engine.obstacles.map((ob) => (
          <ObstacleMark key={ob.id} ob={ob} />
        ))}

        {/* Friendly forces */}
        {engine.friendlies.map((f) => (
          <g key={f.id} transform={`translate(${sx(f.pos.x)} ${sy(f.pos.y)})`}>
            <rect x={-10} y={-7} width={20} height={14} rx={2} fill={BLUE_FORCE} stroke="#0d0d0d" strokeWidth={1.5} />
            <text x={14} y={5} fontSize={12} style={{ fill: "var(--ink-secondary)" }}>
              {f.callsign}
            </text>
          </g>
        ))}

        {/* Operator */}
        <g aria-label="Operator position">
          <circle r={10} fill="none" stroke={BLUE_FORCE} strokeWidth={3} />
          <circle r={3} fill={BLUE_FORCE} />
          <text x={15} y={5} fontSize={13} fontWeight={700} style={{ fill: BLUE_FORCE }}>
            OPR
          </text>
        </g>

        {/* Drone */}
        {drone.phase !== "IDLE" && (
          <>
            {drone.phase === "ENROUTE" && drone.targetPos && (
              <line
                x1={sx(drone.pos.x)}
                y1={sy(drone.pos.y)}
                x2={sx(drone.targetPos.x)}
                y2={sy(drone.targetPos.y)}
                stroke={BLUE_FORCE}
                strokeWidth={1.5}
                strokeDasharray="6 6"
                opacity={0.6}
              />
            )}
            {drone.phase === "ORBIT" && drone.targetPos && (
              <circle
                cx={sx(drone.targetPos.x)}
                cy={sy(drone.targetPos.y)}
                r={200}
                fill="none"
                stroke={BLUE_FORCE}
                strokeWidth={1.5}
                strokeDasharray="4 6"
                opacity={0.55}
              />
            )}
            <g
              transform={`translate(${sx(drone.pos.x)} ${sy(drone.pos.y)}) rotate(${drone.headingDeg})`}
              aria-label={`Drone, ${drone.phase}`}
            >
              <path d="M 0 -12 L 8 12 L 0 6 L -8 12 Z" fill={BLUE_FORCE} stroke="#0d0d0d" strokeWidth={1.5} />
            </g>
          </>
        )}

        {/* Fused threat tracks */}
        {engine.tracks.map((tr) => (
          <TrackMark key={tr.id} tr={tr} selected={tr.id === selectedId} onSelect={onSelect} />
        ))}
      </svg>

      {/* Legend */}
      <div className="absolute left-2 top-2 rounded border bg-card/90 px-2.5 py-2 text-[11px] leading-5 text-secondary-foreground">
        <LegendRow
          swatch={<path d="M 0 -6 L 6 0 L 0 6 L -6 0 Z" fill="var(--band-red)" />}
          label="Air track (band color)"
        />
        <LegendRow
          swatch={<rect x={-5} y={-5} width={10} height={10} fill="var(--band-yellow)" />}
          label="Ground track"
        />
        <LegendRow
          swatch={<rect x={-6} y={-4} width={12} height={8} rx={1} fill={BLUE_FORCE} />}
          label="Friendly"
        />
        <LegendRow
          swatch={<circle r={6} fill="none" stroke={DECOY_FLAG} strokeWidth={1.5} strokeDasharray="2 2" />}
          label="Decoy suspect"
        />
        <LegendRow
          swatch={<path d="M 0 -6 L 4 6 L 0 3 L -4 6 Z" fill={BLUE_FORCE} />}
          label="Drone"
        />
      </div>
    </div>
  );
}
