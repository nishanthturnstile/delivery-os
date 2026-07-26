import { describe, expect, it } from 'vitest';

import { assertPdfNotEncrypted, detectSourceFormat } from './detection';

describe('source signature detection', () => {
  it('matches PDF and DOCX magic bytes to the authorized format', () => {
    expect(detectSourceFormat(new TextEncoder().encode('%PDF-1.7\n'), 'PDF')).toBe('PDF');
    expect(detectSourceFormat(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1]), 'DOCX')).toBe('DOCX');
    expect(() => detectSourceFormat(new TextEncoder().encode('%PDF-1.7'), 'TEXT')).toThrow(
      /SIGNATURE_MISMATCH/,
    );
  });

  it('rejects binary or invalid UTF-8 masquerading as text', () => {
    expect(() => detectSourceFormat(Uint8Array.from([65, 0, 66]), 'TEXT')).toThrow(/BINARY_TEXT/);
    expect(() => detectSourceFormat(Uint8Array.from([0xc3, 0x28]), 'MARKDOWN')).toThrow(
      /INVALID_UTF8/,
    );
  });

  it('surfaces an encrypted PDF marker before parsing', () => {
    expect(() =>
      assertPdfNotEncrypted(new TextEncoder().encode('%PDF-1.7\n1 0 obj <</Encrypt 2 0 R>>')),
    ).toThrow(/ENCRYPTED_DOCUMENT/);
  });
});
