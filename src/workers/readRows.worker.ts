/// <reference lib="webworker" />
import { parseFileCore, type ParsedFile } from '@/lib/parseRowsCore';

export interface ReadRowsRequest {
  id: number;
  file: File;
  /** Keep only the columns the supplier parser reads (see `isSupplierColumn`). */
  prune: boolean;
}

export type ReadRowsResponse =
  | ({ id: number; ok: true } & ParsedFile)
  | { id: number; ok: false; error: string };

// Assigned (not addEventListener) AFTER the imports above have run: PapaParse installs its
// own global `onmessage` in a worker, and this must be the handler that wins.
self.onmessage = async (event: MessageEvent<ReadRowsRequest>) => {
  const { id, file, prune } = event.data;

  try {
    const parsed = await parseFileCore(file, { prune });
    const response: ReadRowsResponse = { id, ok: true, ...parsed };
    self.postMessage(response);
  } catch (error) {
    const response: ReadRowsResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to read file',
    };
    self.postMessage(response);
  }
};
