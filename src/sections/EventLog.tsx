import type { SimEngine } from "@/sim/engine";
import type { EventSeverity } from "@/types/domain";
import { missionClock } from "@/lib/utils";

const SEVERITY_COLOR: Record<EventSeverity, string> = {
  info: "var(--map-ring)",
  warn: "var(--band-yellow)",
  critical: "var(--band-red)",
  success: "var(--band-green)",
};

const SEVERITY_GLYPH: Record<EventSeverity, string> = {
  info: "·",
  warn: "▲",
  critical: "●",
  success: "✓",
};

export function EventLog({ engine }: { engine: SimEngine }) {
  const items = engine.events.slice(-60).reverse();

  return (
    <section className="flex min-w-0 flex-1 flex-col border-l bg-card" aria-label="Event log">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-widest">Event log</span>
        <span className="tabular text-xs text-muted-foreground">{engine.events.length}</span>
      </div>
      <ol className="scroll-slim min-h-0 flex-1 overflow-y-auto px-2 py-1" role="log" aria-live="off">
        {items.map((ev) => (
          <li
            key={ev.id}
            className="flex items-baseline gap-2 border-l-2 px-2 py-0.5 text-[11px] leading-4"
            style={{ borderLeftColor: SEVERITY_COLOR[ev.severity] }}
          >
            <span aria-hidden className="w-3 shrink-0 text-center" style={{ color: SEVERITY_COLOR[ev.severity] }}>
              {SEVERITY_GLYPH[ev.severity]}
            </span>
            <span className="sr-only">{ev.severity}</span>
            <span className="tabular shrink-0 text-muted-foreground">{missionClock(ev.t)}</span>
            <span className="w-14 shrink-0 font-semibold text-muted-foreground">{ev.source}</span>
            <span className="text-secondary-foreground">{ev.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
