import { memo } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Note, NoteColor } from "../model/model";
import { bumpRenderCount } from "../dev/renderCounts";

const COLOR_BG: Record<NoteColor, string> = {
  yellow: "#fef3c7",
  mint: "#d1fae5",
  sky: "#e0f2fe",
  rose: "#ffe4e6",
};

export interface NoteViewProps {
  note: Note;
  onNotePointerDown: (id: string, e: ReactPointerEvent<HTMLDivElement>) => void;
  onResizePointerDown: (id: string, e: ReactPointerEvent<HTMLDivElement>) => void;
  registerNode: (id: string, el: HTMLDivElement | null) => void;
}

/**
 * With memo, stable callbacks and the reducer keeping untouched notes
 * identical, a note re-renders only when its own data changes.
 */
export const NoteView = memo(function NoteView({
  note,
  onNotePointerDown,
  onResizePointerDown,
  registerNode,
}: NoteViewProps) {
  bumpRenderCount(note.id);

  return (
    <div
      className="note"
      data-testid={`note-${note.id}`}
      data-color={note.color}
      ref={(el) => registerNode(note.id, el)}
      onPointerDown={(e) => onNotePointerDown(note.id, e)}
      style={{
        left: note.x,
        top: note.y,
        width: note.w,
        height: note.h,
        zIndex: note.z,
        background: COLOR_BG[note.color],
      }}
    >
      <div className="note-text" data-testid={`text-${note.id}`}>
        {note.text}
      </div>
      <div
        className="note-resize"
        data-testid={`resize-${note.id}`}
        onPointerDown={(e) => onResizePointerDown(note.id, e)}
      />
    </div>
  );
});
