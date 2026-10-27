import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/dates';
import type { ReconciliationItemDraft } from '@/types/reconciliation';

const AUTOSAVE_INTERVAL_MS = 30_000;

interface DraftOptions {
  items: ReconciliationItemDraft[];
  /** Only autosave once there is parsed data the user would hate to lose. */
  enabled: boolean;
  /** The draft cycle already created for this session, if any. */
  draftId: string | null;
  onDraftCreated: (cycleId: string) => void;
}

function toRows(items: ReconciliationItemDraft[], cycleId: string, userId: string) {
  return items.map((item) => ({
    cycle_id: cycleId,
    user_id: userId,
    drug_id: item.drug_id,
    din: item.din,
    description: item.description,
    schedule: item.schedule,
    opening_balance: item.opening_balance,
    purchased_count: item.purchased_count,
    dispensed_count: item.dispensed_count,
    actual_count: item.actual_count,
    flag: item.flag,
    verify_note: item.verify_note,
    locations: item.locations,
  }));
}

/**
 * Periodically parks the in-progress reconciliation in the database so a closed tab does
 * not lose a count, and warns before the tab is closed while work is unsaved.
 *
 * The latest items are held in a ref, so the interval is not torn down and restarted on
 * every keystroke (which previously meant the autosave could never actually fire while
 * the user was typing).
 */
export function useReconciliationDraft({ items, enabled, draftId, onDraftCreated }: DraftOptions) {
  const itemsRef = useRef(items);
  const draftIdRef = useRef(draftId);
  const onCreatedRef = useRef(onDraftCreated);

  itemsRef.current = items;
  draftIdRef.current = draftId;
  onCreatedRef.current = onDraftCreated;

  useEffect(() => {
    if (!enabled) return;

    const saveDraft = async () => {
      const currentItems = itemsRef.current;
      if (currentItems.length === 0) return;

      try {
        const { data } = await supabase.auth.getUser();
        const userId = data.user?.id;
        if (!userId) return;

        if (draftIdRef.current) {
          const { error } = await supabase
            .from('reconciliation_items')
            .upsert(toRows(currentItems, draftIdRef.current, userId));
          if (error) console.error('[reconciliation] draft autosave failed:', error);
          return;
        }

        const { data: cycle, error: cycleError } = await supabase
          .from('reconciliation_cycles')
          .insert({
            user_id: userId,
            status: 'draft',
            name: `Draft - ${formatDate(new Date())}`,
            start_date: new Date().toISOString(),
          })
          .select()
          .single();

        if (cycleError) {
          console.error('[reconciliation] could not create draft cycle:', cycleError);
          return;
        }

        onCreatedRef.current(cycle.id);

        const { error: itemsError } = await supabase
          .from('reconciliation_items')
          .insert(toRows(currentItems, cycle.id, userId));
        if (itemsError) console.error('[reconciliation] could not save draft items:', itemsError);
      } catch (error) {
        console.error('[reconciliation] draft autosave failed:', error);
      }
    };

    const interval = setInterval(saveDraft, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled]);
}
