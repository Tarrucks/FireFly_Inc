import type { AgentCommand } from "@/types/domain";

/**
 * Agent shim, browser edition.
 *
 * The full MOSAIC stack parses natural language through Phi-3-mini via Ollama
 * with three validation layers and a regex fallback. This console runs
 * entirely in the browser, so it ships the deterministic regex layer —
 * the same structured AgentCommand contract, honestly labeled.
 *
 * Layer 1 (intent) lives here: free text → AgentCommand | null.
 * Layers 2 (schema) and 3 (state) live in the engine's executor.
 */

export interface ParseResult {
  command: AgentCommand | null;
  /** Which rule matched, for the console's command echo. */
  rule: string | null;
}

const TRACK_ID = /\b(?:T-?)?(\d{1,3})\b/i;

function trackIdFrom(text: string): string | null {
  const m = TRACK_ID.exec(text);
  return m ? `T-${m[1]}` : null;
}

interface Rule {
  name: string;
  pattern: RegExp;
  build: (text: string) => AgentCommand | null;
}

const RULES: Rule[] = [
  {
    name: "task-drone",
    pattern: /\b(task|send|launch|dispatch|vector)\b.*\b(drone|bird|uav)\b|\b(drone|bird|uav)\b.*\b(check|verify|investigate)\b/i,
    build: (text) => ({ type: "TASK_DRONE", trackId: trackIdFrom(text) }),
  },
  {
    name: "recall-drone",
    pattern: /\b(recall|rtb|return|abort|come home)\b/i,
    build: () => ({ type: "RECALL_DRONE" }),
  },
  {
    name: "sitrep",
    pattern: /\b(sitrep|sit rep|situation report|status report|report status)\b/i,
    build: () => ({ type: "SITREP" }),
  },
  {
    name: "focus-track",
    pattern: /\b(focus|select|show|open|inspect)\b.*\btrack\b|\bfocus\b.*\bT-?\d/i,
    build: (text) => {
      const id = trackIdFrom(text);
      return id ? { type: "FOCUS_TRACK", trackId: id } : null;
    },
  },
  {
    name: "pause",
    pattern: /\b(pause|halt|freeze|hold)\b/i,
    build: () => ({ type: "PAUSE" }),
  },
  {
    name: "resume",
    pattern: /\b(resume|play|continue|unpause)\b/i,
    build: () => ({ type: "RESUME" }),
  },
  {
    name: "set-speed",
    pattern: /\b(speed|rate)\b.*?(\d+(?:\.\d+)?)\s*x?|\b(\d+(?:\.\d+)?)\s*x\s*(speed)?\b/i,
    build: (text) => {
      const m = /(\d+(?:\.\d+)?)\s*x?/i.exec(text.replace(/\bT-?\d+\b/gi, ""));
      if (!m) return null;
      const multiplier = Number(m[1]);
      return { type: "SET_SPEED", multiplier };
    },
  },
  {
    name: "spawn-decoys",
    pattern: /\bspawn\b.*\bdecoy|\bdecoy (swarm|group|wave)\b/i,
    build: () => ({ type: "SPAWN", what: "decoy-swarm" }),
  },
  {
    name: "spawn-hostile",
    pattern: /\bspawn\b.*\b(hostile|threat|uas|bandit)\b/i,
    build: () => ({ type: "SPAWN", what: "hostile" }),
  },
  {
    name: "reset",
    pattern: /\b(reset|restart)\b.*\b(sim|simulation|scenario|demo)?\b/i,
    build: () => ({ type: "RESET" }),
  },
];

/** Layer 1: intent parsing. Returns null when no rule matches. */
export function parseCommand(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { command: null, rule: null };
  for (const rule of RULES) {
    if (rule.pattern.test(trimmed)) {
      const command = rule.build(trimmed);
      if (command) return { command, rule: rule.name };
    }
  }
  return { command: null, rule: null };
}
