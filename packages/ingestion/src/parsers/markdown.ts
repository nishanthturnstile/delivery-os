import { normalizeExtractedText, type NormalizedBlockDraft } from '@delivery-os/domain';

import type { ParsedDocument, ParserLimits } from './types';
import { DEFAULT_PARSER_LIMITS } from './types';

const decoder = new TextDecoder('utf-8', { fatal: true });

export function parseMarkdown(
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
  const lines = source.split('\n');
  const blocks: NormalizedBlockDraft[] = [];
  const headingPath: string[] = [];
  let paragraphStart: number | null = null;
  let paragraph: string[] = [];
  const push = (
    kind: NormalizedBlockDraft['kind'],
    text: string,
    startLine: number,
    endLine: number,
  ): void => {
    const normalized = normalizeExtractedText(text);
    if (normalized.length === 0) return;
    blocks.push({
      ordinal: blocks.length,
      kind,
      text: normalized,
      locator: { format: 'MARKDOWN', headingPath: [...headingPath], startLine, endLine },
      extraction: 'EMBEDDED_TEXT',
    });
    if (blocks.length > limits.maximumBlocks) throw new Error('PARSER_BLOCK_LIMIT');
  };
  const flushParagraph = (endLine: number): void => {
    if (paragraphStart !== null) push('PARAGRAPH', paragraph.join('\n'), paragraphStart, endLine);
    paragraphStart = null;
    paragraph = [];
  };
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(line);
    const listItem = /^\s*(?:[-+*]|\d+[.)])\s+(.+)$/u.exec(line);
    if (heading?.[1] !== undefined && heading[2] !== undefined) {
      flushParagraph(lineNumber - 1);
      const level = heading[1].length;
      headingPath.splice(level - 1);
      headingPath[level - 1] = normalizeExtractedText(heading[2]);
      push('HEADING', heading[2], lineNumber, lineNumber);
    } else if (listItem?.[1] !== undefined) {
      flushParagraph(lineNumber - 1);
      push('LIST_ITEM', listItem[1], lineNumber, lineNumber);
    } else if (line.trim().length === 0) {
      flushParagraph(lineNumber - 1);
    } else {
      paragraphStart ??= lineNumber;
      paragraph.push(line);
    }
  });
  flushParagraph(lines.length);
  return { blocks, ocrPageNumbers: [] };
}
