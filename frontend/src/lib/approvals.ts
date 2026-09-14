export const APPROVALS_CHANGED_EVENT = 'approvals-changed';

export function notifyApprovalsChanged() {
  window.dispatchEvent(new Event(APPROVALS_CHANGED_EVENT));
}
