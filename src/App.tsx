import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import type { BoardState } from "./model/model";
import { initialBoard, notesReducer } from "./model/model";
import type { Rect } from "./model/geometry";
import { useDragEngine } from "./hooks/useDragEngine";
import { NoteView } from "./components/NoteView";
import { RenderHud } from "./dev/RenderHud";

let idCounter = 0;
// The fallback includes a timestamp so it cannot collide with ids saved by
// earlier sessions.
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `n${Date.now().toString(36)}-${(++idCounter).toString(36)}`;

export default function App() {
  const [state, dispatch] = useReducer(notesReducer, initialBoard);

  // The engine's handlers are created once, so they read the current state
  // through this ref instead of a stale closure.
  const stateRef = useRef<BoardState>(state);
  stateRef.current = state;

  const [ghost, setGhost] = useState<Rect | null>(null);

  const nodesRef = useRef(new Map<string, HTMLDivElement>());
  const boardRef = useRef<HTMLDivElement | null>(null);

  const engine = useDragEngine({
    dispatch,
    stateRef,
    nodesRef,
    boardRef,
    onGhost: setGhost,
    createId: newId,
  });

  const registerNode = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nodesRef.current.set(id, el);
    else nodesRef.current.delete(id);
  }, []);

  const ghostStyle = useMemo(
    () =>
      ghost
        ? { left: ghost.left, top: ghost.top, width: ghost.width, height: ghost.height }
        : undefined,
    [ghost],
  );

  return (
    <main className="app">
      <header className="toolbar">
        <h1>Sticky Notes</h1>
      </header>
      <div
        className="board"
        data-testid="board"
        ref={boardRef}
        onPointerDown={engine.onBoardPointerDown}
      >
        {state.notes.map((note) => (
          <NoteView
            key={note.id}
            note={note}
            onNotePointerDown={engine.onNotePointerDown}
            onResizePointerDown={engine.onResizePointerDown}
            registerNode={registerNode}
          />
        ))}
        {ghostStyle && <div className="ghost" data-testid="ghost" style={ghostStyle} />}
      </div>
      {import.meta.env.DEV && <RenderHud />}
    </main>
  );
}
