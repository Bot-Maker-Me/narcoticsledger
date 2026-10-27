import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  TransactionInput,
  TransactionType,
  TransactionWithDrug,
} from '@/types/transaction';

const PAGE_SIZE = 10;

interface FetchParams {
  page: number;
  search?: string;
  type?: TransactionType;
  source?: string;
  startDate?: string;
  endDate?: string;
}

const TRANSACTION_COLUMNS =
  'id, user_id, drug_id, transaction_type, quantity, notes, source, file_name, date, created_at, voided_at, drugs(description, din)';

/**
 * Strips the characters that would break PostgREST's `or=(...)` filter grammar, so a
 * search term can never widen or alter the query it is embedded in.
 */
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()"'\\]/g, ' ').trim();
}

async function fetchTransactions(params: FetchParams): Promise<{
  data: TransactionWithDrug[];
  count: number;
}> {
  const { page, search, type, source, startDate, endDate } = params;
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // If there's a search term, first find matching drug IDs
  let matchingDrugIds: string[] | null = null;
  const term = search ? sanitizeSearchTerm(search) : '';

  if (term) {
    const { data: drugsData, error: drugsError } = await supabase
      .from('drugs')
      .select('id')
      .or(`din.ilike.%${term}%,description.ilike.%${term}%`);

    if (drugsError) throw drugsError;

    matchingDrugIds = drugsData?.map((d) => d.id) ?? [];
    // No drugs match, so no transactions can.
    if (matchingDrugIds.length === 0) return { data: [], count: 0 };
  }

  let query = supabase
    .from('inventory_transactions')
    .select(TRANSACTION_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (matchingDrugIds) query = query.in('drug_id', matchingDrugIds);
  if (type) query = query.eq('transaction_type', type);
  if (source) query = query.eq('source', source);

  if (startDate) {
    query = query.gte('created_at', new Date(startDate).toISOString());
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);
    query = query.lt('created_at', end.toISOString());
  }

  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    data: (data ?? []).map((row) => {
      const drug = row.drugs as unknown as { description: string; din: string } | null;
      return {
        id: row.id,
        user_id: row.user_id,
        drug_id: row.drug_id,
        type: String(row.transaction_type ?? '').toUpperCase() as TransactionType,
        quantity: row.quantity,
        notes: row.notes,
        source: row.source,
        file_name: row.file_name,
        date: row.date,
        created_at: row.date || row.created_at,
        voided_at: row.voided_at ?? null,
        drug_description: drug?.description ?? 'Unknown',
        drug_din: drug?.din ?? '--------',
      } satisfies TransactionWithDrug;
    }),
    count: count ?? 0,
  };
}

/**
 * Writes one manual ledger entry through the owning RPC, which validates ownership, the
 * quantity sign and (for reductions) that stock does not go negative.
 */
async function addTransaction(input: TransactionInput): Promise<void> {
  const args = {
    p_drug_id: input.drug_id,
    p_quantity: input.quantity,
    p_notes: input.notes ?? null,
  };

  const result =
    input.type === 'PURCHASE'
      ? await supabase.rpc('add_purchase', args)
      : input.type === 'DISPENSE'
        ? await supabase.rpc('dispense_drug', { ...args, p_patient_name: input.patient_name ?? '' })
        : await supabase.rpc('adjust_stock', args);

  if (result.error) throw result.error;
}

export function useTransactions(page: number) {
  return useQuery({
    queryKey: ['transactions', page],
    queryFn: () => fetchTransactions({ page }),
    placeholderData: (prev) => prev,
  });
}

export function useFilteredTransactions(params: FetchParams) {
  return useQuery({
    queryKey: ['transactions', 'filtered', params],
    queryFn: () => fetchTransactions(params),
    placeholderData: (prev) => prev,
  });
}

export function useAddTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['drugs'] });
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['imported-records'] });
    },
  });
}
