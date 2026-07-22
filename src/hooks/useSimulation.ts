import { useEffect, useState, useSyncExternalStore } from "react";
import { SimEngine } from "@/sim/engine";

/**
 * Owns the engine instance and the animation loop.
 * Re-renders are driven by the engine's version counter via
 * useSyncExternalStore; components read engine state directly.
 */
export function useSimulation(): { engine: SimEngine; version: number } {
  const [engine] = useState(() => new SimEngine());
  const version = useSyncExternalStore(engine.subscribe, engine.getVersion);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      engine.advance(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  return { engine, version };
}
