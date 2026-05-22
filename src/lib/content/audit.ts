import { desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export interface InboundCount {
  pieceId: string;
  title: string;
  slug: string;
  vertical: string;
  locale: string;
  inbound: number;
  status: string;
}

export interface OrphanRow {
  pieceId: string;
  title: string;
  slug: string;
  vertical: string;
  locale: string;
  status: string;
  createdAt: Date;
}

export interface BrokenLinkRow {
  fromPieceId: string;
  fromTitle: string;
  toUrl: string;
  anchorText: string;
  kind: string;
}

export async function inboundCounts(limit = 50): Promise<InboundCount[]> {
  const rows = await db
    .select({
      pieceId: schema.contentPieces.id,
      title: schema.contentPieces.title,
      slug: schema.contentPieces.slug,
      vertical: schema.contentPieces.vertical,
      locale: schema.contentPieces.locale,
      status: schema.contentPieces.status,
      inbound: sql<number>`count(${schema.contentLinks.id})::int`,
    })
    .from(schema.contentPieces)
    .leftJoin(
      schema.contentLinks,
      eq(schema.contentLinks.toPieceId, schema.contentPieces.id),
    )
    .groupBy(schema.contentPieces.id)
    .orderBy(desc(sql`count(${schema.contentLinks.id})`))
    .limit(limit);
  return rows as InboundCount[];
}

export async function orphans(): Promise<OrphanRow[]> {
  const rows = await db
    .select({
      pieceId: schema.contentPieces.id,
      title: schema.contentPieces.title,
      slug: schema.contentPieces.slug,
      vertical: schema.contentPieces.vertical,
      locale: schema.contentPieces.locale,
      status: schema.contentPieces.status,
      createdAt: schema.contentPieces.createdAt,
      inbound: sql<number>`count(${schema.contentLinks.id})::int`,
    })
    .from(schema.contentPieces)
    .leftJoin(
      schema.contentLinks,
      eq(schema.contentLinks.toPieceId, schema.contentPieces.id),
    )
    .where(eq(schema.contentPieces.status, "published"))
    .groupBy(schema.contentPieces.id)
    .having(sql`count(${schema.contentLinks.id}) = 0`)
    .orderBy(desc(schema.contentPieces.createdAt));
  return rows as OrphanRow[];
}

/**
 * "Broken" here means: an internal link whose target piece no longer exists
 * (toPieceId is null but the link was tagged internal). Since we cascade
 * delete, a row here means the original URL no longer resolves either.
 */
export async function brokenInternalLinks(): Promise<BrokenLinkRow[]> {
  const rows = await db
    .select({
      fromPieceId: schema.contentLinks.fromPieceId,
      fromTitle: schema.contentPieces.title,
      toUrl: schema.contentLinks.toUrl,
      anchorText: schema.contentLinks.anchorText,
      kind: schema.contentLinks.kind,
    })
    .from(schema.contentLinks)
    .innerJoin(
      schema.contentPieces,
      eq(schema.contentPieces.id, schema.contentLinks.fromPieceId),
    )
    .where(
      sql`${schema.contentLinks.kind} = 'internal-article' AND ${isNull(schema.contentLinks.toPieceId)}`,
    )
    .limit(100);
  return rows;
}
