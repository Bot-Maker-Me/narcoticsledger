import { useEffect, useState } from 'react';
import {
  getDinReferenceEntry,
  getDinReferenceSize,
  getReferencePackSize,
  isDinReferenceReady,
  loadDinReference,
} from '@/lib/dinReference';

/**
 * Gives components access to the CDSA/DPD DIN reference so entered quantities can be
 * multiplied by the product's pack size. The lookups stay synchronous once ready.
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
    count: ready ? getDinReferenceSize() : 0,
    packSizeFor: getReferencePackSize,
    referenceFor: getDinReferenceEntry,
  };
}
