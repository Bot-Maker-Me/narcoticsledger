import type { ParsedFile, ParsedRow } from '@/lib/parseRowsCore';
import type { ReadRowsResponse } from '@/workers/readRows.worker';

export type { ParsedFile, ParsedRow };

/** A worker that has not answered after this long is killed (a decompression bomb, say). */
const PARSE_TIMEOUT_MS = 120_000;

let nextRequestId = 1;

function readInWorker(file: File, prune: boolean): Promise<ParsedFile> {
  return new Promise<ParsedFile>((resolve, reject) => {
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
      finish(() =>
        message.ok
          ? resolve({ rows: message.rows, columns: message.columns, sample: message.sample })
          : reject(new Error(message.error))
      );
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish(() => reject(new Error(event.message || `Could not read "${file.name}"`)));
    };

    worker.postMessage({ id, file, prune });
  });
}

async function readOnMainThread(file: File, prune: boolean): Promise<ParsedFile> {
  const { parseFileCore } = await import('@/lib/parseRowsCore');
  return parseFileCore(file, { prune });
}

const caches = {
  all: new WeakMap<File, Promise<ParsedFile>>(),
  supplier: new WeakMap<File, Promise<ParsedFile>>(),
};

function read(file: File, prune: boolean): Promise<ParsedFile> {
  const cache = prune ? caches.supplier : caches.all;
  const cached = cache.get(file);
  if (cached) return cached;

  const pending = typeof Worker === 'undefined' ? readOnMainThread(file, prune) : readInWorker(file, prune);
  cache.set(file, pending);
  // A failed read must not be cached, or retrying the same File could never succeed.
  pending.catch(() => cache.delete(file));
  return pending;
}

/**
 * Reads a supplier export (McKesson / Kroll) off the main thread, keeping only the columns
 * the parser uses. The result is cached per `File`, so the parse that starts the moment a
 * file is dropped (see `useFileList`) is simply awaited again when the user presses
 * "Process", which is why processing feels instant.
 */
export function readSupplierFile(file: File): Promise<ParsedFile> {
  return read(file, true);
}

/** Reads every row with every column (used for the small saved-counts file). */
export async function readFileRows(file: File): Promise<ParsedRow[]> {
  return (await read(file, false)).rows;
}
