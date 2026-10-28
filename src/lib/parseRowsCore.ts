import Papa from 'papaparse';
import { uploadKindOf } from '@/lib/uploadValidation';

export interface ParsedRow {
  [key: string]: unknown;
}

/** A spreadsheet with more rows than this is rejected instead of freezing the tab. */
export const MAX_ROWS = 200_000;

const UTF16LE_BOM = [0xff, 0xfe];
const UTF16BE_BOM = [0xfe, 0xff];

/**
 * Decodes an export to text from its bytes.
 *
 * The file is never read with `File.text()`: that assumes UTF-8 and silently mangles the
 * single-byte Windows-1252 exports supplier systems still produce. A byte order mark picks
 * UTF-16; otherwise strict UTF-8 is tried first and Windows-1252 is the fallback, so a
 * legacy export gives back real characters instead of U+FFFD replacement ones.
 */
function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === UTF16LE_BOM[0] && bytes[1] === UTF16LE_BOM[1]) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes[0] === UTF16BE_BOM[0] && bytes[1] === UTF16BE_BOM[1]) {
    return new TextDecoder('utf-16be').decode(bytes);
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
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
    // Read the bytes and decode them here. Papa is given text rather than the File, because
    // inside a worker it would otherwise try to use FileReaderSync and its own protocol.
    const text = decodeText(new Uint8Array(await file.arrayBuffer()));

    // Kroll writes a NUL placeholder into every empty column, and a NUL means nothing in a
    // text export. They are dropped in one pass over the text, which is cheaper than a Papa
    // `transform` that would run once per cell (1.8 million of them for a 40,000-row file).
    const cleaned = text.replace(/\0/g, '');

    const result = Papa.parse<ParsedRow>(cleaned, {
      header: true,
      skipEmptyLines: true,
      // Values stay strings: the import reads quantities and dates with its own parsers, and
      // inference guesses wrong on leading-zero DINs.
      dynamicTyping: false,
    });

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
