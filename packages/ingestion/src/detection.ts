export type DetectedSourceFormat = 'PDF' | 'DOCX' | 'MARKDOWN' | 'TEXT';

const textDecoder = new TextDecoder('utf-8', { fatal: true });

export function detectSourceFormat(
  prefix: Uint8Array,
  expectedFormat: DetectedSourceFormat,
): DetectedSourceFormat {
  if (prefix.byteLength === 0) throw new Error('SOURCE_EMPTY');
  if (startsWith(prefix, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    if (expectedFormat !== 'PDF') throw new Error('SOURCE_SIGNATURE_MISMATCH');
    return 'PDF';
  }
  if (startsWith(prefix, [0x50, 0x4b, 0x03, 0x04])) {
    if (expectedFormat !== 'DOCX') throw new Error('SOURCE_SIGNATURE_MISMATCH');
    return 'DOCX';
  }
  if (prefix.includes(0)) throw new Error('SOURCE_BINARY_TEXT_REJECTED');
  try {
    textDecoder.decode(prefix);
  } catch {
    throw new Error('SOURCE_INVALID_UTF8');
  }
  if (expectedFormat !== 'MARKDOWN' && expectedFormat !== 'TEXT') {
    throw new Error('SOURCE_SIGNATURE_MISMATCH');
  }
  return expectedFormat;
}

export async function inspectBinaryMediaType(prefix: Uint8Array): Promise<string | undefined> {
  const detected = await fileTypeFromBuffer(prefix);
  return detected?.mime;
}

export function assertPdfNotEncrypted(prefix: Uint8Array): void {
  const probe = new TextDecoder('latin1').decode(prefix);
  if (/\/Encrypt\b/u.test(probe)) throw new Error('ENCRYPTED_DOCUMENT');
}

function startsWith(value: Uint8Array, expected: readonly number[]): boolean {
  return expected.every((byte, index) => value[index] === byte);
}
import { fileTypeFromBuffer } from 'file-type';
