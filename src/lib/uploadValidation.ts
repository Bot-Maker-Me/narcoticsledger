/**
 * Validation for user-supplied spreadsheet files.
 *
 * The extension is the only gate on the file's *name*, because everything else a browser
 * reports about a file is a claim: Windows reports a `.csv` as `application/vnd.ms-excel`,
 * and some browsers report nothing at all. A MIME type is therefore never used to reject a
 * file - `isSupportedFile`/`uploadKindOf` accept any .csv, .xlsx or .xls.
 *
 * What is checked instead is the file itself: it must not be empty, it must fit the size
 * limit, and its leading bytes must not be one of the binary container signatures below,
 * which catches an .exe/.zip/.png renamed to .csv.
 */

export type UploadKind = 'csv' | 'xlsx' | 'xls';

/** Largest file accepted. A busy pharmacy's two-month Kroll dispensing export is ~10 MB. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const KIND_BY_EXTENSION: Record<string, UploadKind> = {
  csv: 'csv',
  xlsx: 'xlsx',
  xls: 'xls',
};

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // .xlsx is a ZIP container
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // legacy .xls

/**
 * Containers and executables a CSV is sometimes renamed from. The two workbook formats are
 * included so an .xlsx/.xls saved as .csv is caught instead of being parsed as garbage.
 */
const BINARY_MAGIC: readonly (readonly number[])[] = [
  [0x4d, 0x5a], // MZ - DOS/Windows executable
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x47, 0x49, 0x46, 0x38], // GIF
  [0x25, 0x50, 0x44, 0x46], // PDF
  [0x1f, 0x8b], // gzip
  [0x52, 0x61, 0x72, 0x21], // RAR
  [0x37, 0x7a, 0xbc, 0xaf], // 7z
  ZIP_MAGIC,
  OLE2_MAGIC,
];

export const ACCEPT_ATTRIBUTE = '.csv,.xlsx,.xls';
export const SUPPORTED_FORMATS_LABEL = '.csv, .xlsx, or .xls';

/** The upload kind implied by a file name, or null when the extension is not supported. */
export function uploadKindOf(fileName: string): UploadKind | null {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return null;
  return KIND_BY_EXTENSION[fileName.slice(dot + 1).toLowerCase()] ?? null;
}

/** Synchronous check on the extension alone (used to filter drag-and-drop lists quickly). */
export function isSupportedFile(file: Pick<File, 'name'>): boolean {
  return uploadKindOf(file.name) !== null;
}

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((value, index) => bytes[index] === value);
}

export type ValidationResult = { ok: true; kind: UploadKind } | { ok: false; reason: string };

/**
 * Full validation: extension, size, then the file's leading bytes. The browser-reported
 * MIME type is deliberately not consulted - see the module comment.
 */
export async function validateUpload(file: File): Promise<ValidationResult> {
  const kind = uploadKindOf(file.name);
  if (!kind) {
    return { ok: false, reason: `"${file.name}" is not a ${SUPPORTED_FORMATS_LABEL} file` };
  }

  if (file.size === 0) return { ok: false, reason: `"${file.name}" is empty` };

  if (file.size > MAX_UPLOAD_BYTES) {
    const limit = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
    return { ok: false, reason: `"${file.name}" is larger than ${limit} MB` };
  }

  const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());

  if (kind === 'xlsx' && !startsWith(head, ZIP_MAGIC)) {
    return { ok: false, reason: `"${file.name}" is not a valid .xlsx workbook` };
  }
  if (kind === 'xls' && !startsWith(head, OLE2_MAGIC)) {
    return { ok: false, reason: `"${file.name}" is not a valid .xls workbook` };
  }
  // NUL bytes are NOT treated as evidence of a binary file: Kroll writes a NUL placeholder
  // into every empty column, so a genuine dispensing export is full of them. `parseRowsCore`
  // strips them before parsing, and only a real container signature is rejected here.
  if (kind === 'csv' && BINARY_MAGIC.some((magic) => startsWith(head, magic))) {
    return {
      ok: false,
      reason: `"${file.name}" is not a text CSV file. It looks like a renamed archive, workbook or executable.`,
    };
  }

  return { ok: true, kind };
}

export interface ValidatedFiles {
  accepted: File[];
  rejected: Array<{ file: File; reason: string }>;
}

/** Validates several files at once, keeping the original order of the accepted ones. */
export async function validateUploads(files: File[]): Promise<ValidatedFiles> {
  const results = await Promise.all(files.map((file) => validateUpload(file)));
  const accepted: File[] = [];
  const rejected: ValidatedFiles['rejected'] = [];

  results.forEach((result, index) => {
    if (result.ok) accepted.push(files[index]);
    else rejected.push({ file: files[index], reason: result.reason });
  });

  return { accepted, rejected };
}
