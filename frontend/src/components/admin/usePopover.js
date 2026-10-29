import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Open/closed state for a dropdown or popover: closes on Esc (focus goes back to the
 * trigger) and on any click outside `ref`. Phones get the same panel as a bottom sheet (CSS).
 */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  // Set when the panel would run off the right edge of the screen: it then opens right-aligned.
  const [flip, setFlip] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        ref.current?.querySelector('[data-popover-trigger]')?.focus();
      }
    };
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const panel = ref.current.querySelector('.ui-pop-panel');
    if (!panel) return;
    setFlip(false);
    const rect = panel.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) setFlip(true);
  }, [open]);

  return { open, setOpen, ref, flip };
}
