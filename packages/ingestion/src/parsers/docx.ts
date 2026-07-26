import { normalizeExtractedText, type NormalizedBlockDraft } from '@delivery-os/domain';
import { SaxesParser, type SaxesTagPlain } from 'saxes';
import yauzl, { type Entry, type ZipFile } from 'yauzl';

import type { ParsedDocument, ParserLimits } from './types';
import { DEFAULT_PARSER_LIMITS } from './types';

const requiredEntries = new Set(['[Content_Types].xml', 'word/document.xml']);
const inspectedEntries = new Set([
  '[Content_Types].xml',
  'word/document.xml',
  'word/_rels/document.xml.rels',
]);

export async function parseDocx(
  input: Uint8Array,
  limits: ParserLimits = DEFAULT_PARSER_LIMITS,
): Promise<ParsedDocument> {
  if (input.byteLength > limits.maximumBytes) throw new Error('PARSER_SIZE_LIMIT');
  const entries = await readInspectedEntries(input, limits);
  for (const required of requiredEntries) {
    if (!entries.has(required)) throw new Error('DOCX_REQUIRED_ENTRY_MISSING');
  }
  const relationships = entries.get('word/_rels/document.xml.rels');
  if (
    relationships !== undefined &&
    /TargetMode\s*=\s*["']External["']/iu.test(new TextDecoder().decode(relationships))
  ) {
    throw new Error('DOCX_EXTERNAL_RELATIONSHIP');
  }
  const documentXml = entries.get('word/document.xml');
  if (documentXml === undefined) throw new Error('DOCX_REQUIRED_ENTRY_MISSING');
  return { blocks: parseDocumentXml(documentXml, limits), ocrPageNumbers: [] };
}

async function readInspectedEntries(
  input: Uint8Array,
  limits: ParserLimits,
): Promise<Map<string, Uint8Array>> {
  const zip = await openZip(Buffer.from(input));
  const found = new Map<string, Uint8Array>();
  let entryCount = 0;
  let expandedBytes = 0;
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      zip.close();
      reject(normalizeZipError(error));
    };
    zip.once('error', fail);
    zip.once('end', () => {
      if (settled) return;
      settled = true;
      resolve(found);
    });
    zip.on('entry', (entry: Entry) => {
      try {
        entryCount += 1;
        assertEntry(entry, entryCount, expandedBytes, limits);
        expandedBytes += entry.uncompressedSize;
        if (!inspectedEntries.has(entry.fileName)) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (error, stream) => {
          if (error !== null || stream === undefined) {
            fail(error ?? new Error('DOCX_ENTRY_STREAM_MISSING'));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          stream.on('data', (chunk: Buffer) => {
            size += chunk.byteLength;
            if (size > entry.uncompressedSize || size > limits.maximumExpandedBytes) {
              stream.destroy(new Error('DOCX_EXPANDED_SIZE_LIMIT'));
              return;
            }
            chunks.push(chunk);
          });
          stream.once('error', fail);
          stream.once('end', () => {
            found.set(entry.fileName, new Uint8Array(Buffer.concat(chunks)));
            zip.readEntry();
          });
        });
      } catch (error) {
        fail(error);
      }
    });
    zip.readEntry();
  });
}

function openZip(input: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      input,
      {
        lazyEntries: true,
        decodeStrings: true,
        validateEntrySizes: true,
        strictFileNames: true,
      },
      (error, zip) => {
        if (error !== null || zip === undefined)
          reject(normalizeZipError(error ?? new Error('DOCX_OPEN_FAILED')));
        else resolve(zip);
      },
    );
  });
}

function normalizeZipError(error: unknown): Error {
  if (
    error instanceof Error &&
    /invalid relative path|absolute path|backslash/u.test(error.message)
  ) {
    return new Error('DOCX_PATH_TRAVERSAL', { cause: error });
  }
  return error instanceof Error ? error : new Error('DOCX_ZIP_FAILED', { cause: error });
}

function assertEntry(
  entry: Entry,
  entryCount: number,
  expandedBytes: number,
  limits: ParserLimits,
): void {
  if (entryCount > limits.maximumZipEntries) throw new Error('DOCX_ENTRY_LIMIT');
  if (
    entry.fileName.startsWith('/') ||
    entry.fileName.includes('\\') ||
    entry.fileName.split('/').includes('..')
  ) {
    throw new Error('DOCX_PATH_TRAVERSAL');
  }
  if (entry.fileName === 'EncryptedPackage' || entry.fileName === 'EncryptionInfo') {
    throw new Error('ENCRYPTED_DOCUMENT');
  }
  if (expandedBytes + entry.uncompressedSize > limits.maximumExpandedBytes) {
    throw new Error('DOCX_EXPANDED_SIZE_LIMIT');
  }
  if (
    entry.compressedSize === 0
      ? entry.uncompressedSize > 0
      : entry.uncompressedSize / entry.compressedSize > limits.maximumCompressionRatio
  ) {
    throw new Error('DOCX_COMPRESSION_RATIO_LIMIT');
  }
}

function parseDocumentXml(input: Uint8Array, limits: ParserLimits): NormalizedBlockDraft[] {
  const parser = new SaxesParser({ xmlns: false, fragment: false });
  const blocks: NormalizedBlockDraft[] = [];
  const headingPath: string[] = [];
  let paragraphText = '';
  let paragraphStyle = '';
  let paragraphIndex = -1;
  let captureText = false;
  let inParagraph = false;
  let tableIndex = -1;
  let rowIndex = -1;
  let cellIndex = -1;
  let inCell = false;
  let cellParagraphs: string[] = [];
  let characterCount = 0;

  const addBlock = (draft: Omit<NormalizedBlockDraft, 'ordinal'>): void => {
    characterCount += draft.text.length;
    if (characterCount > limits.maximumTextCharacters) throw new Error('PARSER_TEXT_LIMIT');
    blocks.push({ ...draft, ordinal: blocks.length });
    if (blocks.length > limits.maximumBlocks) throw new Error('PARSER_BLOCK_LIMIT');
  };

  parser.on('doctype', () => {
    throw new Error('DOCX_DTD_REJECTED');
  });
  parser.on('opentag', (tag: SaxesTagPlain) => {
    if (tag.name === 'w:tbl') {
      tableIndex += 1;
      rowIndex = -1;
    } else if (tag.name === 'w:tr') {
      rowIndex += 1;
      cellIndex = -1;
    } else if (tag.name === 'w:tc') {
      cellIndex += 1;
      inCell = true;
      cellParagraphs = [];
    } else if (tag.name === 'w:p') {
      inParagraph = true;
      paragraphIndex += 1;
      paragraphText = '';
      paragraphStyle = '';
    } else if (tag.name === 'w:pStyle') {
      paragraphStyle = attribute(tag, 'w:val') ?? attribute(tag, 'val') ?? '';
    } else if (tag.name === 'w:t') {
      captureText = true;
    } else if (tag.name === 'w:tab') {
      paragraphText += '\t';
    } else if (tag.name === 'w:br') {
      paragraphText += '\n';
    }
  });
  parser.on('text', (text) => {
    if (captureText && inParagraph) paragraphText += text;
  });
  parser.on('closetag', (tag) => {
    if (tag.name === 'w:t') {
      captureText = false;
    } else if (tag.name === 'w:p') {
      inParagraph = false;
      const text = normalizeExtractedText(paragraphText);
      if (text.length === 0) return;
      if (inCell) {
        cellParagraphs.push(text);
        return;
      }
      const heading = /^Heading([1-6])$/iu.exec(paragraphStyle);
      if (heading?.[1] !== undefined) {
        const level = Number.parseInt(heading[1], 10);
        headingPath.splice(level - 1);
        headingPath.push(text);
        addBlock({
          kind: 'HEADING',
          text,
          locator: { format: 'DOCX', headingPath: [...headingPath], paragraph: paragraphIndex },
          extraction: 'EMBEDDED_TEXT',
        });
      } else {
        addBlock({
          kind: 'PARAGRAPH',
          text,
          locator: { format: 'DOCX', headingPath: [...headingPath], paragraph: paragraphIndex },
          extraction: 'EMBEDDED_TEXT',
        });
      }
    } else if (tag.name === 'w:tc') {
      inCell = false;
      const text = normalizeExtractedText(cellParagraphs.join('\n'));
      if (text.length > 0) {
        addBlock({
          kind: 'TABLE_CELL',
          text,
          locator: {
            format: 'DOCX',
            headingPath: [...headingPath],
            table: tableIndex,
            row: rowIndex,
            cell: cellIndex,
          },
          extraction: 'EMBEDDED_TEXT',
        });
      }
    }
  });
  parser.on('error', (error) => {
    throw error;
  });
  parser.write(new TextDecoder().decode(input)).close();
  return blocks;
}

function attribute(tag: SaxesTagPlain, name: string): string | undefined {
  const value = tag.attributes[name];
  return typeof value === 'string' ? value : undefined;
}
