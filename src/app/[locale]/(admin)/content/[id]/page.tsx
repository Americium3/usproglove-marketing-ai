import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { setRequestLocale, getTranslations, getFormatter } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { articleUrl, hubUrl } from "@/lib/content/seo";
import { verticalProfile, type ContentVertical } from "@/lib/content/verticals";
import PieceEditor from "../_components/PieceEditor";

export const dynamic = "force-dynamic";

export default async function EditPiecePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("content");
  const format = await getFormatter();

  const [piece] = await db
    .select()
    .from(schema.contentPieces)
    .where(eq(schema.contentPieces.id, id))
    .limit(1);
  if (!piece) notFound();

  const vertical = piece.vertical as ContentVertical;
  const profile = verticalProfile(vertical);

  const inbound = await db
    .select({
      id: schema.contentLinks.id,
      anchor: schema.contentLinks.anchorText,
      fromTitle: schema.contentPieces.title,
      fromId: schema.contentPieces.id,
    })
    .from(schema.contentLinks)
    .innerJoin(schema.contentPieces, eq(schema.contentPieces.id, schema.contentLinks.fromPieceId))
    .where(eq(schema.contentLinks.toPieceId, piece.id))
    .limit(50);

  const outbound = await db
    .select()
    .from(schema.contentLinks)
    .where(eq(schema.contentLinks.fromPieceId, piece.id));

  const liveUrl = articleUrl({ locale: piece.locale, vertical, slug: piece.slug });
  const hub = hubUrl({ locale: piece.locale, vertical });

  return (
    <div className="space-y-8">
      <div>
        <Link href="/content" className="text-xs text-neutral-500 hover:underline">← {t("backToList")}</Link>
        <h1 className="text-2xl font-semibold mt-2">{piece.title}</h1>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-neutral-500">
          <span>/{piece.slug}</span>
          <span>·</span>
          <span>{profile.label}</span>
          <span>·</span>
          <span>{piece.locale}</span>
          <span>·</span>
          <span>status: <strong>{piece.status}</strong></span>
          {piece.scheduledAt && <><span>·</span><span>scheduled: {format.dateTime(piece.scheduledAt, { dateStyle: "short", timeStyle: "short" })}</span></>}
          {piece.publishedAt && <><span>·</span><span>published: {format.dateTime(piece.publishedAt, { dateStyle: "short", timeStyle: "short" })}</span></>}
        </div>
        {piece.status === "published" && (
          <a href={liveUrl} target="_blank" rel="noreferrer" className="inline-block mt-2 text-xs underline">{liveUrl}</a>
        )}
      </div>

      <PieceEditor
        piece={{
          id: piece.id,
          title: piece.title,
          excerpt: piece.excerpt,
          bodyMdx: piece.bodyMdx,
          heroSkuId: piece.heroSkuId,
          seoTitle: piece.seoTitle,
          seoDescription: piece.seoDescription,
          keywords: piece.keywords ?? [],
          status: piece.status,
          scheduledAt: piece.scheduledAt ? piece.scheduledAt.toISOString() : null,
          wordCount: piece.wordCount,
          internalLinkCount: piece.internalLinkCount,
          externalLinkCount: piece.externalLinkCount,
          canonicalUrl: piece.canonicalUrl,
        }}
      />

      <section>
        <h2 className="text-base font-semibold mb-3">{t("links.title")}</h2>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">{t("links.inbound", { count: inbound.length })}</div>
            {inbound.length === 0 ? (
              <p className="text-neutral-500 text-xs">{t("links.noInbound")}</p>
            ) : (
              <ul className="space-y-1">
                {inbound.map((l) => (
                  <li key={l.id} className="truncate">
                    <Link href={`/content/${l.fromId}`} className="hover:underline">{l.fromTitle}</Link>
                    <span className="text-xs text-neutral-500"> — &ldquo;{l.anchor}&rdquo;</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">{t("links.outbound", { count: outbound.length })}</div>
            {outbound.length === 0 ? (
              <p className="text-neutral-500 text-xs">{t("links.noOutbound")}</p>
            ) : (
              <ul className="space-y-1">
                {outbound.map((l) => (
                  <li key={l.id} className="truncate">
                    <a href={l.toUrl} className="hover:underline">{l.anchorText}</a>
                    <span className="text-xs text-neutral-500"> ({l.kind})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <p className="text-xs text-neutral-500 mt-2">{t("links.hubReference", { url: hub })}</p>
      </section>
    </div>
  );
}
