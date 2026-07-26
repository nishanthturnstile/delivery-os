import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  DeterministicFakeOcr,
  PrivateOcrClient,
  ocrResponseToBlocks,
  type OcrRecognitionRequest,
} from './ocr';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const request: OcrRecognitionRequest = {
  schemaVersion: '1',
  sourceGenerationId: 'source-generation',
  sourceSha256: digest('source'),
  rendererVersion: 'pdfjs-6.1.200@144dpi',
  ocrConfigVersion: 'fake-v1',
  pages: [{ page: 1, inputHash: digest('page'), imageBase64: 'cGFnZQ==' }],
};

function fixture(input: OcrRecognitionRequest) {
  return {
    schemaVersion: '1' as const,
    modelVersion: 'deterministic-fake-v1',
    modelDigest: digest('fake-model'),
    configVersion: input.ocrConfigVersion,
    pages: input.pages.map((page) => ({
      page: page.page,
      inputHash: page.inputHash,
      blocks: [
        {
          page: page.page,
          polygon: [0, 0, 10, 0, 10, 2, 0, 2],
          text: ' Synthetic requirement ',
          confidence: 0.71,
          readingOrder: 0,
          kind: 'PARAGRAPH' as const,
          inputHash: page.inputHash,
        },
      ],
    })),
  };
}

describe('OCR boundary', () => {
  it('validates deterministic fake provenance and flags low confidence', async () => {
    const response = await new DeterministicFakeOcr(fixture).recognize(request);
    const result = ocrResponseToBlocks(response, 0.8);
    expect(result.lowConfidencePages).toEqual([1]);
    expect(result.blocks[0]).toMatchObject({
      text: 'Synthetic requirement',
      extraction: 'OCR',
      confidence: '0.71',
    });
    expect(result.outputHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a response bound to a different rendered page', async () => {
    const provider = new DeterministicFakeOcr((input) => {
      const response = fixture(input);
      const page = response.pages[0];
      if (page === undefined) throw new Error('TEST_FIXTURE_INVALID');
      return { ...response, pages: [{ ...page, inputHash: digest('other') }] };
    });
    await expect(provider.recognize(request)).rejects.toThrow('OCR_INPUT_HASH_MISMATCH');
  });

  it('uses only a private authenticated endpoint and validates the response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(fixture(request)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new PrivateOcrClient(
      'http://10.0.0.8:8080',
      'synthetic-token-0001',
      1_000,
      fetcher,
    );
    await client.recognize(request);
    const call = fetcher.mock.calls[0];
    if (call === undefined) throw new Error('EXPECTED_FETCH_CALL');
    const [url, init] = call;
    expect(url instanceof URL ? url.href : url instanceof Request ? url.url : url).toBe(
      'http://10.0.0.8:8080/v1/recognize',
    );
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer synthetic-token-0001');
    expect(JSON.stringify(init)).not.toContain('http://example');
    expect(() => new PrivateOcrClient('https://8.8.8.8', 'synthetic-token-0001', 1_000)).toThrow(
      'must be private',
    );
    expect(
      () => new PrivateOcrClient('https://ocr.example.com', 'synthetic-token-0001', 1_000),
    ).toThrow('must be private');
    expect(
      () => new PrivateOcrClient('http://ocr.railway.internal:8080', 'synthetic-token-0001', 1_000),
    ).not.toThrow();
  });
});
