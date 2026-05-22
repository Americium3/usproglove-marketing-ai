import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { setRequestLocale } from "next-intl/server";
import { db, schema } from "@/lib/db";
import {
  CONTENT_VERTICALS,
  verticalProfile,
  heroProductFor,
  isContentVertical,
  type ContentVertical,
} from "@/lib/content/verticals";
import { parseBlocks, renderInline } from "@/lib/content/render";
import { buildArticleJsonLd } from "@/lib/content/jsonld";
import { articleUrl, hubPath } from "@/lib/content/seo";

export const dynamic = "force-dynamic";

interface RouteParams {
  locale: string;
  vertical: string;
  slug: string;
}

async function loadPiece(p: RouteParams) {
  if (!isContentVertical(p.vertical)) return null;
  const [row] = await db
    .select()
    .from(schema.contentPieces)
    .where(
      and(
        eq(schema.contentPieces.slug, p.slug),
        eq(schema.contentPieces.locale, p.locale),
        eq(schema.contentPieces.vertical, p.vertical),
        eq(schema.contentPieces.status, "published"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const p = await params;
  const piece = await loadPiece(p);
  if (!piece) return { robots: { index: false, follow: false } };
  const url = articleUrl({
    locale: piece.locale,
    vertical: piece.vertical as ContentVertical,
    slug: piece.slug,
  });
  return {
    title: piece.seoTitle ?? piece.title,
    description: piece.seoDescription ?? piece.description ?? piece.excerpt ?? undefined,
    alternates: { canonical: piece.canonicalUrl ?? url },
    robots: { index: true, follow: true },
    openGraph: {
      title: piece.seoTitle ?? piece.title,
      description: piece.seoDescription ?? piece.excerpt ?? undefined,
      url,
      type: "article",
      images: piece.ogImageUrl ? [piece.ogImageUrl] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: piece.seoTitle ?? piece.title,
      description: piece.seoDescription ?? piece.excerpt ?? undefined,
    },
  };
}

export default async function ArticlePage({ params }: { params: Promise<RouteParams> }) {
  const p = await params;
  setRequestLocale(p.locale);
  const piece = await loadPiece(p);
  if (!piece) notFound();

  const vertical = piece.vertical as ContentVertical;
  const profile = verticalProfile(vertical);
  const hero = heroProductFor(vertical);

  const blocks = parseBlocks(piece.bodyMdx);
  const jsonLd = piece.jsonLd ?? buildArticleJsonLd(piece);

  const related = await db
    .select({
      id: schema.contentPieces.id,
      title: schema.contentPieces.title,
      slug: schema.contentPieces.slug,
      vertical: schema.contentPieces.vertical,
      locale: schema.contentPieces.locale,
      excerpt: schema.contentPieces.excerpt,
    })
    .from(schema.contentPieces)
    .where(
      and(
        eq(schema.contentPieces.status, "published"),
        eq(schema.contentPieces.locale, piece.locale),
        eq(schema.contentPieces.vertical, vertical),
        ne(schema.contentPieces.id, piece.id),
      ),
    )
    .orderBy(desc(schema.contentPieces.publishedAt))
    .limit(4);

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav className="text-xs text-neutral-500 mb-4 flex gap-1">
        <Link href={hubPath({ locale: piece.locale, vertical })} className="hover:underline">{profile.label}</Link>
        <span>/</span>
        <span className="truncate">{piece.title}</span>
      </nav>
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{piece.title}</h1>
      {piece.excerpt && (
        <p className="mt-3 text-lg text-neutral-600 dark:text-neutral-400">{piece.excerpt}</p>
      )}
      <div className="mt-8 space-y-5 leading-relaxed text-[15px]">
        {blocks.map((b, i) => {
          const key = `b-${i}`;
          switch (b.kind) {
            case "h1":
              return <h2 key={key} className="text-2xl font-semibold mt-10 mb-3">{renderInline(b.text!, key)}</h2>;
            case "h2":
              return <h2 key={key} className="text-2xl font-semibold mt-10 mb-3">{renderInline(b.text!, key)}</h2>;
            case "h3":
              return <h3 key={key} className="text-lg font-semibold mt-6 mb-2">{renderInline(b.text!, key)}</h3>;
            case "ul":
              return (
                <ul key={key} className="list-disc pl-6 space-y-1">
                  {b.items!.map((item, j) => (
                    <li key={j}>{renderInline(item, `${key}-${j}`)}</li>
                  ))}
                </ul>
              );
            default:
              return <p key={key}>{renderInline(b.text ?? "", key)}</p>;
          }
        })}
      </div>

      {hero && (
        <aside className="mt-12 rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 bg-neutral-50 dark:bg-neutral-900">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Featured product</div>
          <div className="font-semibold mt-1">{hero.name}</div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{hero.positioning.slice(0, 4).join(" · ")}</p>
          <Link
            href={`${hubPath({ locale: piece.locale, vertical })}#request-sample`}
            className="inline-block mt-3 rounded bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm"
          >
            Request a sample
          </Link>
        </aside>
      )}

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold mb-3">More from {profile.label}</h2>
          <ul className="grid sm:grid-cols-2 gap-3">
            {related.map((r) => (
              <li key={r.id} className="rounded border border-neutral-200 dark:border-neutral-800 p-3">
                <Link href={`/blog/${r.vertical}/${r.slug}`} className="font-medium hover:underline">{r.title}</Link>
                {r.excerpt && <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{r.excerpt}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

export async function generateStaticParams() {
  return CONTENT_VERTICALS.map((v) => ({ vertical: v }));
}
