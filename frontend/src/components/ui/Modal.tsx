import type { ReactNode, MouseEvent } from 'react';
import { useEffect } from 'react';

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Tailwind max-width class. Default: max-w-md */
  maxWidthClassName?: string;
};

/**
 * Shared centered modal — teal header band + border matching the app nav chrome.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  maxWidthClassName = 'max-w-md',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function onOverlayClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
      onClick={onOverlayClick}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90vh] w-full ${maxWidthClassName} overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex max-h-[90vh] flex-col overflow-hidden bg-surface2 shadow-lg"
          style={{ border: '1px solid var(--nav-bg)' }}
        >
          <div
            className="flex shrink-0 items-center justify-between gap-3 px-4 py-3"
            style={{ backgroundColor: 'var(--nav-bg)' }}
          >
            <h2
              className="text-base font-semibold tracking-wide"
              style={{ color: 'var(--nav-text-hover)' }}
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm px-2.5 py-1 text-sm font-medium transition"
              style={{
                color: 'var(--nav-text-hover)',
                border: '1px solid var(--nav-text-hover)',
                background: 'transparent',
              }}
            >
              Close
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {children}
            {footer ? <div className="mt-4 flex flex-wrap justify-end gap-2">{footer}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
