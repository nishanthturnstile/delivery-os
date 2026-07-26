import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

import { normalizeExtractedText, type NormalizedBlockDraft } from '@delivery-os/domain';
import { z } from 'zod';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const ocrPageInputSchema = z.object({
  page: z.number().int().positive(),
  inputHash: sha256Schema,
  imageBase64: z.string().min(4).max(32_000_000),
});

export const ocrRecognitionRequestSchema = z
  .object({
    schemaVersion: z.literal('1'),
    sourceGenerationId: z.string().min(1).max(100),
    sourceSha256: sha256Schema,
    rendererVersion: z.string().min(1).max(120),
    ocrConfigVersion: z.string().min(1).max(160),
    pages: z.array(ocrPageInputSchema).min(1).max(10),
  })
  .strict();

export const ocrRecognitionBlockSchema = z
  .object({
    page: z.number().int().positive(),
    polygon: z.array(z.number()).length(8),
    text: z.string().min(1).max(100_000),
    confidence: z.number().min(0).max(1),
    readingOrder: z.number().int().nonnegative(),
    kind: z.enum(['HEADING', 'PARAGRAPH', 'LIST_ITEM', 'TABLE_CELL']),
    table: z.number().int().nonnegative().optional(),
    row: z.number().int().nonnegative().optional(),
    cell: z.number().int().nonnegative().optional(),
    inputHash: sha256Schema,
  })
  .strict();

export const ocrRecognitionResponseSchema = z
  .object({
    schemaVersion: z.literal('1'),
    modelVersion: z.string().min(1).max(160),
    modelDigest: sha256Schema,
    configVersion: z.string().min(1).max(160),
    pages: z.array(
      z
        .object({
          page: z.number().int().positive(),
          inputHash: sha256Schema,
          blocks: z.array(ocrRecognitionBlockSchema).max(100_000),
        })
        .strict(),
    ),
  })
  .strict();

export type OcrRecognitionRequest = z.infer<typeof ocrRecognitionRequestSchema>;
export type OcrRecognitionResponse = z.infer<typeof ocrRecognitionResponseSchema>;

export interface OcrProvider {
  recognize(request: OcrRecognitionRequest): Promise<OcrRecognitionResponse>;
}

export class PrivateOcrClient implements OcrProvider {
  private readonly endpoint: URL;

  constructor(
    baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs: number,
    private readonly request: typeof fetch = fetch,
  ) {
    this.endpoint = privateEndpoint(baseUrl);
    if (token.length < 16 || timeoutMs < 100 || timeoutMs > 120_000) {
      throw new Error('OCR client configuration is invalid.');
    }
  }

  async recognize(request: OcrRecognitionRequest): Promise<OcrRecognitionResponse> {
    const validatedRequest = ocrRecognitionRequestSchema.parse(request);
    const response = await this.request(new URL('/v1/recognize', this.endpoint), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(validatedRequest),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(
        response.status === 503 ? 'OCR_WORKFLOW_UNAVAILABLE' : `OCR_PROVIDER_${response.status}`,
      );
    }
    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (declaredLength > 20_000_000) throw new Error('OCR_RESPONSE_SIZE_LIMIT');
    const body: unknown = await response.json();
    const parsed = ocrRecognitionResponseSchema.parse(body);
    assertResponseMatchesRequest(validatedRequest, parsed);
    return parsed;
  }
}

export class DeterministicFakeOcr implements OcrProvider {
  constructor(
    private readonly fixture: (
      request: OcrRecognitionRequest,
    ) => OcrRecognitionResponse | Promise<OcrRecognitionResponse>,
  ) {}

  async recognize(request: OcrRecognitionRequest): Promise<OcrRecognitionResponse> {
    const validatedRequest = ocrRecognitionRequestSchema.parse(request);
    const response = ocrRecognitionResponseSchema.parse(await this.fixture(validatedRequest));
    assertResponseMatchesRequest(validatedRequest, response);
    return response;
  }
}

export function ocrResponseToBlocks(
  response: OcrRecognitionResponse,
  minimumConfidence: number,
): { blocks: NormalizedBlockDraft[]; lowConfidencePages: number[]; outputHash: string } {
  if (minimumConfidence < 0 || minimumConfidence > 1) {
    throw new Error('OCR confidence threshold is invalid.');
  }
  const lowConfidencePages = new Set<number>();
  const ordered = response.pages
    .flatMap((page) => page.blocks)
    .sort((left, right) => left.page - right.page || left.readingOrder - right.readingOrder);
  const blocks = ordered.map((block, ordinal) => {
    if (block.confidence < minimumConfidence) lowConfidencePages.add(block.page);
    return {
      ordinal,
      kind: block.kind,
      text: normalizeExtractedText(block.text),
      locator: {
        format: 'PDF' as const,
        page: block.page,
        polygon: block.polygon.map(round),
      },
      extraction: 'OCR' as const,
      confidence: block.confidence.toFixed(6).replace(/0+$/u, '').replace(/\.$/u, ''),
    };
  });
  return {
    blocks,
    lowConfidencePages: [...lowConfidencePages].sort((left, right) => left - right),
    outputHash: createHash('sha256').update(JSON.stringify(response), 'utf8').digest('hex'),
  };
}

function assertResponseMatchesRequest(
  request: OcrRecognitionRequest,
  response: OcrRecognitionResponse,
): void {
  if (response.configVersion !== request.ocrConfigVersion) {
    throw new Error('OCR_CONFIG_MISMATCH');
  }
  const expected = new Map(request.pages.map((page) => [page.page, page.inputHash]));
  if (response.pages.length !== expected.size) throw new Error('OCR_PAGE_SET_MISMATCH');
  for (const page of response.pages) {
    if (expected.get(page.page) !== page.inputHash) throw new Error('OCR_INPUT_HASH_MISMATCH');
    if (
      page.blocks.some((block) => block.page !== page.page || block.inputHash !== page.inputHash)
    ) {
      throw new Error('OCR_BLOCK_PROVENANCE_MISMATCH');
    }
    expected.delete(page.page);
  }
  if (expected.size !== 0) throw new Error('OCR_PAGE_SET_MISMATCH');
}

function privateEndpoint(value: string): URL {
  const url = new URL(value);
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    throw new Error('OCR endpoint is invalid.');
  }
  const host = url.hostname;
  const ipVersion = isIP(host);
  const privateHostname = host === 'localhost' || host.toLowerCase().endsWith('.railway.internal');
  if (
    (ipVersion === 0 && !privateHostname) ||
    (ipVersion !== 0 &&
      host !== '127.0.0.1' &&
      host !== '::1' &&
      !host.startsWith('10.') &&
      !host.startsWith('192.168.') &&
      !isPrivate172(host))
  ) {
    throw new Error('OCR endpoint must be private.');
  }
  return url;
}

function isPrivate172(host: string): boolean {
  const second = /^172\.(\d{1,3})\./u.exec(host)?.[1];
  if (second === undefined) return false;
  const value = Number.parseInt(second, 10);
  return value >= 16 && value <= 31;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
