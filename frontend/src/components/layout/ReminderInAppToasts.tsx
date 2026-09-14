import { useEffect, useState } from 'react';
import {
  REMINDER_IN_APP_EVENT,
  type ReminderInAppToast,
  type ReminderSeverity,
} from '../../lib/reminders';

const AUTO_DISMISS_MS: Record<ReminderSeverity, number> = {
  green: 8000,
  yellow: 12000,
  red: 18000,
};

function toastToneClass(severity: ReminderSeverity) {
  if (severity === 'green') return 'reminder-toast reminder-toast--green';
  if (severity === 'yellow') return 'reminder-toast reminder-toast--yellow';
  return 'reminder-toast reminder-toast--red';
}

/**
 * Colored in-app reminder popups (green → yellow → red by notify tier).
 * Mounted in AppShell so they show on the dashboard and every other page.
 * Windows/desktop notifications stay separate in reminders.ts.
 */
export function ReminderInAppToasts() {
  const [toasts, setToasts] = useState<ReminderInAppToast[]>([]);

  useEffect(() => {
    function onToast(event: Event) {
      const detail = (event as CustomEvent<ReminderInAppToast>).detail;
      if (!detail?.reminderId) return;
      const id = detail.id;
      setToasts((prev) => {
        const withoutDup = prev.filter(
          (t) => !(t.reminderId === detail.reminderId && t.notifyCount === detail.notifyCount),
        );
        return [...withoutDup, detail].slice(-5);
      });
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, AUTO_DISMISS_MS[detail.severity]);
    }
    window.addEventListener(REMINDER_IN_APP_EVENT, onToast);
    return () => window.removeEventListener(REMINDER_IN_APP_EVENT, onToast);
  }, []);

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  if (toasts.length === 0) return null;

  return (
    <div className="reminder-toast-stack" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <div key={toast.id} className={toastToneClass(toast.severity)} role="status">
          <div className="reminder-toast-main">
            <p className="reminder-toast-title">{toast.title}</p>
            <p className="reminder-toast-body">{toast.body}</p>
            <div className="reminder-toast-actions">
              <button
                type="button"
                className="reminder-toast-dismiss"
                onClick={() => dismiss(toast.id)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
