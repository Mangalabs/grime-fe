import { useEffect, useRef, useState } from "react";

// Open state for a trigger button and its popover. Clicking outside or
// pressing Escape closes it; Escape also hands focus back to the trigger.
// `openedWithKeyboard` tells the popover whether to move focus into itself:
// a mouse user doesn't need it, and the focus ring would only distract.
export function usePopover<T extends HTMLElement = HTMLDivElement>() {
  const [isOpen, setIsOpen] = useState(false);
  const [openedWithKeyboard, setOpenedWithKeyboard] = useState(false);
  const containerRef = useRef<T>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // The sidebar drawer also closes on Escape; only the popover should.
        event.stopPropagation();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [isOpen]);

  return {
    isOpen,
    openedWithKeyboard,
    close: () => setIsOpen(false),
    // A click from Enter or Space has no pointer position, so detail is 0.
    toggle: (event: React.MouseEvent) => {
      setOpenedWithKeyboard(event.detail === 0);
      setIsOpen((current) => !current);
    },
    containerRef,
    triggerRef,
  };
}
