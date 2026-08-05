/**
 * Per-note render counters. The dev HUD displays them and the integration
 * tests assert on them, so "no re-renders while dragging" is verified.
 */

export const renderCounts: Record<string, number> = {};

export function bumpRenderCount(id: string): void {
  renderCounts[id] = (renderCounts[id] ?? 0) + 1;
}

export function totalRenders(): number {
  return Object.values(renderCounts).reduce((a, b) => a + b, 0);
}
