/**
 * Saving happens only on committed state. While a drag is in progress the
 * position lives in refs and direct DOM writes, so intermediate movements
 * can never reach storage.
 */

import type { BoardState, Note, NoteColor } from "./model";
import { COLOR_ORDER, initialBoard, MIN_H, MIN_W } from "./model";
import { clamp } from "./geometry";

export const STORAGE_KEY = "sticky-notes/v1";

interface PersistedV1 {
  v: 1;
  notes: readonly Note[];
  nextZ: number;
}

const isColor = (v: unknown): v is NoteColor =>
  typeof v === "string" && (COLOR_ORDER as readonly string[]).includes(v);

// Check for finite numbers, not just typeof number: JSON.parse turns "1e999"
// into Infinity, and an Infinity coordinate turns later drag math into NaN.
const isNote = (v: unknown): v is Note => {
  if (typeof v !== "object" || v === null) return false;
  const n = v as Record<string, unknown>;
  return (
    typeof n.id === "string" &&
    Number.isFinite(n.x) &&
    Number.isFinite(n.y) &&
    Number.isFinite(n.w) &&
    Number.isFinite(n.h) &&
    Number.isFinite(n.z) &&
    isColor(n.color) &&
    typeof n.text === "string"
  );
};

/**
 * Never trust storage: parse as unknown and validate, or fall back to the
 * seed notes. Checking the shape alone is not enough, so the load also
 * restores the app's invariants: unique ids, minimum sizes, and a z counter
 * above every stored z.
 */
export function loadBoard(): BoardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialBoard;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return initialBoard;
    const p = parsed as Partial<PersistedV1>;
    if (p.v !== 1 || !Array.isArray(p.notes) || !Number.isFinite(p.nextZ))
      return initialBoard;
    if (!p.notes.every(isNote)) return initialBoard;
    if (new Set(p.notes.map((n) => n.id)).size !== p.notes.length)
      return initialBoard;
    const notes = p.notes.map((n) => {
      const w = Math.max(MIN_W, n.w);
      const h = Math.max(MIN_H, n.h);
      // A board saved on a larger window must stay reachable on this one:
      // clamp restored positions into the current viewport.
      return {
        ...n,
        w,
        h,
        x: clamp(n.x, 0, Math.max(0, window.innerWidth - w)),
        y: clamp(n.y, 0, Math.max(0, window.innerHeight - h)),
      };
    });
    const topZ = notes.reduce((top, n) => Math.max(top, n.z), 0);
    return { notes, nextZ: Math.max(p.nextZ as number, topZ + 1) };
  } catch {
    return initialBoard;
  }
}

export function serializeBoard(state: BoardState): string {
  const payload: PersistedV1 = { v: 1, notes: state.notes, nextZ: state.nextZ };
  return JSON.stringify(payload);
}

export interface BoardApi {
  putBoard(state: BoardState): Promise<{ ok: true; savedAt: number }>;
  /** Every payload the mock received. The tests count these. */
  calls: BoardState[];
}

/**
 * Mock REST API. It is asynchronous on purpose: it resolves on a timer,
 * like a real network call would.
 */
export function createMockApi(latencyMs = 30): BoardApi {
  const calls: BoardState[] = [];
  return {
    calls,
    putBoard(state) {
      calls.push(state);
      return new Promise((resolve) =>
        setTimeout(() => resolve({ ok: true, savedAt: Date.now() }), latencyMs),
      );
    },
  };
}
