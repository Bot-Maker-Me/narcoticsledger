import { useEffect, useState } from 'react';
import { getDinReferenceEntry, isDinReferenceReady, loadDinReference } from '@/lib/dinReference';

/**
 * Gives components access to the CDSA/DPD DIN reference so entered DINs can be matched
 * to the reference product, its CDSA schedule and its pack size. Lookups stay
 * synchronous once the reference is ready.
 */
export function useDinReference() {
  const [ready, setReady] = useState(isDinReferenceReady());

  useEffect(() => {
    let cancelled = false;
    loadDinReference()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    ready,
    referenceFor: getDinReferenceEntry,
  };
}
