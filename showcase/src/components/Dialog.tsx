import { useEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}

/** Modal built on the native <dialog>: focus trap, Esc to close and inert page come for free. */
export function Dialog({ open, onClose, label, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Freeze the page behind the modal while it is open.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself, not on its content.
        if (e.target === ref.current) onClose();
      }}
      className="dialog-pop m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-5xl overflow-hidden rounded-3xl border border-line bg-page p-0 text-ink shadow-2xl backdrop:bg-black/55 backdrop:backdrop-blur-sm"
    >
      {open && children}
    </dialog>
  );
}
