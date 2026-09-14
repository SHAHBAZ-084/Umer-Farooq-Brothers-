import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  type MinimizedFormKind,
  useMinimizedFormsStore,
} from '../stores/minimizedFormsStore';

export type RestoreLocationState = {
  minimizedFormId?: string;
};

/**
 * Peek cache survives React 18 Strict Mode's mount→unmount→remount.
 * Claim removes the tray entry in an effect; the remount's useState initializer
 * must still be able to read the draft even though the store entry is gone.
 */
const restorePeekCache = new Map<string, { kind: MinimizedFormKind; formState: unknown }>();

function peekRestoredFormState(restoreId: string, kind: MinimizedFormKind): unknown | null {
  const cached = restorePeekCache.get(restoreId);
  if (cached) {
    return cached.kind === kind ? cached.formState : null;
  }

  const entry = useMinimizedFormsStore.getState().getById(restoreId);
  if (!entry || entry.kind !== kind) return null;

  restorePeekCache.set(restoreId, { kind: entry.kind, formState: entry.formState });
  return entry.formState;
}

/**
 * Restore minimized draft on mount (via location.state) and expose minimize().
 * Peeks non-destructively during state init; claims (removes tray entry) only
 * after mount commits in an effect. Session-memory only.
 */
export function useMinimizableForm<T>(kind: MinimizedFormKind) {
  const navigate = useNavigate();
  const location = useLocation();
  const minimizeIntoStore = useMinimizedFormsStore((s) => s.minimize);
  const claim = useMinimizedFormsStore((s) => s.claim);

  const restoreId = (location.state as RestoreLocationState | null)?.minimizedFormId;

  const [restoredState] = useState<T | null>(() => {
    const id = (location.state as RestoreLocationState | null)?.minimizedFormId;
    if (!id) return null;
    const formState = peekRestoredFormState(id, kind);
    return formState == null ? null : (formState as T);
  });

  useEffect(() => {
    if (!restoreId) return;

    // Only remove the tray chip once we successfully peeked/hydrated this kind.
    const peeked = restorePeekCache.get(restoreId);
    if (peeked && peeked.kind === kind) {
      claim(restoreId);
    }

    // Drop restore id from history so refresh/back doesn't re-trigger.
    navigate(location.pathname, { replace: true, state: {} });
  }, [restoreId, kind, claim, navigate, location.pathname]);

  const minimize = useCallback(
    (formState: T, label: string) => {
      minimizeIntoStore({ kind, label, formState });
      navigate('/');
    },
    [kind, minimizeIntoStore, navigate],
  );

  return { restoredState, minimize };
}
