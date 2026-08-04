import { useEffect, useRef } from "react";
import type { BoardState } from "../model/model";
import type { BoardApi } from "../model/persistence";
import { serializeBoard, STORAGE_KEY } from "../model/persistence";

export const SAVE_DELAY_MS = 250;

/**
 * Debounced saving of committed state. A burst of commits collapses into one
 * localStorage write and one API call after the board goes quiet.
 *
 * Saves are skipped by comparing state identity instead of a boolean flag,
 * which also works under StrictMode's doubled effects: the loaded state
 * counts as already saved until a commit changes it.
 */
export function useDebouncedSave(state: BoardState, api: BoardApi): void {
  const lastPersistedRef = useRef(state);
  const latestRef = useRef(state);
  latestRef.current = state;

  useEffect(() => {
    if (state === lastPersistedRef.current) return;
    const t = setTimeout(() => {
      lastPersistedRef.current = state;
      localStorage.setItem(STORAGE_KEY, serializeBoard(state));
      void api.putBoard(state);
    }, SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [state, api]);

  // Closing the tab must not lose the last pending save: write it
  // synchronously on pagehide. (With a real backend, sendBeacon would carry
  // the API call.)
  useEffect(() => {
    const flush = () => {
      if (latestRef.current === lastPersistedRef.current) return;
      lastPersistedRef.current = latestRef.current;
      localStorage.setItem(STORAGE_KEY, serializeBoard(latestRef.current));
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);
}
