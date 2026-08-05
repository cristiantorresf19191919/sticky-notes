/**
 * One engine for the three drag gestures: create, move and resize.
 * While a pointer is down nothing here updates React state, except the
 * bring-to-front dispatch on press and the create ghost (one div, at most
 * once per frame). Tracking listeners live on window so a gesture survives
 * the cursor leaving the note; transient visuals are direct DOM writes
 * batched per animation frame; a gesture ends with at most one dispatch.
 */

import { useRef } from "react";
import type { Dispatch, PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { BoardState, NotesAction } from "../model/model";
import { DEFAULT_H, DEFAULT_W, MIN_H, MIN_W } from "../model/model";
import type { Rect } from "../model/geometry";
import { clamp, domRectToRect, normalizeRect, pointInRect } from "../model/geometry";

export const DRAG_THRESHOLD = 3;

type DragKind = "create" | "move" | "resize";

interface DragSession {
  kind: DragKind;
  /** Note id; "" for a create gesture. */
  id: string;
  /** Pointer that started the gesture; events from other pointers are ignored. */
  pointerId: number | undefined;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
  baseW: number;
  baseH: number;
  latestX: number;
  latestY: number;
  moved: boolean;
  /** Measured once at gesture start: one layout read per drag, not per move. */
  trashRect: Rect | null;
  boardLeft: number;
  boardTop: number;
  boardW: number;
  boardH: number;
  overTrash: boolean;
  framePending: boolean;
  frameId: number;
}

export interface DragEngineDeps {
  dispatch: Dispatch<NotesAction>;
  /** Mirror of the reducer state, so the stable handlers read fresh data. */
  stateRef: RefObject<BoardState>;
  nodesRef: RefObject<Map<string, HTMLDivElement>>;
  trashRef: RefObject<HTMLDivElement | null>;
  boardRef: RefObject<HTMLDivElement | null>;
  /** Non-null while an editor is open; a board press then only dismisses it. */
  editingRef: RefObject<string | null>;
  onGhost: (rect: Rect | null) => void;
  createId: () => string;
}

export interface DragEngine {
  onBoardPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onNotePointerDown: (id: string, e: ReactPointerEvent<HTMLDivElement>) => void;
  onResizePointerDown: (id: string, e: ReactPointerEvent<HTMLDivElement>) => void;
}

export function useDragEngine(deps: DragEngineDeps): DragEngine {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const sessionRef = useRef<DragSession | null>(null);

  const engineRef = useRef<DragEngine | null>(null);
  if (!engineRef.current) {
    const noteEl = (id: string) => depsRef.current.nodesRef.current.get(id);

    const samePointer = (s: DragSession, ev: MouseEvent): boolean => {
      const id = (ev as Partial<PointerEvent>).pointerId;
      return id === undefined || s.pointerId === undefined || id === s.pointerId;
    };

    // Keep the note inside the board during the drag and at commit, so it
    // always stays reachable. An unmeasured board leaves the delta unchanged.
    const clampMoveDelta = (s: DragSession, dx: number, dy: number) => {
      if (s.boardW <= 0 || s.boardH <= 0) return { dx, dy };
      const x = clamp(s.baseX + dx, 0, Math.max(0, s.boardW - s.baseW));
      const y = clamp(s.baseY + dy, 0, Math.max(0, s.boardH - s.baseH));
      return { dx: x - s.baseX, dy: y - s.baseY };
    };

    // A resize may not push the note past the board edge, where its own
    // handle would become unreachable.
    const clampSize = (s: DragSession, w: number, h: number) => {
      let cw = Math.max(MIN_W, w);
      let ch = Math.max(MIN_H, h);
      if (s.boardW > 0 && s.boardH > 0) {
        cw = Math.min(cw, Math.max(MIN_W, s.boardW - s.baseX));
        ch = Math.min(ch, Math.max(MIN_H, s.boardH - s.baseY));
      }
      return { w: cw, h: ch };
    };

    const applyFrame = (s: DragSession) => {
      const dx = s.latestX - s.startX;
      const dy = s.latestY - s.startY;
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
      if (s.kind === "move") {
        const d = clampMoveDelta(s, dx, dy);
        el.style.transform = `translate(${d.dx}px, ${d.dy}px)`;
        // Feedback only for a real drag: click jitter must not arm the trash.
        const over =
          s.moved && s.trashRect !== null && pointInRect(s.latestX, s.latestY, s.trashRect);
        if (over !== s.overTrash) {
          s.overTrash = over;
          const trash = depsRef.current.trashRef.current;
          if (over) {
            el.dataset.overTrash = "true";
            if (trash) trash.dataset.armed = "true";
          } else {
            delete el.dataset.overTrash;
            if (trash) delete trash.dataset.armed;
          }
        }
      } else {
        const size = clampSize(s, s.baseW + dx, s.baseH + dy);
        el.style.width = `${size.w}px`;
        el.style.height = `${size.h}px`;
      }
    };

    const schedule = (s: DragSession) => {
      if (s.framePending) return;
      s.framePending = true;
      s.frameId = requestAnimationFrame(() => {
        s.framePending = false;
        applyFrame(s);
      });
    };

    // Rolls back everything the gesture drew. A resize commit is re-rendered
    // by React right after, so the same rollback serves commit and abort.
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
      const trash = depsRef.current.trashRef.current;
      if (el) {
        el.style.transform = "";
        delete el.dataset.overTrash;
        if (s.kind === "resize") {
          el.style.width = `${s.baseW}px`;
          el.style.height = `${s.baseH}px`;
        }
      }
      if (trash) delete trash.dataset.armed;
    };

    const onMove = (ev: MouseEvent) => {
      const s = sessionRef.current;
      if (!s || !samePointer(s, ev)) return;
      // No button pressed means the pointerup was missed; end the stuck drag.
      if (ev.buttons === 0) {
        end();
        return;
      }
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
      if (!s || !samePointer(s, ev)) return;
      end();
      const { dispatch } = depsRef.current;
      const dx = ev.clientX - s.startX;
      const dy = ev.clientY - s.startY;

      if (s.kind === "create") {
        // Tiny gesture = a click: default-size note at the press point.
        const drawn = s.moved
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
        const w = Math.max(MIN_W, s.boardW > 0 ? Math.min(drawn.width, s.boardW) : drawn.width);
        const h = Math.max(MIN_H, s.boardH > 0 ? Math.min(drawn.height, s.boardH) : drawn.height);
        // Keep the new note fully inside the board.
        const x = s.boardW > 0 ? clamp(drawn.left, 0, Math.max(0, s.boardW - w)) : drawn.left;
        const y = s.boardH > 0 ? clamp(drawn.top, 0, Math.max(0, s.boardH - h)) : drawn.top;
        dispatch({
          type: "CREATE",
          note: {
            id: depsRef.current.createId(),
            x,
            y,
            w,
            h,
            z: 0, // placeholder, the reducer assigns the real z
            color: "yellow",
            text: "",
          },
        });
        return;
      }

      if (s.kind === "move") {
        // Deleting requires a real drag; a click on a note over the trash
        // raises it instead.
        const droppedInTrash =
          s.moved && s.trashRect !== null && pointInRect(ev.clientX, ev.clientY, s.trashRect);
        if (droppedInTrash) {
          dispatch({ type: "REMOVE", id: s.id });
        } else if (s.moved) {
          const d = clampMoveDelta(s, dx, dy);
          dispatch({ type: "MOVE", id: s.id, x: s.baseX + d.dx, y: s.baseY + d.dy });
        }
        return;
      }

      if (s.moved) {
        const size = clampSize(s, s.baseW + dx, s.baseH + dy);
        dispatch({ type: "RESIZE", id: s.id, w: size.w, h: size.h });
      }
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") end();
    };

    const onCancel = (ev: Event) => {
      const s = sessionRef.current;
      if (s && ev instanceof MouseEvent && !samePointer(s, ev)) return;
      end();
    };

    const end = () => {
      const s = sessionRef.current;
      if (!s) return;
      sessionRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKeyDown);
      clearTransients(s);
    };

    const begin = (s: DragSession) => {
      sessionRef.current = s;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKeyDown);
    };

    const blankSession = (
      kind: DragKind,
      id: string,
      e: ReactPointerEvent,
    ): DragSession => ({
      kind,
      id,
      pointerId: (e as Partial<ReactPointerEvent>).pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: 0,
      baseY: 0,
      baseW: 0,
      baseH: 0,
      latestX: e.clientX,
      latestY: e.clientY,
      moved: false,
      trashRect: null,
      boardLeft: 0,
      boardTop: 0,
      boardW: 0,
      boardH: 0,
      overTrash: false,
      framePending: false,
      frameId: 0,
    });

    const measureBoard = (s: DragSession) => {
      const board = depsRef.current.boardRef.current;
      if (!board) return;
      const r = board.getBoundingClientRect();
      s.boardLeft = r.left;
      s.boardTop = r.top;
      s.boardW = r.width;
      s.boardH = r.height;
    };

    engineRef.current = {
      onBoardPointerDown: (e) => {
        // Only a press on the empty board itself starts a create.
        if (e.button !== 0 || e.target !== e.currentTarget || sessionRef.current) return;
        if (depsRef.current.editingRef.current !== null) return;
        const s = blankSession("create", "", e);
        measureBoard(s);
        begin(s);
      },

      onNotePointerDown: (id, e) => {
        if (e.button !== 0 || sessionRef.current) return;
        if (e.target instanceof Element && e.target.closest("[data-no-drag]")) return;
        const note = depsRef.current.stateRef.current.notes.find((n) => n.id === id);
        if (!note) return;
        depsRef.current.dispatch({ type: "BRING_TO_FRONT", id });
        const s = blankSession("move", id, e);
        s.baseX = note.x;
        s.baseY = note.y;
        s.baseW = note.w;
        s.baseH = note.h;
        const trash = depsRef.current.trashRef.current;
        if (trash) s.trashRect = domRectToRect(trash.getBoundingClientRect());
        measureBoard(s);
        begin(s);
      },

      onResizePointerDown: (id, e) => {
        if (e.button !== 0 || sessionRef.current) return;
        // The move handler must never see a press on the handle.
        e.stopPropagation();
        const note = depsRef.current.stateRef.current.notes.find((n) => n.id === id);
        if (!note) return;
        const s = blankSession("resize", id, e);
        s.baseX = note.x;
        s.baseY = note.y;
        s.baseW = note.w;
        s.baseH = note.h;
        measureBoard(s);
        begin(s);
      },
    };
  }

  // Built once: stable handler identities are what let React.memo skip notes.
  return engineRef.current;
}
