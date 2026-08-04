import { memo, useRef } from "react";
import type { FocusEvent, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { Note, NoteColor } from "../model/model";
import { bumpRenderCount } from "../dev/renderCounts";

const COLOR_BG: Record<NoteColor, string> = {
  yellow: "#fef3c7",
  mint: "#d1fae5",
  sky: "#e0f2fe",
  rose: "#ffe4e6",
};

/**
 * Mounted only while the note is being edited, so the cancel flag resets
 * naturally with every session. (Resetting it on focus events instead is
 * unreliable: browsers do not fire focus events while the window itself is
 * not focused.)
 */
function NoteEditor({
  noteId,
  initialText,
  onCommit,
  onCancel,
}: {
  noteId: string;
  initialText: string;
  onCommit: (id: string, text: string) => void;
  onCancel: () => void;
}) {
  // Escape discards the draft. The flag stops the blur that follows from
  // committing it anyway.
  const cancelledRef = useRef(false);

  const handleBlur = (e: FocusEvent<HTMLTextAreaElement>) => {
    if (cancelledRef.current) return;
    onCommit(noteId, e.currentTarget.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Escape") return;
    cancelledRef.current = true;
    onCancel();
  };

  return (
    <textarea
      className="note-editor"
      data-testid={`edit-${noteId}`}
      data-no-drag
      defaultValue={initialText}
      autoFocus
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}

export interface NoteViewProps {
  note: Note;
  isEditing: boolean;
  onNotePointerDown: (id: string, e: ReactPointerEvent<HTMLDivElement>) => void;
  onResizePointerDown: (id: string, e: ReactPointerEvent<HTMLDivElement>) => void;
  onStartEdit: (id: string) => void;
  onCommitText: (id: string, text: string) => void;
  onCancelEdit: () => void;
  onCycleColor: (id: string) => void;
  registerNode: (id: string, el: HTMLDivElement | null) => void;
}

/**
 * With memo, stable callbacks and the reducer keeping untouched notes
 * identical, a note re-renders only when its own data changes.
 */
export const NoteView = memo(function NoteView({
  note,
  isEditing,
  onNotePointerDown,
  onResizePointerDown,
  onStartEdit,
  onCommitText,
  onCancelEdit,
  onCycleColor,
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
      onDoubleClick={() => onStartEdit(note.id)}
      style={{
        left: note.x,
        top: note.y,
        width: note.w,
        height: note.h,
        zIndex: note.z,
        background: COLOR_BG[note.color],
      }}
    >
      {isEditing ? (
        <NoteEditor
          noteId={note.id}
          initialText={note.text}
          onCommit={onCommitText}
          onCancel={onCancelEdit}
        />
      ) : (
        <div className="note-text" data-testid={`text-${note.id}`}>
          {note.text}
        </div>
      )}
      <button
        className="note-color"
        data-testid={`color-${note.id}`}
        data-no-drag
        aria-label="Change color"
        onClick={() => onCycleColor(note.id)}
      />
      <div
        className="note-resize"
        data-testid={`resize-${note.id}`}
        onPointerDown={(e) => onResizePointerDown(note.id, e)}
      />
    </div>
  );
});
