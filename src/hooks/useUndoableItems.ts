import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { HistoryState, ReconciliationItemDraft } from '@/types/reconciliation';

/** How many undo steps the counting table keeps. */
const MAX_HISTORY = 50;

/**
 * Undo/redo for the reconciliation counting table.
 *
 * `record` is called with the full item list **after** a change; the reducer in
 * `Reconciliation` mutates drafts in place often enough that per-field diffs would be
 * fragile. `reset` must be called whenever the draft is replaced wholesale (a new import,
 * or "clear all") so undo can never resurrect counts from an earlier, unrelated cycle —
 * which would have restored the wrong figures in an audit trail.
 */
export function useUndoableItems(onRestore: (items: ReconciliationItemDraft[]) => void) {
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // The ref mirrors the index so several edits in one tick cannot overwrite each other.
  const historyIndexRef = useRef(-1);

  const setIndex = useCallback((value: number) => {
    historyIndexRef.current = value;
    setHistoryIndex(value);
  }, []);

  const record = useCallback(
    (snapshot: ReconciliationItemDraft[]) => {
      const currentIndex = historyIndexRef.current;

      setHistory((previous) => {
        const kept = previous.slice(0, currentIndex + 1);
        const capped = kept.length >= MAX_HISTORY ? kept.slice(kept.length - MAX_HISTORY + 1) : kept;
        return [...capped, { items: [...snapshot], timestamp: Date.now() }];
      });

      setIndex(Math.min(currentIndex + 1, MAX_HISTORY - 1));
    },
    [setIndex]
  );

  const undo = useCallback(() => {
    const current = historyIndexRef.current;
    if (current <= 0) return;

    onRestore([...history[current - 1].items]);
    setIndex(current - 1);
    toast.success('Undo successful');
  }, [history, onRestore, setIndex]);

  const redo = useCallback(() => {
    const current = historyIndexRef.current;
    if (current >= history.length - 1) return;

    onRestore([...history[current + 1].items]);
    setIndex(current + 1);
    toast.success('Redo successful');
  }, [history, onRestore, setIndex]);

  const reset = useCallback(() => {
    setHistory([]);
    setIndex(-1);
  }, [setIndex]);

  return {
    record,
    undo,
    redo,
    reset,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
  };
}
