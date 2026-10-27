import { useEffect, useState } from 'react';
import {
  fetchReferenceEntries,
  getDinReferenceEntry,
  type DinReferenceEntry,
} from '@/lib/dinReference';

interface DinReferenceLookup {
  entry: DinReferenceEntry | null;
  loading: boolean;
}

/**
 * Resolves a single DIN against the server-side CDSA/DPD reference, fetching it on demand
 * and reusing the cached entry on later renders.
 */
export function useDinReferenceEntry(din: string | null | undefined): DinReferenceLookup {
  const [lookup, setLookup] = useState<DinReferenceLookup>(() => ({
    entry: getDinReferenceEntry(din ?? ''),
    loading: false,
  }));

  useEffect(() => {
    if (!din) {
      setLookup({ entry: null, loading: false });
      return;
    }

    const cached = getDinReferenceEntry(din);
    if (cached) {
      setLookup({ entry: cached, loading: false });
      return;
    }

    let cancelled = false;
    setLookup({ entry: null, loading: true });

    fetchReferenceEntries([din]).then(() => {
      if (!cancelled) setLookup({ entry: getDinReferenceEntry(din), loading: false });
    });

    return () => {
      cancelled = true;
    };
  }, [din]);

  return lookup;
}
