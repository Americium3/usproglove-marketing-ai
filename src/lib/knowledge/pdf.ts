import { extractText, getDocumentProxy } from "unpdf";

export interface ExtractedPdf {
  title: string;
  text: string;
  pageCount: number;
}

const MAX_BYTES = 15_000_000;

/**
 * Extract plain text from a PDF buffer using unpdf (a serverless-friendly fork
 * of pdf.js — no native deps, works on Vercel). Pages are joined with blank
 * lines so the paragraph-aware chunker can find boundaries.
 */
export async function extractPdfText(buffer: ArrayBuffer, fallbackTitle?: string): Promise<ExtractedPdf> {
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error(`pdf too large (${buffer.byteLength} bytes, max ${MAX_BYTES})`);
  }

  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });

  const pageTexts = Array.isArray(text) ? text : [text];
  const merged = pageTexts
    .map((p) => p.replace(/\s+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim())
    .filter((p) => p.length > 0)
    .join("\n\n");

  let title = fallbackTitle?.trim() || "";
  if (!title) {
    try {
      const metadata = await pdf.getMetadata();
      const info = (metadata?.info ?? {}) as { Title?: string };
      title = info.Title?.trim() || "";
    } catch {
      // metadata is optional
    }
  }

  return {
    title: title || `PDF (${totalPages} pages)`,
    text: merged,
    pageCount: totalPages,
  };
}
