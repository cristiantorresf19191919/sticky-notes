import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import type { BoardState } from "./model/model";
import { nextColor, notesReducer } from "./model/model";
import type { Rect } from "./model/geometry";
import { createMockApi } from "./model/persistence";
import { loadBoard } from "./model/persistence";
import { useDragEngine } from "./hooks/useDragEngine";
import { useDebouncedSave } from "./hooks/useDebouncedSave";
import { NoteView } from "./components/NoteView";
import { TrashZone } from "./components/TrashZone";
import { RenderHud } from "./dev/RenderHud";

export const api = createMockApi();

let idCounter = 0;
// The fallback includes a timestamp so it cannot collide with ids saved by
// earlier sessions.
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `n${Date.now().toString(36)}-${(++idCounter).toString(36)}`;

export default function App() {
  const [state, dispatch] = useReducer(notesReducer, undefined, loadBoard);

  // The engine's handlers are created once, so they read the current state
  // through this ref instead of a stale closure.
  const stateRef = useRef<BoardState>(state);
  stateRef.current = state;

  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRef = useRef<string | null>(editingId);
  editingRef.current = editingId;
  const [ghost, setGhost] = useState<Rect | null>(null);

  const nodesRef = useRef(new Map<string, HTMLDivElement>());
  const trashRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const engine = useDragEngine({
    dispatch,
    stateRef,
    nodesRef,
    trashRef,
    boardRef,
    editingRef,
    onGhost: setGhost,
    createId: newId,
  });

  useDebouncedSave(state, api);

  const registerNode = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nodesRef.current.set(id, el);
    else nodesRef.current.delete(id);
  }, []);

  const handleStartEdit = useCallback((id: string) => setEditingId(id), []);
  const handleCancelEdit = useCallback(() => setEditingId(null), []);
  const handleCommitText = useCallback((id: string, text: string) => {
    dispatch({ type: "EDIT_TEXT", id, text });
    setEditingId(null);
  }, []);
  const handleCycleColor = useCallback((id: string) => {
    const note = stateRef.current.notes.find((n) => n.id === id);
    if (note) dispatch({ type: "SET_COLOR", id, color: nextColor(note.color) });
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
        <p>Draw on empty space to create · drag to move · corner to resize · drop on 🗑 to delete · double-click to edit</p>
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
            isEditing={editingId === note.id}
            onNotePointerDown={engine.onNotePointerDown}
            onResizePointerDown={engine.onResizePointerDown}
            onStartEdit={handleStartEdit}
            onCommitText={handleCommitText}
            onCancelEdit={handleCancelEdit}
            onCycleColor={handleCycleColor}
            registerNode={registerNode}
          />
        ))}
        {ghostStyle && <div className="ghost" data-testid="ghost" style={ghostStyle} />}
        <TrashZone ref={trashRef} />
      </div>
      {import.meta.env.DEV && <RenderHud />}
    </main>
  );
}
