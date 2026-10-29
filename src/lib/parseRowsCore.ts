import Papa from 'papaparse';
import { isSupplierColumn } from '@/lib/columns';
import { uploadKindOf } from '@/lib/uploadValidation';

export interface ParsedRow {
  [key: string]: unknown;
}

/** What reading a file produces: the rows plus what the preview dialog needs. */
export interface ParsedFile {
  /** One object per data row. With `prune`, only the columns the supplier parser reads. */
  rows: ParsedRow[];
  /** Every heading in the file, pruned or not (the preview shows what was detected). */
  columns: string[];
  /** The first few rows with ALL their columns. */
  sample: ParsedRow[];
}

export interface ParseOptions {
  /** Keep only the columns `isSupplierColumn` accepts. */
  prune?: boolean;
}

/** A spreadsheet with more rows than this is rejected instead of freezing the tab. */
export const MAX_ROWS = 200_000;

const SAMPLE_ROWS = 5;

/**
 * Decodes a CSV honouring a UTF-16 byte-order mark (some Windows exports), and removes NUL
 * characters: Kroll writes `"\0"` for empty quoted fields, which would otherwise show up as
 * invisible junk in DINs, descriptions and dates.
 */
async function readCsvText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
  const encoding =
    head[0] === 0xff && head[1] === 0xfe ? 'utf-16le' : head[0] === 0xfe && head[1] === 0xff ? 'utf-16be' : 'utf-8';
  const text = new TextDecoder(encoding).decode(buffer); // also drops a BOM
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u0000/g, '');
}

/** Headings made unique the way a spreadsheet reader does it: `Name`, `Name_1`, `Name_2`. */
function uniqueHeaders(cells: unknown[]): string[] {
  const seen = new Map<string, number>();
  return cells.map((cell) => {
    const base = String(cell ?? '').trim() === '' ? '__EMPTY' : String(cell);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count}`;
  });
}

/**
 * Turns a stream of cell arrays (the first one being the headings) into row objects,
 * building objects only for the columns that are kept. Rows are never held as arrays of
 * 45 strings, which is what made the previous `header: true` approach slow and heavy.
 */
class RowCollector {
  readonly rows: ParsedRow[] = [];
  readonly sample: ParsedRow[] = [];
  columns: string[] = [];
  count = 0;
  tooMany = false;

  private keptIndexes: number[] = [];
  private keptNames: string[] = [];

  constructor(private readonly prune: boolean) {}

  /** Returns false once the row limit is hit, so the caller can stop reading. */
  add(cells: unknown[]): boolean {
    if (this.columns.length === 0) {
      this.columns = uniqueHeaders(cells);
      this.columns.forEach((name, index) => {
        if (!this.prune || isSupplierColumn(name)) {
          this.keptIndexes.push(index);
          this.keptNames.push(name);
        }
      });
      return true;
    }

    if (this.count >= MAX_ROWS) {
      this.tooMany = true;
      return false;
    }
    this.count += 1;

    if (this.sample.length < SAMPLE_ROWS) {
      const full: ParsedRow = {};
      this.columns.forEach((name, index) => (full[name] = cells[index] ?? ''));
      this.sample.push(full);
    }

    const row: ParsedRow = {};
    for (let i = 0; i < this.keptIndexes.length; i += 1) {
      row[this.keptNames[i]] = cells[this.keptIndexes[i]] ?? '';
    }
    this.rows.push(row);
    return true;
  }

  finish(fileName: string): ParsedFile {
    if (this.tooMany) throw new Error(`"${fileName}" has more than ${MAX_ROWS.toLocaleString()} rows`);
    return { rows: this.rows, columns: this.columns, sample: this.sample };
  }
}

/**
 * The CPU-heavy part of an import: turning a CSV/Excel file into plain row objects.
 *
 * It runs inside a Web Worker (see `readRows.ts`), so a 100,000-row export no longer
 * freezes the page while it is parsed. It has no DOM dependency, which is also what lets
 * the same code run unchanged on the main thread as a fallback and under test.
 *
 * `xlsx` is imported on demand so it is only downloaded when someone uploads a workbook.
 */
export async function parseFileCore(file: File, options: ParseOptions = {}): Promise<ParsedFile> {
  const kind = uploadKindOf(file.name);
  const collector = new RowCollector(options.prune ?? false);

  if (kind === 'csv') {
    // Papa is given the text rather than the File: inside a worker it would otherwise try
    // to use FileReaderSync and its own message protocol. `step` streams one row at a
    // time, so only the kept columns are ever stored.
    const text = await readCsvText(file);
    let fatal = null as string | null;

    Papa.parse<string[]>(text, {
      skipEmptyLines: true,
      step: (result, parser) => {
        if (!collector.add(result.data)) {
          parser.abort();
          return;
        }
        // Only a structural failure (an unterminated quote) is fatal; per-row warnings such
        // as "too few fields" are normal in supplier exports.
        const quoteError = result.errors.find((error) => error.type === 'Quotes');
        if (quoteError && collector.count === 0) fatal = quoteError.message;
      },
    });

    if (fatal && collector.count === 0) throw new Error(`Failed to parse CSV: ${fatal}`);
    return collector.finish(file.name);
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
      sheetRows: MAX_ROWS + 2,
    });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error(`"${file.name}" has no worksheets`);

    const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false });
    for (const cells of table) {
      if (!collector.add(cells)) break;
    }
    return collector.finish(file.name);
  }

  throw new Error(`Unsupported file format: "${file.name}". Please upload .csv, .xlsx or .xls files.`);
}

/** Every row with every column (small helper files such as the saved-counts file). */
export async function parseRowsCore(file: File): Promise<ParsedRow[]> {
  return (await parseFileCore(file)).rows;
}
