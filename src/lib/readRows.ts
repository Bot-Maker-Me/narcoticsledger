import type { ParsedRow } from '@/lib/parseRowsCore';
import type { ReadRowsResponse } from '@/workers/readRows.worker';

export type { ParsedRow };

/** A worker that has not answered after this long is killed (a decompression bomb, say). */
const PARSE_TIMEOUT_MS = 90_000;

let nextRequestId = 1;

function readInWorker(file: File): Promise<ParsedRow[]> {
  return new Promise<ParsedRow[]>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/readRows.worker.ts', import.meta.url), { type: 'module' });
    const id = nextRequestId++;

    const finish = (settle: () => void) => {
      clearTimeout(timer);
      worker.terminate();
      settle();
    };

    const timer = setTimeout(
      () => finish(() => reject(new Error(`"${file.name}" took too long to read and was stopped`))),
      PARSE_TIMEOUT_MS
    );

    worker.onmessage = (event: MessageEvent<ReadRowsResponse>) => {
      const message = event.data;
      if (message.id !== id) return;
      finish(() => (message.ok ? resolve(message.rows) : reject(new Error(message.error))));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish(() => reject(new Error(event.message || `Could not read "${file.name}"`)));
    };

    worker.postMessage({ id, file });
  });
}

async function readOnMainThread(file: File): Promise<ParsedRow[]> {
  const { parseRowsCore } = await import('@/lib/parseRowsCore');
  return parseRowsCore(file);
}

const cache = new WeakMap<File, Promise<ParsedRow[]>>();

/**
 * Reads a file into row objects off the main thread.
 *
 * The result is cached per `File`, so the parse that starts the moment a file is dropped
 * (see `useFileList`) is simply awaited again when the user presses "Process" - which is
 * why processing feels instant.
 */
export function readFileRows(file: File): Promise<ParsedRow[]> {
  const cached = cache.get(file);
  if (cached) return cached;

  const pending = typeof Worker === 'undefined' ? readOnMainThread(file) : readInWorker(file);
  cache.set(file, pending);
  // A failed read must not be cached, or retrying the same File could never succeed.
  pending.catch(() => cache.delete(file));
  return pending;
}
