import type { NormalizedBlockDraft } from '@delivery-os/domain';

export interface ParsedDocument {
  blocks: NormalizedBlockDraft[];
  ocrPageNumbers: number[];
}

export type ParserLimits = Readonly<{
  maximumBytes: number;
  maximumPages: number;
  maximumBlocks: number;
  maximumTextCharacters: number;
  maximumZipEntries: number;
  maximumExpandedBytes: number;
  maximumCompressionRatio: number;
}>;

export const DEFAULT_PARSER_LIMITS: ParserLimits = {
  maximumBytes: 52_428_800,
  maximumPages: 500,
  maximumBlocks: 100_000,
  maximumTextCharacters: 10_000_000,
  maximumZipEntries: 2_000,
  maximumExpandedBytes: 100_000_000,
  maximumCompressionRatio: 100,
};
