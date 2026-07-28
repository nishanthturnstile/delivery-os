import { normalizeExtractedText, type NormalizedBlockDraft } from '@delivery-os/domain';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { ParsedDocument, ParserLimits } from './types';
import { DEFAULT_PARSER_LIMITS } from './types';

export async function parsePdf(
  input: Uint8Array,
  limits: ParserLimits = DEFAULT_PARSER_LIMITS,
): Promise<ParsedDocument> {
  if (input.byteLength > limits.maximumBytes) throw new Error('PARSER_SIZE_LIMIT');
  const loadingTask = getDocument({
    data: input.slice(),
    useSystemFonts: false,
    useWasm: true,
    stopAtErrors: true,
    maxImageSize: 4_000_000,
    canvasMaxAreaInBytes: 16_000_000,
    disableFontFace: true,
    disableRange: true,
    disableStream: true,
    disableAutoFetch: true,
    useWorkerFetch: false,
  });
  try {
    const document = await loadingTask.promise;
    if (document.numPages > limits.maximumPages) throw new Error('PARSER_PAGE_LIMIT');
    const blocks: NormalizedBlockDraft[] = [];
    const ocrPageNumbers: number[] = [];
    let characterCount = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent({ includeMarkedContent: false });
      let usableItems = 0;
      content.items.forEach((item, itemIndex) => {
        if (!('str' in item)) return;
        const candidate = item as {
          str: unknown;
          transform: unknown;
          width: unknown;
          height: unknown;
        };
        if (typeof candidate.str !== 'string') return;
        const text = normalizeExtractedText(candidate.str);
        if (text.length === 0) return;
        usableItems += 1;
        characterCount += text.length;
        if (characterCount > limits.maximumTextCharacters) throw new Error('PARSER_TEXT_LIMIT');
        const transform = Array.isArray(candidate.transform) ? candidate.transform : [];
        const x = finite(transform[4]);
        const y = finite(transform[5]);
        const width = Math.max(0, finite(candidate.width));
        const declaredHeight = finite(candidate.height);
        const height = Math.max(
          0,
          declaredHeight === 0 ? Math.abs(finite(transform[3])) : declaredHeight,
        );
        blocks.push({
          ordinal: blocks.length,
          kind: 'PARAGRAPH',
          text,
          locator: {
            format: 'PDF',
            page: pageNumber,
            polygon: [
              round(x),
              round(y),
              round(x + width),
              round(y),
              round(x + width),
              round(y + height),
              round(x),
              round(y + height),
            ],
            textItemRange: [itemIndex, itemIndex + 1],
          },
          extraction: 'EMBEDDED_TEXT',
        });
        if (blocks.length > limits.maximumBlocks) throw new Error('PARSER_BLOCK_LIMIT');
      });
      if (usableItems === 0) ocrPageNumbers.push(pageNumber);
      page.cleanup();
    }
    return { blocks, ocrPageNumbers };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'PasswordException'
    ) {
      throw new Error('ENCRYPTED_DOCUMENT');
    }
    throw error;
  } finally {
    await loadingTask.destroy();
  }
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
