/**
 * All board state and its transitions. No React imports, so the logic can
 * be tested on its own; components change state only by dispatching actions.
 */

export type NoteColor = "yellow" | "mint" | "sky" | "rose";

export interface Note {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly z: number;
  readonly color: NoteColor;
  readonly text: string;
}

export interface BoardState {
  readonly notes: readonly Note[];
  readonly nextZ: number;
}

export type NotesAction =
  | { type: "CREATE"; note: Note }
  | { type: "MOVE"; id: string; x: number; y: number }
  | { type: "RESIZE"; id: string; w: number; h: number }
  | { type: "BRING_TO_FRONT"; id: string }
  | { type: "REMOVE"; id: string }
  | { type: "EDIT_TEXT"; id: string; text: string }
  | { type: "SET_COLOR"; id: string; color: NoteColor };

export const MIN_W = 120;
export const MIN_H = 90;
export const DEFAULT_W = 160;
export const DEFAULT_H = 120;

export const COLOR_ORDER: readonly NoteColor[] = ["yellow", "mint", "sky", "rose"];

export function nextColor(color: NoteColor): NoteColor {
  const i = COLOR_ORDER.indexOf(color);
  return COLOR_ORDER[(i + 1) % COLOR_ORDER.length] ?? "yellow";
}

const seedNotes: Note[] = [
  { id: "a", x: 40, y: 40, w: 160, h: 120, z: 1, color: "yellow", text: "Drag me around" },
  { id: "b", x: 260, y: 60, w: 160, h: 120, z: 2, color: "mint", text: "Double-click to edit" },
];

export const initialBoard: BoardState = { notes: seedNotes, nextZ: 3 };

export function notesReducer(state: BoardState, action: NotesAction): BoardState {
  switch (action.type) {
    case "CREATE":
      // The reducer assigns z (callers pass z: 0), so creation and raising
      // share the same counter.
      return {
        notes: [...state.notes, { ...action.note, z: state.nextZ }],
        nextZ: state.nextZ + 1,
      };

    case "MOVE":
      // Untouched notes keep their identity, so React.memo can skip them.
      return {
        ...state,
        notes: state.notes.map((n) =>
          n.id === action.id ? { ...n, x: action.x, y: action.y } : n,
        ),
      };

    case "RESIZE":
      // Clamped here too, so no code path can store a note below minimum.
      return {
        ...state,
        notes: state.notes.map((n) =>
          n.id === action.id
            ? { ...n, w: Math.max(MIN_W, action.w), h: Math.max(MIN_H, action.h) }
            : n,
        ),
      };

    case "BRING_TO_FRONT": {
      const target = state.notes.find((n) => n.id === action.id);
      if (!target) return state;
      const top = Math.max(...state.notes.map((n) => n.z));
      // Already on top: same state reference, so useReducer skips the render.
      if (target.z === top) return state;
      return {
        notes: state.notes.map((n) =>
          n.id === action.id ? { ...n, z: state.nextZ } : n,
        ),
        nextZ: state.nextZ + 1,
      };
    }

    case "REMOVE":
      return { ...state, notes: state.notes.filter((n) => n.id !== action.id) };

    case "EDIT_TEXT": {
      const target = state.notes.find((n) => n.id === action.id);
      if (!target || target.text === action.text) return state;
      return {
        ...state,
        notes: state.notes.map((n) =>
          n.id === action.id ? { ...n, text: action.text } : n,
        ),
      };
    }

    case "SET_COLOR":
      return {
        ...state,
        notes: state.notes.map((n) =>
          n.id === action.id ? { ...n, color: action.color } : n,
        ),
      };

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
