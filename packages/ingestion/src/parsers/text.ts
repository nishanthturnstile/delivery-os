import { normalizeExtractedText, type NormalizedBlockDraft } from '@delivery-os/domain';

import type { ParsedDocument, ParserLimits } from './types';
import { DEFAULT_PARSER_LIMITS } from './types';

const decoder = new TextDecoder('utf-8', { fatal: true });

export function parseText(
  input: Uint8Array,
  limits: ParserLimits = DEFAULT_PARSER_LIMITS,
): ParsedDocument {
  if (input.byteLength > limits.maximumBytes) throw new Error('PARSER_SIZE_LIMIT');
  let source: string;
  try {
    source = decoder.decode(input).replace(/\r\n?/gu, '\n');
  } catch {
    throw new Error('PARSER_INVALID_UTF8');
  }
  if (source.length > limits.maximumTextCharacters) throw new Error('PARSER_TEXT_LIMIT');
  const blocks: NormalizedBlockDraft[] = [];
  const lines = source.split('\n');
  let startLine: number | null = null;
  let paragraphLines: string[] = [];
  const flush = (endLine: number): void => {
    if (startLine === null) return;
    const text = normalizeExtractedText(paragraphLines.join('\n'));
    if (text.length > 0) {
      blocks.push({
        ordinal: blocks.length,
        kind: 'PARAGRAPH',
        text,
        locator: { format: 'TEXT', startLine, endLine },
        extraction: 'EMBEDDED_TEXT',
      });
    }
    startLine = null;
    paragraphLines = [];
  };
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim().length === 0) {
      flush(lineNumber - 1);
    } else {
      startLine ??= lineNumber;
      paragraphLines.push(line);
    }
  });
  flush(lines.length);
  if (blocks.length > limits.maximumBlocks) throw new Error('PARSER_BLOCK_LIMIT');
  return { blocks, ocrPageNumbers: [] };
}
