/**
 * One engine for the drag gestures: create and move.
 *
 * While a pointer is down, nothing here updates React state. The one
 * exception is the create ghost rectangle, a single div updated at most once
 * per frame. The session lives in a ref, tracking listeners are attached to
 * window so the gesture keeps working when the cursor leaves the note or the
 * board, and visual updates during the drag are direct DOM writes batched to
 * one per animation frame. Each gesture ends with at most one dispatch; a
 * plain click on a note dispatches nothing.
 */

import { useRef } from "react";
import type { Dispatch, PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { BoardState, NotesAction } from "../model/model";
import { DEFAULT_H, DEFAULT_W, MIN_H, MIN_W } from "../model/model";
import type { Rect } from "../model/geometry";
import { normalizeRect } from "../model/geometry";

export const DRAG_THRESHOLD = 3;

type DragKind = "create" | "move";

interface DragSession {
  kind: DragKind;
  /** Note id; "" for a create gesture. */
  id: string;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
  latestX: number;
  latestY: number;
  moved: boolean;
  boardLeft: number;
  boardTop: number;
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
  boardRef: RefObject<HTMLDivElement | null>;
  onGhost: (rect: Rect | null) => void;
  createId: () => string;
}

export interface DragEngine {
  onBoardPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
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
      if (s.kind === "create") {
        depsRef.current.onGhost(
          normalizeRect(
            s.startX - s.boardLeft,
            s.startY - s.boardTop,
            s.latestX - s.boardLeft,
            s.latestY - s.boardTop,
          ),
        );
        return;
      }
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
      if (s.kind === "create") {
        depsRef.current.onGhost(null);
        return;
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
      const { dispatch } = depsRef.current;
      const dx = ev.clientX - s.startX;
      const dy = ev.clientY - s.startY;

      if (s.kind === "create") {
        // Tiny gesture = a click: default-size note at the press point.
        const rect = s.moved
          ? normalizeRect(
              s.startX - s.boardLeft,
              s.startY - s.boardTop,
              ev.clientX - s.boardLeft,
              ev.clientY - s.boardTop,
            )
          : {
              left: s.startX - s.boardLeft,
              top: s.startY - s.boardTop,
              width: DEFAULT_W,
              height: DEFAULT_H,
            };
        dispatch({
          type: "CREATE",
          note: {
            id: depsRef.current.createId(),
            x: rect.left,
            y: rect.top,
            w: Math.max(MIN_W, rect.width),
            h: Math.max(MIN_H, rect.height),
            z: 0, // placeholder, the reducer assigns the real z
            color: "yellow",
            text: "",
          },
        });
        return;
      }

      if (s.moved) {
        dispatch({ type: "MOVE", id: s.id, x: s.baseX + dx, y: s.baseY + dy });
      }
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

    const begin = (s: DragSession) => {
      sessionRef.current = s;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

    const blankSession = (
      kind: DragKind,
      id: string,
      e: ReactPointerEvent,
    ): DragSession => ({
      kind,
      id,
      startX: e.clientX,
      startY: e.clientY,
      baseX: 0,
      baseY: 0,
      latestX: e.clientX,
      latestY: e.clientY,
      moved: false,
      boardLeft: 0,
      boardTop: 0,
      framePending: false,
      frameId: 0,
    });

    engineRef.current = {
      onBoardPointerDown: (e) => {
        // Only a press on the empty board starts a create. A press on a note
        // belongs to that note's gesture.
        if (e.button !== 0 || e.target !== e.currentTarget || sessionRef.current) return;
        const s = blankSession("create", "", e);
        const board = depsRef.current.boardRef.current;
        if (board) {
          const r = board.getBoundingClientRect();
          s.boardLeft = r.left;
          s.boardTop = r.top;
        }
        begin(s);
      },

      onNotePointerDown: (id, e) => {
        if (e.button !== 0 || sessionRef.current) return;
        const note = depsRef.current.stateRef.current.notes.find((n) => n.id === id);
        if (!note) return;
        depsRef.current.dispatch({ type: "BRING_TO_FRONT", id });
        const s = blankSession("move", id, e);
        s.baseX = note.x;
        s.baseY = note.y;
        begin(s);
      },
    };
  }

  // The engine is built once, so handler identities never change. Stable
  // handlers are what let React.memo skip untouched notes.
  return engineRef.current;
}
