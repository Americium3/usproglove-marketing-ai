import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { articlePath, hubPath } from "./seo";
import { verticalProfile, type ContentVertical } from "./verticals";

interface LinkTarget {
  url: string;
  anchorText: string;
  toPieceId?: string;
  kind: "internal-article" | "internal-hub" | "internal-sku";
  matchTerms: string[];
}

interface WeaveOptions {
  maxLinks?: number;
  perTargetCap?: number;
}

/**
 * Insert markdown links into a piece's body for related published articles,
 * the vertical hub, and the hero SKU page. Only links the first occurrence of
 * each match term in the body and skips occurrences already inside link syntax.
 * Persists each inserted link in content_links for later audit.
 */
export async function weaveInternalLinks(pieceId: string, opts: WeaveOptions = {}) {
  const maxLinks = opts.maxLinks ?? 8;
  const perTargetCap = opts.perTargetCap ?? 1;

  const [piece] = await db
    .select()
    .from(schema.contentPieces)
    .where(eq(schema.contentPieces.id, pieceId))
    .limit(1);
  if (!piece) throw new Error("piece_not_found");

  const vertical = piece.vertical as ContentVertical;

  const peers = await db
    .select({
      id: schema.contentPieces.id,
      title: schema.contentPieces.title,
      slug: schema.contentPieces.slug,
      locale: schema.contentPieces.locale,
      vertical: schema.contentPieces.vertical,
      keywords: schema.contentPieces.keywords,
    })
    .from(schema.contentPieces)
    .where(
      and(
        eq(schema.contentPieces.status, "published"),
        eq(schema.contentPieces.locale, piece.locale),
        ne(schema.contentPieces.id, piece.id),
      ),
    )
    .limit(60);

  const profile = verticalProfile(vertical);
  const targets: LinkTarget[] = [];

  // 1. Hub link (always one)
  targets.push({
    url: hubPath({ locale: piece.locale, vertical }),
    anchorText: profile.label.toLowerCase(),
    kind: "internal-hub",
    matchTerms: [profile.shortLabel.toLowerCase(), profile.label.toLowerCase()],
  });

  // 2. Peer articles in same vertical first, then cross-vertical
  const sortedPeers = peers
    .slice()
    .sort((a, b) => (a.vertical === vertical ? -1 : 0) - (b.vertical === vertical ? -1 : 0));
  for (const peer of sortedPeers) {
    const phrases = uniqueShortPhrases([
      peer.title.toLowerCase(),
      ...((peer.keywords ?? []) as string[]).map((k) => k.toLowerCase()),
    ]);
    if (phrases.length === 0) continue;
    targets.push({
      url: articlePath({
        locale: peer.locale,
        vertical: peer.vertical as ContentVertical,
        slug: peer.slug,
      }),
      anchorText: phrases[0],
      toPieceId: peer.id,
      kind: "internal-article",
      matchTerms: phrases,
    });
  }

  // 3. Hero SKU sample/quote link (no public SKU page yet — link back to hub
  //    anchor #request-sample; safe URL that always exists)
  if (piece.heroSkuId) {
    targets.push({
      url: `${hubPath({ locale: piece.locale, vertical })}#request-sample`,
      anchorText: "request a sample",
      kind: "internal-sku",
      matchTerms: ["request a sample", "request samples", "free sample", "get a quote"],
    });
  }

  let body = piece.bodyMdx;
  const inserted: Array<{ url: string; anchorText: string; toPieceId?: string; kind: string }> = [];
  const usedPhrases = new Set<string>();

  outer: for (const target of targets) {
    if (inserted.length >= maxLinks) break;
    let placedForTarget = 0;
    for (const phrase of target.matchTerms) {
      if (usedPhrases.has(phrase)) continue;
      const idx = findInsertableMatch(body, phrase);
      if (idx === -1) continue;
      const matched = body.slice(idx, idx + phrase.length);
      const replacement = `[${matched}](${target.url})`;
      body = body.slice(0, idx) + replacement + body.slice(idx + phrase.length);
      usedPhrases.add(phrase);
      inserted.push({
        url: target.url,
        anchorText: matched,
        toPieceId: target.toPieceId,
        kind: target.kind,
      });
      placedForTarget += 1;
      if (placedForTarget >= perTargetCap) continue outer;
      if (inserted.length >= maxLinks) break outer;
    }
  }

  const externalLinkCount = countExternalLinks(body);
  const internalLinkCount = inserted.length;

  await db.transaction(async (tx) => {
    await tx.delete(schema.contentLinks).where(eq(schema.contentLinks.fromPieceId, piece.id));
    if (inserted.length > 0) {
      await tx.insert(schema.contentLinks).values(
        inserted.map((l) => ({
          fromPieceId: piece.id,
          toPieceId: l.toPieceId,
          toUrl: l.url,
          anchorText: l.anchorText,
          kind: l.kind,
        })),
      );
    }
    await tx
      .update(schema.contentPieces)
      .set({
        bodyMdx: body,
        internalLinkCount,
        externalLinkCount,
        lastLinkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.contentPieces.id, piece.id));
  });

  return { inserted: inserted.length, body };
}

function uniqueShortPhrases(phrases: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of phrases) {
    const clean = p.trim();
    if (!clean || clean.length < 6 || clean.length > 80) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

/**
 * Find the first occurrence of `phrase` (case-insensitive) in body that is NOT
 * already inside a markdown link, NOT inside a heading line, and NOT inside an
 * existing `[...](...)`-styled span. Returns the start index or -1.
 */
function findInsertableMatch(body: string, phrase: string): number {
  const lower = body.toLowerCase();
  let from = 0;
  while (true) {
    const idx = lower.indexOf(phrase, from);
    if (idx === -1) return -1;
    if (!isInsideLink(body, idx) && !isInsideHeading(body, idx)) return idx;
    from = idx + 1;
  }
}

function isInsideLink(body: string, idx: number): boolean {
  // crude: walk back to find unmatched `[`
  const slice = body.slice(Math.max(0, idx - 200), idx);
  const lastOpen = slice.lastIndexOf("[");
  if (lastOpen === -1) return false;
  const between = slice.slice(lastOpen);
  // already closed before idx?
  return !/\]\([^)]*\)/.test(between);
}

function isInsideHeading(body: string, idx: number): boolean {
  const lineStart = body.lastIndexOf("\n", idx - 1) + 1;
  const lineHead = body.slice(lineStart, Math.min(body.length, lineStart + 10));
  return /^#{1,6}\s/.test(lineHead);
}

function countExternalLinks(body: string): number {
  let count = 0;
  const re = /\]\((https?:\/\/[^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (!m[1].includes("usproglove.com")) count += 1;
  }
  return count;
}
