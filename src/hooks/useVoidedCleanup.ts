import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TransactionType } from '@/types/transaction';

/** How the cleanup card groups its voided rows. */
export type VoidedGroupBy = 'month' | 'file';

/**
 * Rows with no file name — imports made before the file name was stored. Both the summary
 * and the purge use the empty string for them, so a bucket can always be purged by name.
 */
export const NO_FILE_KEY = '';

export interface VoidedGroup {
  /** `YYYY-MM` for a month, the file name for a file, or `NO_FILE_KEY`. */
  bucketKey: string;
  rowCount: number;
  /** Ledger days of the rows in the bucket, `YYYY-MM-DD`. */
  firstDate: string | null;
  lastDate: string | null;
  kinds: TransactionType[];
  /** When the rows were voided. */
  lastVoided: string | null;
}

interface VoidedSummaryRow {
  bucket_key: string | null;
  row_count: number | null;
  first_date: string | null;
  last_date: string | null;
  kinds: string[] | null;
  last_voided: string | null;
}

async function fetchVoidedSummary(groupBy: VoidedGroupBy): Promise<VoidedGroup[]> {
  const { data, error } = await supabase.rpc('voided_ledger_summary', { p_group_by: groupBy });
  if (error) throw error;

  return ((data ?? []) as VoidedSummaryRow[]).map((row) => ({
    bucketKey: row.bucket_key ?? NO_FILE_KEY,
    rowCount: Number(row.row_count ?? 0),
    firstDate: row.first_date,
    lastDate: row.last_date,
    kinds: (row.kinds ?? []) as TransactionType[],
    lastVoided: row.last_voided,
  }));
}

export function useVoidedSummary(groupBy: VoidedGroupBy) {
  return useQuery({
    queryKey: ['voided-summary', groupBy],
    queryFn: () => fetchVoidedSummary(groupBy),
    // Switching between the month and file views keeps the previous rows on screen instead
    // of blanking the card, and re-mounting the page does not re-query for a minute.
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}

/** One permanent purge. Exactly one field is set — the database rejects anything else. */
export interface PurgeScope {
  /** `YYYY-MM`, using the ledger (transaction) date. */
  month?: string;
  /** A file name, or `NO_FILE_KEY` for rows that have none. */
  fileName?: string;
  /** The caller's whole voided set. */
  all?: boolean;
}

async function purgeVoidedRecords(scope: PurgeScope): Promise<number> {
  const { data, error } = await supabase.rpc('purge_voided_transactions', {
    p_month: scope.month ?? null,
    p_file_name: scope.fileName ?? null,
    p_all: scope.all ?? false,
  });

  if (error) throw error;
  return Number(data ?? 0);
}

export function usePurgeVoidedRecords() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: purgeVoidedRecords,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voided-summary'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['imported-records'] });
      queryClient.invalidateQueries({ queryKey: ['drugs'] });
    },
  });
}
