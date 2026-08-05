import { useEffect, useRef } from "react";
import type { BoardState } from "../model/model";
import type { BoardApi } from "../model/persistence";
import { serializeBoard, STORAGE_KEY } from "../model/persistence";

export const SAVE_DELAY_MS = 250;

/**
 * Debounced saving of committed state: a burst of commits collapses into one
 * localStorage write and one API call. Saves are skipped by comparing state
 * identity rather than a boolean flag, which stays correct under StrictMode's
 * doubled effects: the loaded state counts as saved until a commit changes it.
 */
export function useDebouncedSave(state: BoardState, api: BoardApi): void {
  const lastPersistedRef = useRef(state);
  const latestRef = useRef(state);
  latestRef.current = state;

  useEffect(() => {
    if (state === lastPersistedRef.current) return;
    const t = setTimeout(() => {
      lastPersistedRef.current = state;
      try {
        localStorage.setItem(STORAGE_KEY, serializeBoard(state));
      } catch {
        // A full or blocked storage must not crash the save.
      }
      void api.putBoard(state);
    }, SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [state, api]);

  // Closing the tab must not lose the last pending save. (With a real
  // backend, sendBeacon would carry the API call here.)
  useEffect(() => {
    const flush = () => {
      if (latestRef.current === lastPersistedRef.current) return;
      lastPersistedRef.current = latestRef.current;
      try {
        localStorage.setItem(STORAGE_KEY, serializeBoard(latestRef.current));
      } catch {
        // Never throw from a pagehide handler.
      }
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);
}
