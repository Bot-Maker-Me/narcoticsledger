import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { ParsedDinData } from '@/types/reconciliation';

export interface FilePreview {
  fileName: string;
  fileSize: number;
  format: 'csv' | 'xlsx' | 'xls';
  totalRows: number;
  uniqueDINs: number;
  sampleData: Array<Record<string, unknown>>;
  detectedColumns: string[];
  dateRange?: { start: Date | null; end: Date | null };
}

export interface FileParseResult {
  mckesson: Map<string, ParsedDinData>;
  kroll: Map<string, ParsedDinData>;
  previews: {
    mckesson: FilePreview | null;
    kroll: FilePreview | null;
  };
}

function createFilePreview(
  file: File,
  rows: ParsedRow[],
  uniqueDINs: number
): FilePreview {
  const ext = file.name.split('.').pop()?.toLowerCase() as 'csv' | 'xlsx' | 'xls';
  const detectedColumns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const sampleData = rows.slice(0, 5); // First 5 rows as sample
  const dateRange = detectDateRange(rows);

  return {
    fileName: file.name,
    fileSize: file.size,
    format: ext,
    totalRows: rows.length,
    uniqueDINs,
    sampleData,
    detectedColumns,
    dateRange,
  };
}

function normalizeDin(raw: string): string | null {
  const cleaned = String(raw).trim().replace(/[^0-9]/g, '');
  if (cleaned.length === 0) return null;
  // Pad to 8 digits but don't truncate if shorter than 8
  // This preserves the actual DIN even if it's shorter than 8 digits
  return cleaned.padStart(8, '0');
}

/**
 * Find matching DIN in a dataset by trying progressive zero-padding
 * If exact match not found, tries with leading zeros up to 8 digits
 * Also handles the reverse: trying to remove leading zeros to find matches
 */
function findMatchingDin(din: string, dataset: Map<string, ParsedDinData>): string | null {
  // First try exact match
  if (dataset.has(din)) {
    return din;
  }

  // Try progressive zero-padding (for DINs missing leading zeros)
  const cleaned = din.replace(/^0+/, ''); // Remove existing leading zeros
  for (let length = cleaned.length; length <= 8; length++) {
    const padded = cleaned.padStart(length, '0');
    if (dataset.has(padded)) {
      console.log(`DIN ${din} matched to ${padded} via progressive padding`);
      return padded;
    }
  }

  // Try removing leading zeros (for DINs with extra leading zeros)
  for (let length = 8; length >= cleaned.length; length--) {
    const truncated = din.slice(8 - length);
    if (dataset.has(truncated)) {
      console.log(`DIN ${din} matched to ${truncated} via zero removal`);
      return truncated;
    }
  }

  return null;
}

/**
 * Generate a unique signature for a row to detect duplicates
 * Uses DIN, quantity, date, and optionally invoice/transaction number
 */
function generateRowSignature(
  din: string,
  quantity: number,
  date: Date | null,
  row: ParsedRow
): string {
  const parts = [din, quantity];

  if (date) {
    parts.push(date.toISOString().split('T')[0]); // Date portion only
  }

  // Try to find invoice/transaction number
  const keys = Object.keys(row);
  const invoiceKey = findColumnKey(keys, ['Invoice', 'Invoice #', 'Invoice Number', 'Transaction #', 'Transaction ID', 'Order #', 'Order Number']);
  if (invoiceKey && row[invoiceKey]) {
    parts.push(String(row[invoiceKey]).trim());
  }

  // Fallback: hash of relevant row data
  if (parts.length === 2) {
    const relevantData = {
      din,
      quantity,
      date: date?.toISOString(),
    };
    parts.push(JSON.stringify(relevantData));
  }

  return parts.join('|');
}

function extractNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Math.round(value);
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed);
}

function extractDate(value: unknown): Date | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str) return null;
  
  // Try parsing as Excel serial date
  if (typeof value === 'number' && value > 0) {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Try parsing as string date
  const date = new Date(str);
  if (!isNaN(date.getTime())) return date;
  
  return null;
}

function detectDateRange(rows: ParsedRow[]): { start: Date | null; end: Date | null } {
  if (rows.length === 0) return { start: null, end: null };
  
  const keys = Object.keys(rows[0]);
  const dateKey = findColumnKey(keys, ['Date', 'Transaction Date', 'Invoice Date', 'Order Date', 'Timestamp', 'Time', 'Day', 'FillDate', 'Fill Date']);
  
  if (!dateKey) return { start: null, end: null };
  
  const dates: Date[] = [];
  for (const row of rows) {
    const date = extractDate(row[dateKey]);
    if (date) dates.push(date);
  }
  
  if (dates.length === 0) return { start: null, end: null };
  
  dates.sort((a, b) => a.getTime() - b.getTime());
  return { start: dates[0], end: dates[dates.length - 1] };
}

function findColumnKey(
  keys: string[],
  candidates: string[]
): string | null {
  const lowerKeys = keys.map((k) => k.toLowerCase().trim());
  for (const candidate of candidates) {
    const idx = lowerKeys.findIndex((k) =>
      k === candidate.toLowerCase() || k.includes(candidate.toLowerCase())
    );
    if (idx !== -1) return keys[idx];
  }
  return null;
}

interface ParsedRow {
  [key: string]: unknown;
}

function aggregateRows(
  rows: ParsedRow[],
  source: 'mckesson' | 'kroll',
  drugs?: Map<string, { pack_size: number }>,
  seenSignatures?: Set<string>
): Map<string, ParsedDinData> {
  if (rows.length === 0) return new Map();

  const keys = Object.keys(rows[0]);
  const dinKey = findColumnKey(keys, ['DIN', 'Drug Identification Number', 'DIN/PIN', 'drug id']);
  if (!dinKey) {
    throw new Error(
      source === 'mckesson'
        ? 'Could not find a DIN column in the McKesson file. Expected a column named "DIN" or similar.'
        : 'Could not find a DIN column in the Kroll file. Expected a column named "DIN" or similar.'
    );
  }

  const qtyKey = source === 'mckesson'
    ? findColumnKey(keys, ['Quantity', 'Qty', 'Received', 'Purchased', 'Shipped'])
    : findColumnKey(keys, ['Quantity', 'Qty', 'Dispensed', 'Filled', 'Count']);
  const typeKey = findColumnKey(keys, ['Type', 'Transaction Type', 'Action', 'Direction']);
  const dateKey = findColumnKey(keys, ['Date', 'Transaction Date', 'Invoice Date', 'Order Date', 'Timestamp', 'Time', 'Day', 'FillDate', 'Fill Date']);
  // More specific drug description column names to avoid picking up patient names
  const descKey = findColumnKey(keys, ['Drug Description', 'Product Name', 'Drug Name', 'Description', 'Product', 'Medication']);
  // Pack size column for multiplying quantity
  const packSizeKey = findColumnKey(keys, ['Pack Size', 'PackSize', 'Package Size', 'Size', 'Package', 'Pkg Size']);

  const result = new Map<string, ParsedDinData>();
  let skippedCount = 0;

  for (const row of rows) {
    const din = normalizeDin(String(row[dinKey] ?? ''));
    if (!din) continue;

    const existing = result.get(din) ?? {
      din,
      purchased: 0,
      dispensed: 0,
      description: undefined,
      transactions: []
    };

    let qty = qtyKey ? extractNumber(row[qtyKey]) : 1;
    const date = dateKey ? extractDate(row[dateKey]) : null;

    // Generate row signature for deduplication
    if (seenSignatures) {
      const signature = generateRowSignature(din, qty, date, row);
      if (seenSignatures.has(signature)) {
        console.log(`Skipping duplicate row for DIN ${din}: ${signature}`);
        skippedCount++;
        continue;
      }
      seenSignatures.add(signature);
    }

    // Extract pack size from McKesson file (column or description)
    let packSize = 1;
    if (source === 'mckesson') {
      // Try to get pack size from column first
      if (packSizeKey) {
        const colPackSize = extractNumber(row[packSizeKey]);
        if (colPackSize > 1) {
          packSize = colPackSize;
          console.log(`DIN ${din}: Found pack size in column: ${packSize}`);
        }
      }

      // Extract from description if not found in column
      if (packSize === 1 && descKey) {
        const desc = String(row[descKey] ?? '').trim();
        console.log(`DIN ${din}: Description = "${desc}"`);

        // Look for patterns like "0.5MG500" (dosage followed immediately by pack size)
        const dosageThenPackMatch = desc.match(/(\d+(?:\.\d+)?)MG(\d{2,4})\b/i);
        if (dosageThenPackMatch) {
          packSize = parseInt(dosageThenPackMatch[2], 10);
          console.log(`DIN ${din}: Found pack size after MG: ${packSize}`);
        }

        // Look for patterns like "TB 0.5MG 500" (space between dosage and pack size)
        const spaceMatch = desc.match(/(\d+(?:\.\d+)?)MG\s+(\d{2,4})\b/i);
        if (spaceMatch && packSize === 1) {
          packSize = parseInt(spaceMatch[2], 10);
          console.log(`DIN ${din}: Found pack size after MG with space: ${packSize}`);
        }

        // Look for liquid/injection patterns like "100ML", "5ML"
        const mlMatch = desc.match(/(\d+)\s*ML\b/i);
        if (mlMatch && packSize === 1) {
          packSize = parseInt(mlMatch[1], 10);
          console.log(`DIN ${din}: Found ML pack size: ${packSize}`);
        }

        // Look for patterns like "100 TAB", "100 CAP"
        const tabMatch = desc.match(/(\d+)\s*(TAB|CAP|PK|PACK)\b/i);
        if (tabMatch && packSize === 1) {
          packSize = parseInt(tabMatch[1], 10);
          console.log(`DIN ${din}: Found TAB/CAP pack size: ${packSize}`);
        }

        // Fallback: last 2-4 digit number in description
        const endMatch = desc.match(/\b(\d{2,4})\b$/);
        if (endMatch && packSize === 1) {
          packSize = parseInt(endMatch[1], 10);
          console.log(`DIN ${din}: Found end number pack size: ${packSize}`);
        }
      }

      // Multiply quantity by pack size for purchases
      if (packSize > 1) {
        console.log(`DIN ${din}: Quantity ${qty} x Pack Size ${packSize} = ${qty * packSize}`);
        qty = qty * packSize;
      }
    }
    
    let transactionType: 'purchase' | 'dispense';
    
    if (source === 'mckesson') {
      transactionType = 'purchase';
      existing.purchased += qty;
    } else {
      const typeVal = typeKey ? String(row[typeKey] ?? '').toLowerCase() : '';
      if (typeVal.includes('purchase') || typeVal.includes('receive') || typeVal.includes('adjust+')) {
        transactionType = 'purchase';
        existing.purchased += qty;
      } else {
        transactionType = 'dispense';
        existing.dispensed += qty;
      }
    }

    // Track individual transaction for deduplication
    if (existing.transactions) {
      existing.transactions.push({
        date,
        quantity: qty,
        type: transactionType,
      });
    }

    // Extract description if available and not already set
    if (descKey && !existing.description) {
      const desc = String(row[descKey] ?? '').trim();
      // Basic validation: should be longer than 5 chars and contain at least one letter/number combo
      // This helps filter out patient names which are typically shorter or different format
      if (desc && desc !== '' && desc.length > 5) {
        existing.description = desc;
      }
    }

    result.set(din, existing);
  }

  console.log(`Aggregated ${rows.length} rows for ${source}, skipped ${skippedCount} duplicates`);
  return result;
}

// New function to parse individual rows without aggregation
function parseIndividualRows(
  rows: ParsedRow[],
  source: 'mckesson' | 'kroll',
  seenSignatures?: Set<string>
): Array<{ din: string; description?: string; quantity: number; date: Date | null; type: 'purchase' | 'dispense' }> {
  if (rows.length === 0) return [];

  const keys = Object.keys(rows[0]);
  const dinKey = findColumnKey(keys, ['DIN', 'Drug Identification Number', 'DIN/PIN', 'drug id']);
  if (!dinKey) {
    throw new Error(
      source === 'mckesson'
        ? 'Could not find a DIN column in the McKesson file. Expected a column named "DIN" or similar.'
        : 'Could not find a DIN column in the Kroll file. Expected a column named "DIN" or similar.'
    );
  }

  const qtyKey = source === 'mckesson'
    ? findColumnKey(keys, ['Quantity', 'Qty', 'Received', 'Purchased', 'Shipped'])
    : findColumnKey(keys, ['Quantity', 'Qty', 'Dispensed', 'Filled', 'Count']);
  const typeKey = findColumnKey(keys, ['Type', 'Transaction Type', 'Action', 'Direction']);
  const dateKey = findColumnKey(keys, ['Date', 'Transaction Date', 'Invoice Date', 'Order Date', 'Timestamp', 'Time', 'Day', 'FillDate', 'Fill Date']);
  const descKey = findColumnKey(keys, ['Drug Description', 'Product Name', 'Drug Name', 'Description', 'Product', 'Medication']);
  const packSizeKey = findColumnKey(keys, ['Pack Size', 'PackSize', 'Package Size', 'Size', 'Package', 'Pkg Size']);

  const result: Array<{ din: string; description?: string; quantity: number; date: Date | null; type: 'purchase' | 'dispense' }> = [];
  let skippedCount = 0;

  for (const row of rows) {
    const din = normalizeDin(String(row[dinKey] ?? ''));
    if (!din) continue;

    let qty = qtyKey ? extractNumber(row[qtyKey]) : 1;
    const date = dateKey ? extractDate(row[dateKey]) : null;

    // Generate row signature for deduplication
    if (seenSignatures) {
      const signature = generateRowSignature(din, qty, date, row);
      if (seenSignatures.has(signature)) {
        console.log(`Skipping duplicate row for DIN ${din}: ${signature}`);
        skippedCount++;
        continue;
      }
      seenSignatures.add(signature);
    }

    // Extract pack size from McKesson file
    let packSize = 1;
    if (source === 'mckesson') {
      if (packSizeKey) {
        const colPackSize = extractNumber(row[packSizeKey]);
        if (colPackSize > 1) {
          packSize = colPackSize;
        }
      }

      if (packSize === 1 && descKey) {
        const desc = String(row[descKey] ?? '').trim();
        const dosageThenPackMatch = desc.match(/(\d+(?:\.\d+)?)MG(\d{2,4})\b/i);
        if (dosageThenPackMatch) {
          packSize = parseInt(dosageThenPackMatch[2], 10);
        }

        const spaceMatch = desc.match(/(\d+(?:\.\d+)?)MG\s+(\d{2,4})\b/i);
        if (spaceMatch && packSize === 1) {
          packSize = parseInt(spaceMatch[2], 10);
        }

        const mlMatch = desc.match(/(\d+)\s*ML\b/i);
        if (mlMatch && packSize === 1) {
          packSize = parseInt(mlMatch[1], 10);
        }

        const tabMatch = desc.match(/(\d+)\s*(TAB|CAP|PK|PACK)\b/i);
        if (tabMatch && packSize === 1) {
          packSize = parseInt(tabMatch[1], 10);
        }

        const endMatch = desc.match(/\b(\d{2,4})\b$/);
        if (endMatch && packSize === 1) {
          packSize = parseInt(endMatch[1], 10);
        }
      }

      if (packSize > 1) {
        qty = qty * packSize;
      }
    }
    
    let transactionType: 'purchase' | 'dispense';
    
    if (source === 'mckesson') {
      transactionType = 'purchase';
    } else {
      const typeVal = typeKey ? String(row[typeKey] ?? '').toLowerCase() : '';
      if (typeVal.includes('purchase') || typeVal.includes('receive') || typeVal.includes('adjust+')) {
        transactionType = 'purchase';
      } else {
        transactionType = 'dispense';
      }
    }

    const description = descKey ? String(row[descKey] ?? '').trim() : undefined;
    if (description && description.length > 5) {
      result.push({
        din,
        description,
        quantity: qty,
        date,
        type: transactionType
      });
    } else {
      result.push({
        din,
        quantity: qty,
        date,
        type: transactionType
      });
    }
  }

  console.log(`Parsed ${result.length} individual rows for ${source}, skipped ${skippedCount} duplicates`);
  return result;
}

export async function parseReconciliationFiles(
  mckessonFile: File,
  krollFile: File
): Promise<FileParseResult> {
  console.log('Parsing reconciliation files', { mckesson: mckessonFile.name, kroll: krollFile.name });
  const mckessonResult = await parseSingleFileWithPreview(mckessonFile, 'mckesson');
  console.log('McKesson file parsed', { dataSize: mckessonResult.data.size });
  const krollResult = await parseSingleFileWithPreview(krollFile, 'kroll');
  console.log('Kroll file parsed', { dataSize: krollResult.data.size });
  
  return {
    mckesson: mckessonResult.data,
    kroll: krollResult.data,
    previews: {
      mckesson: mckessonResult.preview,
      kroll: krollResult.preview,
    },
  };
}

export async function parseSingleFileWithPreview(
  file: File,
  source: 'mckesson' | 'kroll',
  drugs?: Map<string, { pack_size: number }>,
  seenSignatures?: Set<string>
): Promise<{ data: Map<string, ParsedDinData>; preview: FilePreview }> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  let rows: ParsedRow[] = [];

  if (ext === 'csv' || ext === 'txt') {
    rows = await new Promise<ParsedRow[]>((resolve, reject) => {
      Papa.parse<ParsedRow>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (err) => reject(new Error(`Failed to parse CSV: ${err.message}`)),
      });
    });
  } else if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: '' });
  } else {
    throw new Error(`Unsupported file format: .${ext}. Please upload .csv or .xlsx files.`);
  }

  const data = aggregateRows(rows, source, drugs, seenSignatures);
  const preview = createFilePreview(file, rows, data.size);

  return { data, preview };
}

export async function parseSingleFileWithIndividualRows(
  file: File,
  source: 'mckesson' | 'kroll',
  seenSignatures?: Set<string>
): Promise<{ data: Array<{ din: string; description?: string; quantity: number; date: Date | null; type: 'purchase' | 'dispense' }>; preview: FilePreview }> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  let rows: ParsedRow[] = [];

  if (ext === 'csv' || ext === 'txt') {
    rows = await new Promise<ParsedRow[]>((resolve, reject) => {
      Papa.parse<ParsedRow>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (err) => reject(new Error(`Failed to parse CSV: ${err.message}`)),
      });
    });
  } else if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: '' });
  } else {
    throw new Error(`Unsupported file format: .${ext}. Please upload .csv or .xlsx files.`);
  }

  const data = parseIndividualRows(rows, source, seenSignatures);
  const preview = createFilePreview(file, rows, data.length);

  return { data, preview };
}

export async function parseSingleFile(
  file: File,
  source: 'mckesson' | 'kroll',
  seenSignatures?: Set<string>
): Promise<Map<string, ParsedDinData>> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'csv' || ext === 'txt') {
    return new Promise((resolve, reject) => {
      Papa.parse<ParsedRow>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            resolve(aggregateRows(results.data, source, undefined, seenSignatures));
          } catch (err) {
            reject(err);
          }
        },
        error: (err) => reject(new Error(`Failed to parse CSV: ${err.message}`)),
      });
    });
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: '' });
    return aggregateRows(rows, source, undefined, seenSignatures);
  }

  throw new Error(`Unsupported file format: .${ext}. Please upload .csv or .xlsx files.`);
}

export function mergeDinData(
  mckesson: Map<string, ParsedDinData>,
  kroll: Map<string, ParsedDinData>
): Map<string, { purchased: number; dispensed: number; description?: string }> {
  const allDins = new Set([...mckesson.keys(), ...kroll.keys()]);
  const merged = new Map<string, { purchased: number; dispensed: number; description?: string }>();

  for (const din of allDins) {
    let m = mckesson.get(din);
    let k = kroll.get(din);

    // Try progressive zero-padding for McKesson if not found
    if (!m) {
      const matchedMckessonDin = findMatchingDin(din, mckesson);
      if (matchedMckessonDin) {
        m = mckesson.get(matchedMckessonDin);
        console.log(`Merged McKesson DIN ${matchedMckessonDin} -> ${din}`);
      }
    }

    // Try progressive zero-padding for Kroll if not found
    if (!k) {
      const matchedKrollDin = findMatchingDin(din, kroll);
      if (matchedKrollDin) {
        k = kroll.get(matchedKrollDin);
        console.log(`Merged Kroll DIN ${matchedKrollDin} -> ${din}`);
      }
    }

    // Use description from McKesson first, then Kroll
    const description = m?.description ?? k?.description;
    merged.set(din, {
      purchased: (m?.purchased ?? 0) + (k?.purchased ?? 0),
      dispensed: (m?.dispensed ?? 0) + (k?.dispensed ?? 0),
      description: description,
    });
  }

  return merged;
}

/**
 * Deduplicate DIN data when merging multiple file uploads.
 * Skips transactions that fall within already covered date ranges.
 */
export function deduplicateDinData(
  existingData: Map<string, ParsedDinData>,
  newData: Map<string, ParsedDinData>,
  existingDateRange: { start: Date | null; end: Date | null } | null
): Map<string, ParsedDinData> {
  const result = new Map<string, ParsedDinData>();

  // Deep copy existing data
  for (const [din, data] of existingData) {
    result.set(din, {
      din: data.din,
      purchased: data.purchased,
      dispensed: data.dispensed,
      description: data.description,
      transactions: data.transactions ? [...data.transactions] : [],
    });
  }

  if (!existingDateRange || !existingDateRange.start || !existingDateRange.end) {
    // No date range info, can't deduplicate - just merge all
    for (const [din, data] of newData) {
      const existing = result.get(din);
      if (existing) {
        existing.purchased += data.purchased;
        existing.dispensed += data.dispensed;
        existing.transactions = [...(existing.transactions || []), ...(data.transactions || [])];
        result.set(din, existing);
      } else {
        result.set(din, data);
      }
    }
    return result;
  }

  const { start: existingStart, end: existingEnd } = existingDateRange;

  for (const [din, data] of newData) {
    const existing = result.get(din);

    if (!existing) {
      // New DIN, add all data
      result.set(din, data);
      continue;
    }

    // Existing DIN, need to deduplicate transactions
    let newPurchased = 0;
    let newDispensed = 0;
    const newTransactions: ParsedDinData['transactions'] = [];

    if (data.transactions) {
      for (const transaction of data.transactions) {
        // Skip transaction if it falls within existing date range
        if (transaction.date &&
            transaction.date >= existingStart &&
            transaction.date <= existingEnd) {
          console.log(`Skipping duplicate transaction for DIN ${din} on ${transaction.date.toISOString()}`);
          continue;
        }

        // Add transaction
        if (transaction.type === 'purchase') {
          newPurchased += transaction.quantity;
        } else {
          newDispensed += transaction.quantity;
        }
        newTransactions.push(transaction);
      }
    }

    // Merge with existing
    existing.purchased += newPurchased;
    existing.dispensed += newDispensed;
    existing.transactions = [...(existing.transactions || []), ...newTransactions];
    result.set(din, existing);
  }

  return result;
}

export function detectFileFormat(file: File): 'csv' | 'xlsx' | 'xls' | 'unknown' {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'csv' || ext === 'txt') return 'csv';
  if (ext === 'xlsx') return 'xlsx';
  if (ext === 'xls') return 'xls';
  return 'unknown';
}
