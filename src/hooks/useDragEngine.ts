/**
 * Drag engine for moving notes.
 *
 * While a pointer is down, nothing here updates React state. The session
 * lives in a ref, tracking listeners are attached to window so the gesture
 * keeps working when the cursor leaves the note, and visual updates during
 * the drag are direct DOM writes batched to one per animation frame. The
 * gesture ends with at most one dispatch; a plain click dispatches nothing.
 */

import { useRef } from "react";
import type { Dispatch, PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { BoardState, NotesAction } from "../model/model";

export const DRAG_THRESHOLD = 3;

interface DragSession {
  id: string;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
  latestX: number;
  latestY: number;
  moved: boolean;
  /** Set before scheduling so a synchronous requestAnimationFrame (as
   *  stubbed in tests) can clear it from inside the callback. */
  framePending: boolean;
  frameId: number;
}

export interface DragEngineDeps {
  dispatch: Dispatch<NotesAction>;
  /** Mirror of the reducer state, so the stable handlers read fresh data. */
  stateRef: RefObject<BoardState>;
  nodesRef: RefObject<Map<string, HTMLDivElement>>;
}

export interface DragEngine {
  onNotePointerDown: (id: string, e: ReactPointerEvent<HTMLDivElement>) => void;
}

export function useDragEngine(deps: DragEngineDeps): DragEngine {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const sessionRef = useRef<DragSession | null>(null);

  const engineRef = useRef<DragEngine | null>(null);
  if (!engineRef.current) {
    const noteEl = (id: string) => depsRef.current.nodesRef.current.get(id);

    const applyFrame = (s: DragSession) => {
      const el = noteEl(s.id);
      if (!el) return;
      const dx = s.latestX - s.startX;
      const dy = s.latestY - s.startY;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const schedule = (s: DragSession) => {
      if (s.framePending) return;
      s.framePending = true;
      s.frameId = requestAnimationFrame(() => {
        s.framePending = false;
        applyFrame(s);
      });
    };

    const clearTransients = (s: DragSession) => {
      if (s.framePending) {
        cancelAnimationFrame(s.frameId);
        s.framePending = false;
      }
      const el = noteEl(s.id);
      if (el) el.style.transform = "";
    };

    const onMove = (ev: MouseEvent) => {
      const s = sessionRef.current;
      if (!s) return;
      s.latestX = ev.clientX;
      s.latestY = ev.clientY;
      if (
        Math.abs(s.latestX - s.startX) > DRAG_THRESHOLD ||
        Math.abs(s.latestY - s.startY) > DRAG_THRESHOLD
      ) {
        s.moved = true;
      }
      schedule(s);
    };

    const onUp = (ev: MouseEvent) => {
      const s = sessionRef.current;
      if (!s) return;
      end();
      if (!s.moved) return;
      const dx = ev.clientX - s.startX;
      const dy = ev.clientY - s.startY;
      depsRef.current.dispatch({ type: "MOVE", id: s.id, x: s.baseX + dx, y: s.baseY + dy });
    };

    /** Remove listeners first, then roll back transients. */
    const end = () => {
      const s = sessionRef.current;
      if (!s) return;
      sessionRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      clearTransients(s);
    };

    engineRef.current = {
      onNotePointerDown: (id, e) => {
        if (e.button !== 0 || sessionRef.current) return;
        const note = depsRef.current.stateRef.current.notes.find((n) => n.id === id);
        if (!note) return;
        depsRef.current.dispatch({ type: "BRING_TO_FRONT", id });
        sessionRef.current = {
          id,
          startX: e.clientX,
          startY: e.clientY,
          baseX: note.x,
          baseY: note.y,
          latestX: e.clientX,
          latestY: e.clientY,
          moved: false,
          framePending: false,
          frameId: 0,
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      },
    };
  }

  // The engine is built once, so handler identities never change. Stable
  // handlers are what let React.memo skip untouched notes.
  return engineRef.current;
}
