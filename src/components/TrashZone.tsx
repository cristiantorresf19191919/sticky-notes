import { forwardRef } from "react";

/**
 * The drop target for deletion. It is passive: the drag engine caches this
 * element's rect once per gesture and sets data-armed while the cursor is
 * inside. The CSS attribute selector handles the styling.
 */
export const TrashZone = forwardRef<HTMLDivElement>(function TrashZone(_props, ref) {
  return (
    <div className="trash" data-testid="trash" ref={ref} aria-label="Drop a note here to delete it">
      🗑
    </div>
  );
});
