import { useCallback, useReducer, useRef } from "react";
import type { BoardState } from "./model/model";
import { initialBoard, notesReducer } from "./model/model";
import { useDragEngine } from "./hooks/useDragEngine";
import { NoteView } from "./components/NoteView";
import { RenderHud } from "./dev/RenderHud";

export default function App() {
  const [state, dispatch] = useReducer(notesReducer, initialBoard);

  // The engine's handlers are created once, so they read the current state
  // through this ref instead of a stale closure.
  const stateRef = useRef<BoardState>(state);
  stateRef.current = state;

  const nodesRef = useRef(new Map<string, HTMLDivElement>());

  const engine = useDragEngine({ dispatch, stateRef, nodesRef });

  const registerNode = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nodesRef.current.set(id, el);
    else nodesRef.current.delete(id);
  }, []);

  return (
    <main className="app">
      <header className="toolbar">
        <h1>Sticky Notes</h1>
      </header>
      <div className="board" data-testid="board">
        {state.notes.map((note) => (
          <NoteView
            key={note.id}
            note={note}
            onNotePointerDown={engine.onNotePointerDown}
            registerNode={registerNode}
          />
        ))}
      </div>
      {import.meta.env.DEV && <RenderHud />}
    </main>
  );
}
