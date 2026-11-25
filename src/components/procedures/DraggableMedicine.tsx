import type { ReactNode } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { GripVertical } from "lucide-react";

interface Props<T> {
  /** The row this card shows. Must be the same object the surrounding Reorder.Group lists. */
  value: T;
  className?: string;
  /** False when there is only one medicine, so there is nothing to drag past. */
  draggable?: boolean;
  /** Receives the grip handle to place wherever the card wants it. */
  children: (handle: ReactNode) => ReactNode;
}

/**
 * One medicine card that can be dragged up or down by its grip handle.
 *
 * Only the handle starts a drag. The rest of the card is typing fields, a
 * searchable list and buttons, and letting the whole card drag would turn
 * selecting text or tapping a field into an accidental move. The handle takes
 * pointer events, so it works with a finger on a tablet as well as a mouse.
 *
 * Dragging only changes the order of the list. The number on the card is its
 * place in that list (MedicineNumberInput) and the saved order is the list
 * order, so the document prints the same numbers afterwards.
 */
export function DraggableMedicine<T>({ value, className, draggable = true, children }: Props<T>) {
  const controls = useDragControls();

  const handle = draggable ? (
    <button
      type="button"
      aria-label="Drag to reorder this medicine"
      title="Drag to reorder"
      // touch-none: a finger on the handle drags the card instead of scrolling the page.
      className="touch-none cursor-grab active:cursor-grabbing rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      onPointerDown={(e) => {
        // Keeps focus and text selection out of the way of the drag.
        e.preventDefault();
        controls.start(e);
      }}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  ) : null;

  return (
    <Reorder.Item
      as="div"
      value={value}
      dragListener={false}
      dragControls={controls}
      className={className}
      whileDrag={{ scale: 1.01, boxShadow: "0 8px 24px rgba(0,0,0,0.14)", zIndex: 20 }}
    >
      {children(handle)}
    </Reorder.Item>
  );
}
