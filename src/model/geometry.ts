/**
 * Pure geometry helpers. The app never asks the DOM what is under the cursor
 * (mid-drag, elementFromPoint would return the dragged note itself); rects
 * are measured once per gesture and hit testing after that is plain math.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), hi);

/** Returns a rect with positive width/height for a drag in any direction. */
export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

/** Inclusive edges: a point exactly on the border counts as inside. */
export function pointInRect(px: number, py: number, r: Rect): boolean {
  return (
    px >= r.left && px <= r.left + r.width && py >= r.top && py <= r.top + r.height
  );
}

export function domRectToRect(r: DOMRect): Rect {
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}
