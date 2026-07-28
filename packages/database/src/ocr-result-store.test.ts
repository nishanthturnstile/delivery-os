import { describe, expect, it, vi } from 'vitest';

import { PostgresOcrPageResultStore } from './ocr-result-store';

const input = {
  id: '019c9f00-0000-7000-8000-000000000001',
  workspaceId: '019c9f00-0000-7000-8000-000000000002',
  projectId: '019c9f00-0000-7000-8000-000000000003',
  sourceGenerationId: '019c9f00-0000-7000-8000-000000000004',
  pageNumber: 1,
  inputHash: 'a'.repeat(64),
  rendererVersion: 'pdfjs-canvas@1:dpi-300',
  modelVersion: 'PP-StructureV3@paddleocr-3.7.0',
  modelDigest: 'b'.repeat(64),
  configVersion: 'c'.repeat(64),
  outputHash: 'd'.repeat(64),
  minimumConfidence: '0.85',
  needsAttention: false,
  result: { schemaVersion: '1', pages: [] },
};

describe('OCR page result database deduplication', () => {
  it.each([
    [{ id: input.id, output_hash: input.outputHash, inserted: true }, false],
    [{ id: input.id, output_hash: input.outputHash, inserted: false }, true],
  ] as const)('returns an immutable insert or replay', async (row, replayed) => {
    const query = vi.fn().mockResolvedValue({ rows: [row] });
    const store = new PostgresOcrPageResultStore({ query } as never);
    await expect(store.commit(input)).resolves.toEqual({ id: input.id, replayed });
    expect(query).toHaveBeenCalledOnce();
  });

  it('rejects missing or divergent output for the same complete input key', async () => {
    for (const rows of [[], [{ id: input.id, output_hash: 'e'.repeat(64), inserted: false }]]) {
      const store = new PostgresOcrPageResultStore({
        query: vi.fn().mockResolvedValue({ rows }),
      } as never);
      await expect(store.commit(input)).rejects.toThrow('OCR_DETERMINISM_CONFLICT');
    }
  });
});
