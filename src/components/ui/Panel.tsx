import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

interface PanelProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Sticky action bar at the bottom (Save, Cancel...). */
  footer?: ReactNode;
}

const EXIT_MS = 200;

/** A side panel that slides in from the right (full width on phones). */
export function Panel({ open, title, onClose, children, footer }: PanelProps) {
  const [mounted, setMounted] = useState(open);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Latest onClose without re-running the effects below on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Move focus into the panel once, when it opens.
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open && !mounted) return null;

  // Rendered at the end of <body> so animated page containers cannot clip it.
  return createPortal(
    <div className="fixed inset-0 z-40" inert={!open || undefined}>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close panel"
        onClick={onClose}
        className={cn('absolute inset-0 bg-ink-900/30', open ? 'animate-fade-in' : 'animate-fade-out')}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col bg-surface shadow-[var(--shadow-pop)]',
          open ? 'animate-panel-in' : 'animate-panel-out',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink-900">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="press grid size-9 place-items-center rounded-full text-ink-700 hover:bg-ink-900/5"
          >
            <X aria-hidden className="size-5" />
            <span className="sr-only">Close</span>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}
