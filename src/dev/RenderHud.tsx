import { useEffect, useState } from "react";
import { renderCounts, totalRenders } from "./renderCounts";

/**
 * Dev-only overlay showing per-note render counts: drag a note and the
 * counters stay still until pointerup. It polls the counter map on an
 * interval; subscribing through React state would add renders of its own.
 */
export function RenderHud() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  const entries = Object.entries(renderCounts).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="render-hud">
      <strong>renders</strong> (doubled by StrictMode in dev)
      {entries.map(([id, count]) => (
        <div key={id}>
          note {id}: {count}
        </div>
      ))}
      <div>total: {totalRenders()}</div>
    </div>
  );
}
