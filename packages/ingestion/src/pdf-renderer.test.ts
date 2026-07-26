import { describe, expect, it } from 'vitest';

import { renderPdfPagesForOcr } from './pdf-renderer';

describe('bounded PDF OCR rendering', () => {
  const pdf = buildPdf('');

  it('renders selected pages deterministically within the approved bounds', async () => {
    const first = await renderPdfPagesForOcr(pdf, [1], {
      dpi: 72,
      maximumPixelsPerPage: 1_000_000,
      maximumOutputBytesPerPage: 1_000_000,
    });
    const replay = await renderPdfPagesForOcr(pdf, [1], {
      dpi: 72,
      maximumPixelsPerPage: 1_000_000,
      maximumOutputBytesPerPage: 1_000_000,
    });
    expect(first).toEqual(replay);
    expect(first[0]).toMatchObject({ page: 1, width: 612, height: 792 });
    expect(first[0]?.inputHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('rejects unsafe configuration, page selection, page range, pixels, and output size', async () => {
    for (const options of [
      { dpi: 71, maximumPixelsPerPage: 1, maximumOutputBytesPerPage: 1 },
      { dpi: 301, maximumPixelsPerPage: 1, maximumOutputBytesPerPage: 1 },
      { dpi: 72, maximumPixelsPerPage: 0, maximumOutputBytesPerPage: 1 },
      { dpi: 72, maximumPixelsPerPage: 1, maximumOutputBytesPerPage: 0 },
    ]) {
      await expect(renderPdfPagesForOcr(pdf, [1], options)).rejects.toThrow(
        'PDF OCR rendering configuration is invalid',
      );
    }
    await expect(
      renderPdfPagesForOcr(pdf, [], {
        dpi: 72,
        maximumPixelsPerPage: 1,
        maximumOutputBytesPerPage: 1,
      }),
    ).rejects.toThrow('PDF OCR rendering configuration is invalid');
    await expect(
      renderPdfPagesForOcr(
        pdf,
        Array.from({ length: 11 }, (_, index) => index + 1),
        {
          dpi: 72,
          maximumPixelsPerPage: 1,
          maximumOutputBytesPerPage: 1,
        },
      ),
    ).rejects.toThrow('PDF OCR rendering configuration is invalid');
    for (const pages of [[1, 1], [0]]) {
      await expect(
        renderPdfPagesForOcr(pdf, pages, {
          dpi: 72,
          maximumPixelsPerPage: 1_000_000,
          maximumOutputBytesPerPage: 1_000_000,
        }),
      ).rejects.toThrow('PDF OCR page selection is invalid');
    }
    await expect(
      renderPdfPagesForOcr(pdf, [2], {
        dpi: 72,
        maximumPixelsPerPage: 1_000_000,
        maximumOutputBytesPerPage: 1_000_000,
      }),
    ).rejects.toThrow('PDF_OCR_PAGE_OUT_OF_RANGE');
    await expect(
      renderPdfPagesForOcr(pdf, [1], {
        dpi: 72,
        maximumPixelsPerPage: 100,
        maximumOutputBytesPerPage: 1_000_000,
      }),
    ).rejects.toThrow('PDF_OCR_PIXEL_LIMIT');
    await expect(
      renderPdfPagesForOcr(pdf, [1], {
        dpi: 72,
        maximumPixelsPerPage: 1_000_000,
        maximumOutputBytesPerPage: 1,
      }),
    ).rejects.toThrow('PDF_OCR_OUTPUT_SIZE_LIMIT');
  });
});

function buildPdf(value: string): Uint8Array {
  const encoder = new TextEncoder();
  const stream =
    value.length === 0 ? '' : `BT /F1 18 Tf 72 720 Td (${value.replaceAll(/[()\\]/gu, '')}) Tj ET`;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(encoder.encode(pdf).byteLength);
    pdf += `${object}\n`;
  }
  const xref = encoder.encode(pdf).byteLength;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return encoder.encode(pdf);
}
