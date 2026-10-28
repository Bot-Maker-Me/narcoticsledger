/// <reference lib="webworker" />
import { parseRowsCore, type ParsedRow } from '@/lib/parseRowsCore';

export interface ReadRowsRequest {
  id: number;
  file: File;
}

export type ReadRowsResponse =
  | { id: number; ok: true; rows: ParsedRow[] }
  | { id: number; ok: false; error: string };

// Assigned (not addEventListener) AFTER the imports above have run: PapaParse installs its
// own global `onmessage` in a worker, and this must be the handler that wins.
self.onmessage = async (event: MessageEvent<ReadRowsRequest>) => {
  const { id, file } = event.data;

  try {
    const rows = await parseRowsCore(file);
    const response: ReadRowsResponse = { id, ok: true, rows };
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
