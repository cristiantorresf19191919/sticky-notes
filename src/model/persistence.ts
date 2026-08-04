/**
 * Saving happens only on committed state. While a drag is in progress the
 * position lives in refs and direct DOM writes, so intermediate movements
 * can never reach storage.
 */

import type { BoardState, Note, NoteColor } from "./model";
import { COLOR_ORDER, initialBoard } from "./model";

export const STORAGE_KEY = "sticky-notes/v1";

interface PersistedV1 {
  v: 1;
  notes: readonly Note[];
  nextZ: number;
}

const isColor = (v: unknown): v is NoteColor =>
  typeof v === "string" && (COLOR_ORDER as readonly string[]).includes(v);

const isNote = (v: unknown): v is Note => {
  if (typeof v !== "object" || v === null) return false;
  const n = v as Record<string, unknown>;
  return (
    typeof n.id === "string" &&
    typeof n.x === "number" &&
    typeof n.y === "number" &&
    typeof n.w === "number" &&
    typeof n.h === "number" &&
    typeof n.z === "number" &&
    isColor(n.color) &&
    typeof n.text === "string"
  );
};

/**
 * Never trust storage: parse as unknown and validate, or fall back to the
 * seed notes.
 */
export function loadBoard(): BoardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialBoard;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return initialBoard;
    const p = parsed as Partial<PersistedV1>;
    if (p.v !== 1 || !Array.isArray(p.notes) || typeof p.nextZ !== "number")
      return initialBoard;
    if (!p.notes.every(isNote)) return initialBoard;
    return { notes: p.notes, nextZ: p.nextZ };
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
