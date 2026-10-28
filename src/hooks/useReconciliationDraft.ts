import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/errors';
import { DraftSaver, type DraftStatus } from '@/lib/draftSaver';
import { toItemPayload, type ReconciliationItemPayload } from '@/lib/reconciliationPayload';
import type { ReconciliationItemDraft } from '@/types/reconciliation';

/** Quiet time after the last edit before the draft is written. */
const AUTOSAVE_DEBOUNCE_MS = 1500;

interface DraftOptions {
  items: ReconciliationItemDraft[];
  /** Only save once there is parsed data the user would hate to lose. */
  enabled: boolean;
}

/**
 * Keeps the in-progress reconciliation in the database so a closed tab or a crash never
 * loses a count.
 *
 * - The first snapshot is saved immediately (the draft exists the moment the files are
 *   processed); later edits are debounced, and only sent when something that is actually
 *   stored has changed.
 * - Each save goes through `save_reconciliation_draft`: one atomic, audited call that
 *   replaces the draft's rows in place. (The previous interval timer re-inserted every row
 *   on each tick, which is how a 164-DIN draft grew to 2,132 rows.)
 * - The browser's "leave this page?" prompt only appears while something is unsaved.
 */
export function useReconciliationDraft({ items, enabled }: DraftOptions) {
  const [status, setStatus] = useState<DraftStatus>('idle');
  const draftIdRef = useRef<string | null>(null);
  const latestRef = useRef<{ key: string; payload: ReconciliationItemPayload[] } | null>(null);
  // Bumped whenever the draft is forgotten, so a write that is still in flight cannot
  // resurrect a draft id that a newer cycle (or import) has already replaced.
  const saveTokenRef = useRef(0);

  const saver = useMemo(
    () =>
      new DraftSaver<ReconciliationItemPayload[]>({
        debounceMs: AUTOSAVE_DEBOUNCE_MS,
        onStatus: setStatus,
        onError: (error) => reportError(error, { scope: 'reconciliation-draft' }),
        save: async (payload) => {
          const token = saveTokenRef.current;
          const { data, error } = await supabase.rpc('save_reconciliation_draft', {
            p_cycle_id: draftIdRef.current,
            p_items: payload,
          });
          if (error) throw error;
          if (token === saveTokenRef.current) draftIdRef.current = data as string;
        },
      }),
    []
  );

  const snapshot = useMemo(() => {
    if (!enabled || items.length === 0) return null;
    const payload = toItemPayload(items);
    return { key: JSON.stringify(payload), payload };
  }, [items, enabled]);

  useEffect(() => {
    if (!snapshot) return;
    latestRef.current = snapshot;
    saver.submit(snapshot.key, snapshot.payload, draftIdRef.current === null);
  }, [snapshot, saver]);

  // Write straight away when the tab is hidden or the user navigates inside the app.
  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') void saver.flush();
    };
    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('pagehide', flushWhenHidden);

    return () => {
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('pagehide', flushWhenHidden);
      void saver.flush();
      saver.dispose();
    };
  }, [saver]);

  // Warn before closing the tab only while there is something unsaved.
  const unsaved = status === 'dirty' || status === 'saving' || status === 'error';
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  /**
   * Stops autosaving and returns the draft's id, so the explicit "Save Cycle" promotes this
   * draft instead of creating a second one.
   *
   * A draft write that is already in flight is only waited for when the id is still unknown:
   * once the draft exists, its id is all the explicit save needs, and waiting for a write
   * that the cycle save is about to overwrite cost an extra round trip on every Save Cycle.
   */
  const settle = useCallback(async (): Promise<string | null> => {
    if (draftIdRef.current !== null) {
      void saver.cancelAndSettle();
      return draftIdRef.current;
    }

    await saver.cancelAndSettle();
    return draftIdRef.current;
  }, [saver]);

  /** Resumes autosaving after an explicit save failed. */
  const resume = useCallback(() => {
    const latest = latestRef.current;
    if (latest) saver.submit(`${latest.key}#resume`, latest.payload, true);
  }, [saver]);

  /** A new import replaces the draft wholesale: forget the old draft entirely. */
  const reset = useCallback(() => {
    saveTokenRef.current += 1;
    saver.reset();
    draftIdRef.current = null;
    latestRef.current = null;
  }, [saver]);

  return { status, settle, resume, reset };
}
