import Papa from 'papaparse';
import { uploadKindOf } from '@/lib/uploadValidation';

export interface ParsedRow {
  [key: string]: unknown;
}

/** A spreadsheet with more rows than this is rejected instead of freezing the tab. */
export const MAX_ROWS = 200_000;

/**
 * Decodes a CSV honouring a UTF-16 byte-order mark (some Windows exports), and removes NUL
 * characters: Kroll writes `"\0"` for empty quoted fields, which would otherwise show up as
 * invisible junk in DINs, descriptions and dates.
 */
async function readCsvText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
  const encoding = head[0] === 0xff && head[1] === 0xfe ? 'utf-16le' : head[0] === 0xfe && head[1] === 0xff ? 'utf-16be' : 'utf-8';
  const text = new TextDecoder(encoding).decode(buffer); // also drops a BOM
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u0000/g, '');
}

/**
 * The CPU-heavy part of an import: turning a CSV/Excel file into plain row objects.
 *
 * It runs inside a Web Worker (see `readRows.ts`), so a 50,000-row workbook no longer
 * freezes the page while it is parsed. It has no DOM dependency, which is also what lets
 * the same code run unchanged on the main thread as a fallback and under test.
 *
 * `xlsx` is imported on demand so it is only downloaded when someone uploads a workbook.
 */
export async function parseRowsCore(file: File): Promise<ParsedRow[]> {
  const kind = uploadKindOf(file.name);

  if (kind === 'csv') {
    // Papa is given the text rather than the File: inside a worker it would otherwise try
    // to use FileReaderSync and its own message protocol.
    const text = await readCsvText(file);
    const result = Papa.parse<ParsedRow>(text, { header: true, skipEmptyLines: true });

    if (result.data.length > MAX_ROWS) {
      throw new Error(`"${file.name}" has more than ${MAX_ROWS.toLocaleString()} rows`);
    }
    // Only a structural failure (e.g. an unterminated quote) is fatal; per-row warnings
    // such as "too few fields" are normal in supplier exports.
    const fatal = result.errors.find((error) => error.type === 'Quotes');
    if (fatal && result.data.length === 0) throw new Error(`Failed to parse CSV: ${fatal.message}`);

    return result.data;
  }

  if (kind === 'xlsx' || kind === 'xls') {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, {
      type: 'array',
      // Values only: formulas, HTML and styles are never needed and are extra attack surface.
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      // Stops a crafted sheet from expanding into millions of rows.
      sheetRows: MAX_ROWS + 1,
    });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error(`"${file.name}" has no worksheets`);

    const rows = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: '' });
    if (rows.length > MAX_ROWS) {
      throw new Error(`"${file.name}" has more than ${MAX_ROWS.toLocaleString()} rows`);
    }
    return rows;
  }

  throw new Error(`Unsupported file format: "${file.name}". Please upload .csv, .xlsx or .xls files.`);
}
