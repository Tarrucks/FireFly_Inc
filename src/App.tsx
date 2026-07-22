import { useState } from "react";
import { useSimulation } from "@/hooks/useSimulation";
import { parseCommand } from "@/sim/commands";
import type { AgentCommand } from "@/types/domain";
import { StatusBar } from "@/sections/StatusBar";
import { TacticalMap } from "@/sections/TacticalMap";
import { TrackPanel } from "@/sections/TrackPanel";
import { EventLog } from "@/sections/EventLog";
import { CommandConsole, type ConsoleEcho } from "@/sections/CommandConsole";

export default function App() {
  const { engine } = useSimulation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [echo, setEcho] = useState<ConsoleEcho | null>(null);

  // A dropped track cannot stay selected.
  const selectedExists = selectedId !== null && engine.tracks.some((tr) => tr.id === selectedId);
  const effectiveSelected = selectedExists ? selectedId : null;

  const runText = (text: string) => {
    const { command } = parseCommand(text);
    const result = engine.handleText(text);
    if (result.focusTrackId) setSelectedId(result.focusTrackId);
    setEcho({ text, command, result });
  };

  const runCommand = (command: AgentCommand) => {
    const result = engine.execute(command);
    if (result.focusTrackId) setSelectedId(result.focusTrackId);
    setEcho({ text: null, command, result });
  };

  return (
    <div className="flex h-full flex-col">
      <StatusBar engine={engine} />
      <main className="flex min-h-0 flex-1">
        <TacticalMap engine={engine} selectedId={effectiveSelected} onSelect={setSelectedId} />
        <TrackPanel
          engine={engine}
          selectedId={effectiveSelected}
          onSelect={setSelectedId}
          onTaskDrone={(trackId) => runCommand({ type: "TASK_DRONE", trackId })}
        />
      </main>
      <div className="flex h-[236px] shrink-0 border-t">
        <CommandConsole echo={echo} onText={runText} onCommand={runCommand} />
        <EventLog engine={engine} />
      </div>
    </div>
  );
}
