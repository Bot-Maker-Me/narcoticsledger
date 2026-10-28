/**
 * Validation for user-supplied spreadsheet files.
 *
 * A file name or a browser-reported MIME type is just a claim, so each file is checked on
 * four independent things before it is handed to a parser: extension, MIME type, size and
 * the file's first bytes ("magic numbers"). A renamed executable or HTML page fails the
 * last one even when the first three are forged.
 */

export type UploadKind = 'csv' | 'xlsx' | 'xls';

/** Largest file accepted. Real supplier exports are well under 5 MB. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

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
  // A text export never contains NUL bytes; their presence means a binary file was renamed.
  if (kind === 'csv' && head.includes(0)) {
    return { ok: false, reason: `"${file.name}" is not a text CSV file` };
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
