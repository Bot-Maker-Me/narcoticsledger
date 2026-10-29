/**
 * Validation for user-supplied spreadsheet files.
 *
 * A file name or a browser-reported MIME type is just a claim, so each file is checked on
 * four independent things before it is handed to a parser: extension, MIME type, size and
 * the file's first bytes ("magic numbers"). A renamed executable or HTML page fails the
 * last one even when the first three are forged.
 */

export type UploadKind = 'csv' | 'xlsx' | 'xls';

/** Largest file accepted. A 100,000-row Kroll dispensing export is about 26 MB (45 columns per row). */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const KIND_BY_EXTENSION: Record<string, UploadKind> = {
  csv: 'csv',
  xlsx: 'xlsx',
  xls: 'xls',
};

/**
 * MIME types browsers actually report for each kind. The empty string is included because
 * Windows and some browsers report nothing for CSV/XLS; the magic-byte check still applies.
 */
const MIME_BY_KIND: Record<UploadKind, readonly string[]> = {
  csv: ['', 'text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel', 'application/octet-stream'],
  xlsx: [
    '',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
  ],
  xls: ['', 'application/vnd.ms-excel', 'application/octet-stream'],
};

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // .xlsx is a ZIP container
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // legacy .xls

/** Signatures of files that are definitely not text, whatever their name says. */
const BINARY_MAGIC: readonly (readonly number[])[] = [
  [0x4d, 0x5a], // Windows executable (MZ)
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0x50, 0x4b, 0x03, 0x04], // ZIP / xlsx / docx renamed to .csv
  [0xd0, 0xcf, 0x11, 0xe0], // OLE2 / xls renamed to .csv
  [0x25, 0x50, 0x44, 0x46], // PDF
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x47, 0x49, 0x46, 0x38], // GIF
];
const UTF16_BOMS: readonly (readonly number[])[] = [
  [0xff, 0xfe],
  [0xfe, 0xff],
];
/** Above this share of NUL bytes a file without a UTF-16 BOM is treated as binary. */
const MAX_NUL_RATIO = 0.3;

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

/** Full validation: extension, MIME type, size, then the file's leading bytes. */
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

  if (!MIME_BY_KIND[kind].includes(file.type)) {
    return { ok: false, reason: `"${file.name}" does not look like a ${kind.toUpperCase()} file (${file.type})` };
  }

  const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());

  if (kind === 'xlsx' && !startsWith(head, ZIP_MAGIC)) {
    return { ok: false, reason: `"${file.name}" is not a valid .xlsx workbook` };
  }
  if (kind === 'xls' && !startsWith(head, OLE2_MAGIC)) {
    return { ok: false, reason: `"${file.name}" is not a valid .xls workbook` };
  }
  // Kroll exports put stray NUL bytes inside quoted empty fields ("\0"), so a few NULs are
  // normal. A renamed binary is recognised by its signature or by being mostly NULs.
  if (kind === 'csv') {
    const isUtf16 = UTF16_BOMS.some((magic) => startsWith(head, magic));
    const nulRatio = head.length === 0 ? 0 : head.reduce((n, byte) => n + (byte === 0 ? 1 : 0), 0) / head.length;
    if (BINARY_MAGIC.some((magic) => startsWith(head, magic)) || (!isUtf16 && nulRatio > MAX_NUL_RATIO)) {
      return { ok: false, reason: `"${file.name}" is not a text CSV file` };
    }
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
