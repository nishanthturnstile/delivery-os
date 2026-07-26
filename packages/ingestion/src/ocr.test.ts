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
    for (const endpoint of [
      'ftp://127.0.0.1',
      'http://user@127.0.0.1',
      'http://password:secret@127.0.0.1',
    ]) {
      expect(() => new PrivateOcrClient(endpoint, 'synthetic-token-0001', 1_000)).toThrow(
        'endpoint is invalid',
      );
    }
    for (const endpoint of ['http://172.15.0.1', 'http://172.32.0.1', 'http://1.1.1.1']) {
      expect(() => new PrivateOcrClient(endpoint, 'synthetic-token-0001', 1_000)).toThrow(
        'must be private',
      );
    }
    for (const endpoint of [
      'http://localhost',
      'http://127.0.0.1',
      'http://10.0.0.1',
      'http://172.16.0.1',
      'http://172.31.0.1',
      'http://192.168.0.1',
    ]) {
      expect(() => new PrivateOcrClient(endpoint, 'synthetic-token-0001', 1_000)).not.toThrow();
    }
    expect(() => new PrivateOcrClient('http://127.0.0.1', 'short', 1_000)).toThrow(
      'configuration is invalid',
    );
    expect(() => new PrivateOcrClient('http://127.0.0.1', 'synthetic-token-0001', 99)).toThrow(
      'configuration is invalid',
    );
    expect(() => new PrivateOcrClient('http://127.0.0.1', 'synthetic-token-0001', 120_001)).toThrow(
      'configuration is invalid',
    );
  });

  it('maps provider failures and response limits to safe error codes', async () => {
    for (const [response, message] of [
      [new Response('', { status: 503 }), 'OCR_WORKFLOW_UNAVAILABLE'],
      [new Response('', { status: 500 }), 'OCR_PROVIDER_500'],
      [
        new Response('{}', {
          status: 200,
          headers: { 'content-length': '20000001' },
        }),
        'OCR_RESPONSE_SIZE_LIMIT',
      ],
    ] as const) {
      const client = new PrivateOcrClient(
        'http://127.0.0.1',
        'synthetic-token-0001',
        1_000,
        vi.fn<typeof fetch>().mockResolvedValue(response),
      );
      await expect(client.recognize(request)).rejects.toThrow(message);
    }
  });

  it('rejects configuration, page-set, and block provenance mismatches', async () => {
    const cases = [
      {
        mutate: (response: ReturnType<typeof fixture>) => ({
          ...response,
          configVersion: 'other-config',
        }),
        error: 'OCR_CONFIG_MISMATCH',
      },
      {
        mutate: (response: ReturnType<typeof fixture>) => ({ ...response, pages: [] }),
        error: 'OCR_PAGE_SET_MISMATCH',
      },
      {
        mutate: (response: ReturnType<typeof fixture>) => ({
          ...response,
          pages: response.pages.map((page) => ({
            ...page,
            blocks: page.blocks.map((block) => ({ ...block, page: 2 })),
          })),
        }),
        error: 'OCR_BLOCK_PROVENANCE_MISMATCH',
      },
    ];
    for (const testCase of cases) {
      const provider = new DeterministicFakeOcr((input) => testCase.mutate(fixture(input)));
      await expect(provider.recognize(request)).rejects.toThrow(testCase.error);
    }
  });

  it('sorts OCR blocks and validates confidence thresholds', () => {
    const response = fixture(request);
    const page = response.pages[0];
    if (page === undefined) throw new Error('TEST_FIXTURE_INVALID');
    const sourceBlock = page.blocks[0];
    if (sourceBlock === undefined) throw new Error('TEST_FIXTURE_BLOCK_MISSING');
    const result = ocrResponseToBlocks(
      {
        ...response,
        pages: [
          {
            ...page,
            blocks: [
              { ...sourceBlock, readingOrder: 2, text: 'Second', confidence: 1 },
              {
                ...sourceBlock,
                readingOrder: 1,
                text: 'First',
                confidence: 0,
                polygon: [0.123456, 0, 10, 0, 10, 2, 0, 2],
              },
            ],
          },
        ],
      },
      0.5,
    );
    expect(result.blocks.map((block) => block.text)).toEqual(['First', 'Second']);
    expect(result.lowConfidencePages).toEqual([1]);
    expect(result.blocks[0]?.locator).toMatchObject({
      polygon: [0.1235, 0, 10, 0, 10, 2, 0, 2],
    });
    for (const threshold of [-0.1, 1.1]) {
      expect(() => ocrResponseToBlocks(response, threshold)).toThrow(
        'confidence threshold is invalid',
      );
    }
  });
});
