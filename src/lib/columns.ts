/**
 * The column headings the supplier-file parser understands, in one place.
 *
 * They are shared by the parser (which looks columns up) and by the file-reading worker
 * (which uses them to keep only those columns). A Kroll dispensing export has 45 columns
 * (patient names, addresses, phone numbers ...) of which about 8 are ever read, so
 * dropping the rest inside the worker shrinks what has to be copied back to the page,
 * and kept in memory, by roughly five times.
 */

export const DIN_COLUMNS = ['DIN', 'Drug Identification Number', 'DIN/PIN', 'drug id'];

export const QTY_COLUMNS = {
  mckesson: ['Quantity', 'Qty', 'Received', 'Purchased', 'Shipped'],
  kroll: ['Quantity', 'Qty', 'Dispensed', 'Filled', 'Count'],
};

export const TYPE_COLUMNS = ['Type', 'Transaction Type', 'Action', 'Direction'];

/** More specific drug description names first, to avoid picking up patient names. */
export const DESCRIPTION_COLUMNS = ['Drug Description', 'Product Name', 'Drug Name', 'Description', 'Product', 'Medication'];

export const DATE_COLUMNS = ['Date', 'Transaction Date', 'Invoice Date', 'Order Date', 'Timestamp', 'Time', 'Day', 'FillDate', 'Fill Date'];

/**
 * Column names that explicitly carry a pack size. Deliberately strict: a generic
 * "Size" or "Package" column describes the product itself (bottle size, dose form),
 * not how many units the pharmacy received, so using it as a multiplier inflated
 * imported quantities.
 */
export const PACK_SIZE_COLUMNS = ['Pack Size', 'PackSize', 'Package Size', 'Pkg Size', 'Packs'];

/** Used only to tell two rows apart (see `generateRowSignature`). */
export const INVOICE_COLUMNS = ['Invoice', 'Invoice #', 'Invoice Number', 'Transaction #', 'Transaction ID', 'Order #', 'Order Number'];

/**
 * One invoice can hold several products that share a DIN (e.g. a 100-pack and a 200-pack)
 * with the same quantity, so the product number takes part in the signature.
 */
export const PRODUCT_COLUMNS = ['Product(s) #', 'Product #', 'Product Number', 'Product ID', 'Item #', 'Item Number', 'SKU'];

/**
 * The prescription number of a dispensing export. Matched exactly (not "contains") so
 * "Orig Rx" or "Rx Status" can never be mistaken for it.
 *
 * Without it two real dispenses of the same drug, quantity and day looked identical, and
 * the duplicate check silently dropped them: a 40,342-row Kroll file kept only 6,345 rows.
 */
export const ROW_ID_COLUMNS = ['Rx', 'Rx #', 'Rx No', 'Rx Number', 'Prescription #', 'Prescription Number', 'Script #'];

/** The first heading that equals, or contains, one of the candidates (candidate order wins). */
export function findColumnKey(keys: string[], candidates: string[]): string | null {
  const lowerKeys = keys.map((key) => key.toLowerCase().trim());
  for (const candidate of candidates) {
    const needle = candidate.toLowerCase();
    const index = lowerKeys.findIndex((key) => key === needle || key.includes(needle));
    if (index !== -1) return keys[index];
  }
  return null;
}

/** The first heading that equals (ignoring case and spacing) one of the candidates. */
export function findExactColumnKey(keys: string[], candidates: string[]): string | null {
  const wanted = new Set(candidates.map((candidate) => candidate.toLowerCase()));
  return keys.find((key) => wanted.has(key.toLowerCase().trim())) ?? null;
}

const LOOSE_NEEDLES = [
  ...DIN_COLUMNS,
  ...QTY_COLUMNS.mckesson,
  ...QTY_COLUMNS.kroll,
  ...TYPE_COLUMNS,
  ...DESCRIPTION_COLUMNS,
  ...DATE_COLUMNS,
  ...PACK_SIZE_COLUMNS,
  ...INVOICE_COLUMNS,
  ...PRODUCT_COLUMNS,
].map((needle) => needle.toLowerCase());

const EXACT_NEEDLES = new Set(ROW_ID_COLUMNS.map((needle) => needle.toLowerCase()));

/**
 * True for every heading the parser might pick, a superset of what `findColumnKey` and
 * `findExactColumnKey` can return, so pruning never changes which column is chosen.
 */
export function isSupplierColumn(header: string): boolean {
  const lower = header.toLowerCase().trim();
  return EXACT_NEEDLES.has(lower) || LOOSE_NEEDLES.some((needle) => lower === needle || lower.includes(needle));
}
