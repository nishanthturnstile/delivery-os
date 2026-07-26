import { createHash } from 'node:crypto';

import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface RenderedOcrPage {
  page: number;
  inputHash: string;
  image: Uint8Array;
  width: number;
  height: number;
}

export async function renderPdfPagesForOcr(
  input: Uint8Array,
  pages: readonly number[],
  options: Readonly<{
    dpi: number;
    maximumPixelsPerPage: number;
    maximumOutputBytesPerPage: number;
  }>,
): Promise<RenderedOcrPage[]> {
  if (
    options.dpi < 72 ||
    options.dpi > 300 ||
    options.maximumPixelsPerPage < 1 ||
    options.maximumOutputBytesPerPage < 1 ||
    pages.length < 1 ||
    pages.length > 10
  ) {
    throw new Error('PDF OCR rendering configuration is invalid.');
  }
  const uniquePages = [...new Set(pages)].sort((left, right) => left - right);
  if (uniquePages.length !== pages.length || uniquePages.some((page) => page < 1)) {
    throw new Error('PDF OCR page selection is invalid.');
  }
  const loadingTask = getDocument({
    data: input.slice(),
    useSystemFonts: false,
    useWasm: true,
    stopAtErrors: true,
    maxImageSize: options.maximumPixelsPerPage,
    canvasMaxAreaInBytes: options.maximumPixelsPerPage * 4,
    disableFontFace: true,
    disableRange: true,
    disableStream: true,
    disableAutoFetch: true,
    useWorkerFetch: false,
  });
  try {
    const document = await loadingTask.promise;
    const rendered: RenderedOcrPage[] = [];
    for (const pageNumber of uniquePages) {
      if (pageNumber > document.numPages) throw new Error('PDF_OCR_PAGE_OUT_OF_RANGE');
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: options.dpi / 72 });
      const width = Math.ceil(viewport.width);
      const height = Math.ceil(viewport.height);
      if (width * height > options.maximumPixelsPerPage) throw new Error('PDF_OCR_PIXEL_LIMIT');
      const canvas = createCanvas(width, height);
      await page.render({
        canvas,
        canvasContext: canvas.getContext('2d'),
        viewport,
      }).promise;
      const image = canvas.toBuffer('image/png');
      if (image.byteLength > options.maximumOutputBytesPerPage) {
        throw new Error('PDF_OCR_OUTPUT_SIZE_LIMIT');
      }
      rendered.push({
        page: pageNumber,
        inputHash: createHash('sha256').update(image).digest('hex'),
        image: new Uint8Array(image),
        width,
        height,
      });
      page.cleanup();
    }
    return rendered;
  } finally {
    await loadingTask.destroy();
  }
}
