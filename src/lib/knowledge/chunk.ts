const TARGET_CHARS = 1500;
const OVERLAP_CHARS = 150;
const MIN_CHARS = 200;

/**
 * Paragraph-aware chunker. Splits on blank lines, accumulates paragraphs until
 * the target size, then emits with a short overlap to preserve context across
 * boundaries. ~1500 chars ≈ ~400 tokens for English/Chinese mixed content —
 * well under text-embedding-3-small's 8191-token ceiling.
 *
 * Very small inputs (< MIN_CHARS) return as a single chunk so we don't drop
 * one-liner notes or short product specs.
 */
export function chunkText(input: string): string[] {
  const trimmed = input.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= MIN_CHARS) return [trimmed];

  const paragraphs = trimmed
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let buf = "";

  for (const para of paragraphs) {
    if (para.length > TARGET_CHARS) {
      if (buf) {
        chunks.push(buf);
        buf = "";
      }
      for (let i = 0; i < para.length; i += TARGET_CHARS - OVERLAP_CHARS) {
        chunks.push(para.slice(i, i + TARGET_CHARS));
      }
      continue;
    }

    if (buf.length + para.length + 2 > TARGET_CHARS) {
      chunks.push(buf);
      const tail = buf.slice(-OVERLAP_CHARS);
      buf = (tail ? tail + "\n\n" : "") + para;
    } else {
      buf = buf ? `${buf}\n\n${para}` : para;
    }
  }
  if (buf) chunks.push(buf);

  return chunks;
}
