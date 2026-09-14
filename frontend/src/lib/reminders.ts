import { api, type Reminder } from './api';

export const REMINDERS_CHANGED_EVENT = 'reminders-changed';
export const REMINDER_IN_APP_EVENT = 'reminder-in-app';

export function notifyRemindersChanged() {
  window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
}

export const REMINDER_HOUR_MS = 60 * 60 * 1000;
export const REMINDER_MAX_NOTIFICATIONS = 9;

export type ReminderSeverity = 'green' | 'yellow' | 'red';

export type ReminderInAppToast = {
  id: string;
  reminderId: number;
  severity: ReminderSeverity;
  title: string;
  body: string;
  notifyCount: number;
  catchUp?: boolean;
};

export function notifyReminderInApp(toast: Omit<ReminderInAppToast, 'id'> & { id?: string }) {
  const detail: ReminderInAppToast = {
    id: toast.id ?? `reminder-${toast.reminderId}-${toast.notifyCount}-${Date.now()}`,
    reminderId: toast.reminderId,
    severity: toast.severity,
    title: toast.title,
    body: toast.body,
    notifyCount: toast.notifyCount,
    catchUp: toast.catchUp,
  };
  window.dispatchEvent(new CustomEvent(REMINDER_IN_APP_EVENT, { detail }));
}

export function reminderSeverityForCount(notifyCount: number): ReminderSeverity {
  if (notifyCount <= 3) return 'green';
  if (notifyCount <= 6) return 'yellow';
  return 'red';
}

export function reminderSeverityLabel(severity: ReminderSeverity): string {
  if (severity === 'green') return 'Green';
  if (severity === 'yellow') return 'Yellow';
  return 'Red';
}

/** How many notifications should have fired by `now` (1 at due time, +1 each hour, cap 9). */
export function expectedNotifyCount(reminderAtIso: string, now = Date.now()): number {
  const due = new Date(reminderAtIso).getTime();
  if (!Number.isFinite(due) || now < due) return 0;
  const hoursElapsed = Math.floor((now - due) / REMINDER_HOUR_MS);
  return Math.min(REMINDER_MAX_NOTIFICATIONS, hoursElapsed + 1);
}

export function formatReminderWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

function showDesktopNotification(title: string, body: string, tag: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    // Browser Notification API — works in Electron renderer without custom IPC.
    // eslint-disable-next-line no-new
    new Notification(title, { body, tag, silent: false });
  } catch {
    // ignore notification failures
  }
}

function tierTitle(severity: ReminderSeverity, n: number): string {
  const label = reminderSeverityLabel(severity);
  return `${label} reminder (${n}/${REMINDER_MAX_NOTIFICATIONS})`;
}

function reminderBody(reminder: Reminder, when: string, amount: string) {
  const accountName = reminder.account?.name ?? `Account #${reminder.accountId}`;
  return `${accountName} — Rs ${amount}${reminder.note ? ` — ${reminder.note}` : ''} (due ${when})`;
}

/**
 * Process due / overdue reminders: catch-up once if behind, else hourly fires up to 9.
 * Always shows in-app toasts; also fires Windows/desktop notifications when permitted.
 * Persists notifyCount / lastNotifiedAt via the API.
 */
export async function processReminderNotifications(
  reminders: Reminder[],
): Promise<boolean> {
  const pending = reminders.filter((r) => r.status === 'PENDING');
  if (pending.length === 0) return false;

  // Desktop permission is optional — in-app popups still fire without it.
  await ensureNotificationPermission();

  const now = Date.now();
  let changed = false;

  for (const reminder of pending) {
    if (reminder.notifyCount >= REMINDER_MAX_NOTIFICATIONS) continue;

    const due = new Date(reminder.reminderAt).getTime();
    if (!Number.isFinite(due) || now < due) continue;

    // Next scheduled fire is reminderAt + notifyCount hours.
    const nextAt = due + reminder.notifyCount * REMINDER_HOUR_MS;
    if (now < nextAt) continue;

    const expected = expectedNotifyCount(reminder.reminderAt, now);
    const accountName = reminder.account?.name ?? `Account #${reminder.accountId}`;
    const when = formatReminderWhen(reminder.reminderAt);
    const amount = Number(reminder.amount).toLocaleString('en-PK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const body = reminderBody(reminder, when, amount);

    if (expected > reminder.notifyCount + 1) {
      // Missed multiple hourly slots while closed/idle — one catch-up, jump tier.
      const severity = reminderSeverityForCount(expected);
      const title = `You're late — ${accountName}`;
      const catchUpBody = `Reminder for ${accountName} (Rs ${amount}) was due ${when}. Please settle it.`;
      notifyReminderInApp({
        reminderId: reminder.id,
        severity,
        title,
        body: catchUpBody,
        notifyCount: expected,
        catchUp: true,
      });
      showDesktopNotification(title, catchUpBody, `reminder-catchup-${reminder.id}`);
      await api.recordReminderNotification(reminder.id, { notifyCount: expected });
      changed = true;
      continue;
    }

    const nextCount = Math.min(REMINDER_MAX_NOTIFICATIONS, reminder.notifyCount + 1);
    const severity = reminderSeverityForCount(nextCount);
    const title = tierTitle(severity, nextCount);
    notifyReminderInApp({
      reminderId: reminder.id,
      severity,
      title,
      body,
      notifyCount: nextCount,
    });
    showDesktopNotification(title, body, `reminder-${reminder.id}-${nextCount}`);
    await api.recordReminderNotification(reminder.id, { notifyCount: nextCount });
    changed = true;
  }

  return changed;
}

export async function refreshAndProcessReminders(): Promise<Reminder[]> {
  const rows = await api.listReminders('PENDING');
  const changed = await processReminderNotifications(rows);
  if (changed) {
    const fresh = await api.listReminders('PENDING');
    notifyRemindersChanged();
    return fresh;
  }
  return rows;
}
