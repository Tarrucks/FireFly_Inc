import { useState, type FormEvent } from "react";
import { CornerDownLeft } from "lucide-react";
import type { AgentCommand, CommandResult } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface ConsoleEcho {
  /** Raw operator text, when the command came from the input. */
  text: string | null;
  command: AgentCommand | null;
  result: CommandResult;
}

const CHIPS: Array<{ label: string; command: AgentCommand }> = [
  { label: "SITREP", command: { type: "SITREP" } },
  { label: "Task drone → top threat", command: { type: "TASK_DRONE", trackId: null } },
  { label: "Recall drone", command: { type: "RECALL_DRONE" } },
  { label: "Spawn decoy swarm", command: { type: "SPAWN", what: "decoy-swarm" } },
  { label: "Spawn hostile", command: { type: "SPAWN", what: "hostile" } },
];

export function CommandConsole({
  echo,
  onText,
  onCommand,
}: {
  echo: ConsoleEcho | null;
  onText: (text: string) => void;
  onCommand: (command: AgentCommand) => void;
}) {
  const [value, setValue] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (!text) return;
    onText(text);
    setValue("");
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-card" aria-label="Agent console">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-widest">Agent console</span>
        <span className="text-[10px] text-muted-foreground" title="The full MOSAIC stack parses language with Phi-3-mini via Ollama plus three validation layers; this browser demo ships the deterministic regex layer.">
          regex intent layer · full stack adds Phi-3-mini
        </span>
      </div>

      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {echo === null ? (
          <div className="text-[11px] leading-5 text-muted-foreground">
            <p>Natural-language tasking. Try:</p>
            <ul className="list-inside list-disc">
              <li>“task drone to T-2”</li>
              <li>“sitrep”</li>
              <li>“focus track 3” · “speed 2x” · “pause”</li>
            </ul>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 text-[11px]">
            {echo.text && (
              <div className="text-secondary-foreground">
                <span className="text-muted-foreground">operator › </span>
                {echo.text}
              </div>
            )}
            <div className="flex items-center gap-2">
              {echo.result.ok ? (
                <Badge className="bg-[var(--band-green)]/15 text-[var(--band-green)]">accepted</Badge>
              ) : (
                <Badge className="bg-[var(--band-red)]/15 text-[var(--band-red)]">
                  rejected · {echo.result.rejectedBy}
                </Badge>
              )}
              <span className="text-secondary-foreground">{echo.result.message}</span>
            </div>
            {echo.command && (
              <pre className="overflow-x-auto rounded bg-background px-2 py-1.5 font-mono text-[10px] leading-4 text-muted-foreground">
                {`AgentCommand ${JSON.stringify(echo.command)}`}
              </pre>
            )}
            {echo.result.sitrep && (
              <pre className="overflow-x-auto whitespace-pre rounded bg-background px-2 py-1.5 font-mono text-[11px] leading-5 text-secondary-foreground">
                {echo.result.sitrep}
              </pre>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 px-3 pb-1.5">
        {CHIPS.map((chip) => (
          <Button key={chip.label} variant="outline" size="sm" onClick={() => onCommand(chip.command)}>
            {chip.label}
          </Button>
        ))}
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 border-t px-3 py-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder='Command… e.g. "task drone to T-2"'
          aria-label="Natural-language command input"
          className="h-8 min-w-0 flex-1 rounded border border-input bg-background px-2.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" size="sm" aria-label="Send command">
          <CornerDownLeft className="h-3.5 w-3.5" />
          Send
        </Button>
      </form>
    </section>
  );
}
