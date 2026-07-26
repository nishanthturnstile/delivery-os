import { createHash } from 'node:crypto';

import {
  createNormalizedBlockKey,
  normalizeExtractedText,
  type NormalizedBlockDraft,
} from '@delivery-os/domain';

export interface NormalizedBlockWithKey extends NormalizedBlockDraft {
  blockKey: string;
}

export function normalizeParsedDocument(input: {
  sourceGenerationId: string;
  sourceSha256: string;
  parserVersion: string;
  rendererVersion: string;
  ocrConfigVersion: string;
  blocks: readonly NormalizedBlockDraft[];
}): { documentHash: string; blocks: NormalizedBlockWithKey[] } {
  const seenOrdinals = new Set<number>();
  const blocks = input.blocks.map((draft, expectedOrdinal) => {
    if (draft.ordinal !== expectedOrdinal || seenOrdinals.has(draft.ordinal)) {
      throw new Error('Normalized block ordinals must be contiguous and unique.');
    }
    seenOrdinals.add(draft.ordinal);
    const block = { ...draft, text: normalizeExtractedText(draft.text) };
    if (block.text.length === 0) throw new Error('Normalized blocks cannot be empty.');
    return {
      ...block,
      blockKey: createNormalizedBlockKey({
        sourceGenerationId: input.sourceGenerationId,
        parserVersion: input.parserVersion,
        rendererVersion: input.rendererVersion,
        ocrConfigVersion: input.ocrConfigVersion,
        block,
      }),
    };
  });
  const material = JSON.stringify({
    sourceSha256: input.sourceSha256,
    parserVersion: input.parserVersion,
    rendererVersion: input.rendererVersion,
    ocrConfigVersion: input.ocrConfigVersion,
    blocks,
  });
  return {
    documentHash: createHash('sha256').update(material, 'utf8').digest('hex'),
    blocks,
  };
}
