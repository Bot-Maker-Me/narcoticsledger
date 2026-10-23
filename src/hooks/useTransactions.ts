import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { InventoryTransaction, TransactionInput, TransactionWithDrug } from '@/types/transaction';

const PAGE_SIZE = 10;

interface FetchParams {
  page: number;
  search?: string;
  type?: TransactionType;
  source?: string;
  startDate?: string;
  endDate?: string;
}

async function fetchTransactions(params: FetchParams): Promise<{
  data: TransactionWithDrug[];
  count: number;
}> {
  const { page, search, type, source, startDate, endDate } = params;
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  try {
    console.log('Fetching transactions with params:', { page, search, type, source, startDate, endDate });

    // If there's a search term, first find matching drug IDs
    let matchingDrugIds: string[] | null = null;
    if (search) {
      const { data: drugsData, error: drugsError } = await supabase
        .from('drugs')
        .select('id')
        .or(`din.ilike.%${search}%,description.ilike.%${search}%`);

      if (drugsError) {
        console.error('Drug search error:', drugsError);
        throw drugsError;
      }

      matchingDrugIds = drugsData?.map(d => d.id) ?? [];
      console.log(`Found ${matchingDrugIds.length} matching drugs for search: "${search}"`);

      // If no drugs match, return empty result immediately
      if (matchingDrugIds.length === 0) {
        return { data: [], count: 0 };
      }
    }

    // Start with basic query
    let query = supabase
      .from('inventory_transactions')
      .select('*, drugs(description, din)', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Apply search filter by drug IDs
    if (matchingDrugIds) {
      query = query.in('drug_id', matchingDrugIds);
    }

    // Apply type filter
    if (type) {
      query = query.eq('transaction_type', type);
    }

    // Apply source filter
    if (source) {
      query = query.eq('source', source);
    }

    // Apply date range filter
    if (startDate) {
      const startISO = new Date(startDate).toISOString();
      query = query.gte('created_at', startISO);
    }
    if (endDate) {
      const endISO = new Date(new Date(endDate).setDate(new Date(endDate).getDate() + 1)).toISOString();
      query = query.lt('created_at', endISO);
    }

    // Apply pagination after all filters
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('Transaction fetch error:', error);
      throw error;
    }

    console.log(`Successfully fetched ${data?.length || 0} transactions, total count: ${count}`);

    return {
      data: (data ?? []).map((row) => {
        const drug = row.drugs as any;
        return {
          id: row.id,
          user_id: row.user_id,
          drug_id: row.drug_id,
          type: row.transaction_type || row.type,
          quantity: row.quantity,
          notes: row.notes,
          source: row.source,
          created_at: row.date || row.created_at,
          drug_description: drug?.description ?? 'Unknown',
          drug_din: drug?.din ?? '--------',
        } as TransactionWithDrug;
      }),
      count: count ?? 0,
    };
  } catch (error) {
    console.error('Error in fetchTransactions:', error);
    throw error;
  }
}

async function addTransaction(input: TransactionInput): Promise<InventoryTransaction> {
  const { data, error } = await supabase.rpc('add_inventory_transaction', {
    p_drug_id: input.drug_id,
    p_type: input.type,
    p_quantity: input.quantity,
    p_notes: input.notes ?? null,
    p_source: input.source ?? 'manual',
  });

  if (error) throw error;
  return data as InventoryTransaction;
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
    },
  });
}
