import { notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { setRequestLocale } from "next-intl/server";
import { db, schema } from "@/lib/db";
import {
  CONTENT_VERTICALS,
  verticalProfile,
  isContentVertical,
} from "@/lib/content/verticals";

export const dynamic = "force-dynamic";

interface RouteParams {
  locale: string;
  vertical: string;
}

export async function generateStaticParams() {
  return CONTENT_VERTICALS.map((v) => ({ vertical: v }));
}

export default async function BlogVerticalPage({ params }: { params: Promise<RouteParams> }) {
  const { locale, vertical } = await params;
  setRequestLocale(locale);
  if (!isContentVertical(vertical)) notFound();
  const profile = verticalProfile(vertical);

  const articles = await db
    .select({
      id: schema.contentPieces.id,
      title: schema.contentPieces.title,
      slug: schema.contentPieces.slug,
      vertical: schema.contentPieces.vertical,
      excerpt: schema.contentPieces.excerpt,
      publishedAt: schema.contentPieces.publishedAt,
    })
    .from(schema.contentPieces)
    .where(
      and(
        eq(schema.contentPieces.status, "published"),
        eq(schema.contentPieces.locale, locale),
        eq(schema.contentPieces.vertical, vertical),
      ),
    )
    .orderBy(desc(schema.contentPieces.publishedAt))
    .limit(100);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <div>
        <Link href={`/industries/${vertical}`} className="text-xs text-neutral-500 hover:underline">{profile.label}</Link>
        <h1 className="text-3xl font-bold mt-1">Blog · {profile.shortLabel}</h1>
      </div>
      {articles.length === 0 ? (
        <p className="text-sm text-neutral-500">No articles published yet.</p>
      ) : (
        <ul className="space-y-4">
          {articles.map((a) => (
            <li key={a.id} className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
              <Link href={`/blog/${a.vertical}/${a.slug}`} className="text-lg font-semibold hover:underline">{a.title}</Link>
              {a.excerpt && <p className="text-sm text-neutral-500 mt-1">{a.excerpt}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
