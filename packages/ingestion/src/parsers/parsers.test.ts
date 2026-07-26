import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { normalizeParsedDocument } from '../normalization';
import { parseDocx } from './docx';
import { parseMarkdown } from './markdown';
import { parsePdf } from './pdf';
import { parseText } from './text';

describe('deterministic text and Markdown parsing', () => {
  it('preserves exact line ranges and heading paths', () => {
    const markdown = parseMarkdown(
      new TextEncoder().encode(
        '# Context\n\nSynthetic summary.\ncontinued.\n\n## Scope\n- First capability\n',
      ),
    );
    expect(markdown.blocks).toMatchObject([
      {
        kind: 'HEADING',
        text: 'Context',
        locator: { format: 'MARKDOWN', headingPath: ['Context'], startLine: 1, endLine: 1 },
      },
      {
        kind: 'PARAGRAPH',
        locator: { format: 'MARKDOWN', headingPath: ['Context'], startLine: 3, endLine: 4 },
      },
      {
        kind: 'HEADING',
        locator: {
          format: 'MARKDOWN',
          headingPath: ['Context', 'Scope'],
          startLine: 6,
          endLine: 6,
        },
      },
      {
        kind: 'LIST_ITEM',
        locator: {
          format: 'MARKDOWN',
          headingPath: ['Context', 'Scope'],
          startLine: 7,
          endLine: 7,
        },
      },
    ]);

    const text = parseText(
      new TextEncoder().encode('First synthetic paragraph.\r\nContinued.\r\n\r\nSecond.\r\n'),
    );
    expect(text.blocks.map((block) => block.locator)).toEqual([
      { format: 'TEXT', startLine: 1, endLine: 2 },
      { format: 'TEXT', startLine: 4, endLine: 4 },
    ]);
  });

  it('binds immutable block and document identity to every configuration version', () => {
    const parsed = parseText(new TextEncoder().encode('Synthetic stable source.'));
    const common = {
      sourceGenerationId: '01967b7c-1c80-7000-8000-000000000001',
      sourceSha256: createHash('sha256').update('source').digest('hex'),
      rendererVersion: 'none',
      ocrConfigVersion: 'none',
      blocks: parsed.blocks,
    };
    const first = normalizeParsedDocument({ ...common, parserVersion: 'text@1' });
    const replay = normalizeParsedDocument({ ...common, parserVersion: 'text@1' });
    const changed = normalizeParsedDocument({ ...common, parserVersion: 'text@2' });
    expect(replay).toEqual(first);
    expect(changed.documentHash).not.toBe(first.documentHash);
    expect(changed.blocks[0]?.blockKey).not.toBe(first.blocks[0]?.blockKey);
  });
});

describe('bounded PDF parsing', () => {
  it('extracts exact page geometry and marks image-only pages for OCR', async () => {
    const searchable = await parsePdf(buildPdf('Synthetic Requirement'));
    expect(searchable.ocrPageNumbers).toEqual([]);
    expect(searchable.blocks[0]).toMatchObject({
      kind: 'PARAGRAPH',
      text: 'Synthetic Requirement',
      locator: {
        format: 'PDF',
        page: 1,
        textItemRange: [0, 1],
      },
    });
    expect(
      searchable.blocks[0]?.locator.format === 'PDF' ? searchable.blocks[0].locator.polygon : [],
    ).toHaveLength(8);

    const imageOnly = await parsePdf(buildPdf(''));
    expect(imageOnly.blocks).toHaveLength(0);
    expect(imageOnly.ocrPageNumbers).toEqual([1]);
  });

  it('rejects malformed input truthfully', async () => {
    await expect(parsePdf(new TextEncoder().encode('%PDF-broken'))).rejects.toBeDefined();
  });
});

describe('bounded DOCX parsing', () => {
  it('preserves headings, paragraphs, and table cell coordinates', async () => {
    const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Context</w:t></w:r></w:p>
          <w:p><w:r><w:t>Synthetic project.</w:t></w:r></w:p>
          <w:tbl><w:tr>
            <w:tc><w:p><w:r><w:t>Capability</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>Required</w:t></w:r></w:p></w:tc>
          </w:tr></w:tbl>
        </w:body>
      </w:document>`;
    const parsed = await parseDocx(
      storedZip({
        '[Content_Types].xml':
          '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
        'word/document.xml': documentXml,
      }),
    );
    expect(parsed.blocks).toMatchObject([
      {
        kind: 'HEADING',
        text: 'Context',
        locator: { format: 'DOCX', headingPath: ['Context'], paragraph: 0 },
      },
      {
        kind: 'PARAGRAPH',
        text: 'Synthetic project.',
        locator: { format: 'DOCX', headingPath: ['Context'], paragraph: 1 },
      },
      {
        kind: 'TABLE_CELL',
        text: 'Capability',
        locator: {
          format: 'DOCX',
          headingPath: ['Context'],
          table: 0,
          row: 0,
          cell: 0,
        },
      },
      {
        kind: 'TABLE_CELL',
        text: 'Required',
        locator: {
          format: 'DOCX',
          headingPath: ['Context'],
          table: 0,
          row: 0,
          cell: 1,
        },
      },
    ]);
  });

  it('rejects external relationships, DTDs, traversal, and encrypted containers', async () => {
    const base = {
      '[Content_Types].xml': '<Types/>',
      'word/document.xml': '<w:document xmlns:w="w"><w:body/></w:document>',
    };
    await expect(
      parseDocx(
        storedZip({
          ...base,
          'word/_rels/document.xml.rels':
            '<Relationships><Relationship TargetMode="External" Target="https://invalid.test"/></Relationships>',
        }),
      ),
    ).rejects.toThrow(/EXTERNAL_RELATIONSHIP/);
    await expect(
      parseDocx(
        storedZip({
          ...base,
          'word/document.xml':
            '<!DOCTYPE x [<!ENTITY y "unsafe">]><w:document xmlns:w="w"><w:body/></w:document>',
        }),
      ),
    ).rejects.toThrow(/DTD_REJECTED/);
    await expect(parseDocx(storedZip({ ...base, '../escape': 'x' }))).rejects.toThrow(
      /PATH_TRAVERSAL/,
    );
    await expect(parseDocx(storedZip({ ...base, EncryptedPackage: 'x' }))).rejects.toThrow(
      /ENCRYPTED_DOCUMENT/,
    );
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

function storedZip(entries: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const nameBytes = encoder.encode(name);
    const body = encoder.encode(value);
    const crc = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.byteLength, 18);
    local.writeUInt32LE(body.byteLength, 22);
    local.writeUInt16LE(nameBytes.byteLength, 26);
    localParts.push(local, Buffer.from(nameBytes), Buffer.from(body));

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.byteLength, 20);
    central.writeUInt32LE(body.byteLength, 24);
    central.writeUInt16LE(nameBytes.byteLength, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, Buffer.from(nameBytes));
    offset += local.byteLength + nameBytes.byteLength + body.byteLength;
  }
  const centralOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entriesCount(entries), 8);
  end.writeUInt16LE(entriesCount(entries), 10);
  end.writeUInt32LE(centralDirectory.byteLength, 12);
  end.writeUInt32LE(centralOffset, 16);
  return new Uint8Array(Buffer.concat([...localParts, centralDirectory, end]));
}

function entriesCount(entries: Record<string, string>): number {
  return Object.keys(entries).length;
}

function crc32(value: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
