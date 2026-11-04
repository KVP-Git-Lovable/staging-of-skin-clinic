import { useRef, useState } from "react";

/**
 * The grip on a column's right edge.
 *
 * The width is committed on release, not while the pointer moves, and that is
 * deliberate. These tables are windowed by a virtualizer that measures real
 * row heights; resizing live would re-wrap the text, change those heights,
 * move the window, and re-enter the loop that once made the table flicker
 * forever (see the note above APPOINTMENT_COLUMN_WIDTHS). During the drag the
 * user gets a guide line, which costs nothing to move.
 */
export function ColumnResizeHandle({
  onResize,
  tableWidth,
}: {
  /** Called once, on release, with the change in share of the table. */
  onResize: (deltaShares: number) => void;
  /** Current table width in pixels, to turn pixels dragged into a share. */
  tableWidth: () => number;
}) {
  const startX = useRef(0);
  const [offset, setOffset] = useState<number | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Stops the click reaching the header, which sorts the column.
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;
    setOffset(0);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (offset === null) return;
    setOffset(e.clientX - startX.current);
  };

  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    if (offset === null) return;
    const width = tableWidth();
    if (width > 0 && offset !== 0) onResize((offset / width) * 100);
    setOffset(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Already released - releasing twice is not worth an error.
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-0 z-10 flex h-full w-3 translate-x-1/2 cursor-col-resize items-center justify-center select-none touch-none"
    >
      <span className="h-1/2 w-px bg-border" />
      {offset !== null && (
        <span
          className="pointer-events-none absolute top-0 h-screen w-px bg-primary"
          style={{ transform: `translateX(${offset}px)` }}
        />
      )}
    </div>
  );
}
