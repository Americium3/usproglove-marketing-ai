import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { generateSeoMeta } from "./seo";
import { buildArticleJsonLd } from "./jsonld";
import { weaveInternalLinks } from "./internalLinks";

interface PublishResult {
  pieceId: string;
  slug: string;
  vertical: string;
  locale: string;
}

/**
 * Move a piece to published immediately and ensure SEO meta + JSON-LD +
 * internal links are populated. Idempotent: re-running republishes without
 * duplicating links (weaver clears prior content_links rows for the piece).
 */
export async function publishPieceNow(pieceId: string): Promise<PublishResult> {
  await ensureSeo(pieceId);
  await weaveInternalLinks(pieceId);
  await rebuildJsonLd(pieceId);

  const [row] = await db
    .update(schema.contentPieces)
    .set({
      status: "published",
      published: true,
      publishedAt: new Date(),
      scheduledAt: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.contentPieces.id, pieceId))
    .returning({
      id: schema.contentPieces.id,
      slug: schema.contentPieces.slug,
      vertical: schema.contentPieces.vertical,
      locale: schema.contentPieces.locale,
    });
  return { pieceId: row.id, slug: row.slug, vertical: row.vertical, locale: row.locale };
}

export async function schedulePiece(pieceId: string, scheduledAt: Date) {
  if (scheduledAt.getTime() <= Date.now()) {
    return publishPieceNow(pieceId);
  }
  await ensureSeo(pieceId);
  await db
    .update(schema.contentPieces)
    .set({ status: "scheduled", scheduledAt, updatedAt: new Date() })
    .where(eq(schema.contentPieces.id, pieceId));
  return { pieceId, scheduledAt };
}

export async function unpublishPiece(pieceId: string) {
  await db
    .update(schema.contentPieces)
    .set({ status: "draft", published: false, publishedAt: null, updatedAt: new Date() })
    .where(eq(schema.contentPieces.id, pieceId));
}

/**
 * Cron entry: publish any piece whose scheduledAt <= now and status == scheduled.
 */
export async function publishDuePieces(): Promise<{ published: PublishResult[] }> {
  const now = new Date();
  const due = await db
    .select({ id: schema.contentPieces.id })
    .from(schema.contentPieces)
    .where(
      and(
        eq(schema.contentPieces.status, "scheduled"),
        isNotNull(schema.contentPieces.scheduledAt),
        lte(schema.contentPieces.scheduledAt, now),
      ),
    )
    .limit(25);

  const out: PublishResult[] = [];
  for (const row of due) {
    try {
      out.push(await publishPieceNow(row.id));
    } catch (err) {
      console.error("[content-publish] failed", row.id, err);
    }
  }
  return { published: out };
}

async function ensureSeo(pieceId: string) {
  const [piece] = await db
    .select({
      seoTitle: schema.contentPieces.seoTitle,
      seoDescription: schema.contentPieces.seoDescription,
    })
    .from(schema.contentPieces)
    .where(eq(schema.contentPieces.id, pieceId))
    .limit(1);
  if (!piece) throw new Error("piece_not_found");
  if (piece.seoTitle && piece.seoDescription) return;
  await generateSeoMeta(pieceId);
}

async function rebuildJsonLd(pieceId: string) {
  const [piece] = await db
    .select()
    .from(schema.contentPieces)
    .where(eq(schema.contentPieces.id, pieceId))
    .limit(1);
  if (!piece) return;
  const jsonLd = buildArticleJsonLd(piece);
  await db
    .update(schema.contentPieces)
    .set({ jsonLd, updatedAt: new Date() })
    .where(eq(schema.contentPieces.id, pieceId));
}
