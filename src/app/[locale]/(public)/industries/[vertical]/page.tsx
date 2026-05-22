import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { setRequestLocale } from "next-intl/server";
import { db, schema } from "@/lib/db";
import {
  CONTENT_VERTICALS,
  verticalProfile,
  heroProductFor,
  isContentVertical,
} from "@/lib/content/verticals";
import { buildHubJsonLd } from "@/lib/content/jsonld";
import { hubUrl } from "@/lib/content/seo";

export const dynamic = "force-dynamic";

interface RouteParams {
  locale: string;
  vertical: string;
}

export async function generateStaticParams() {
  return CONTENT_VERTICALS.map((v) => ({ vertical: v }));
}

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { locale, vertical } = await params;
  if (!isContentVertical(vertical)) return { robots: { index: false, follow: false } };
  const profile = verticalProfile(vertical);
  const url = hubUrl({ locale, vertical });
  return {
    title: `Nitrile gloves for ${profile.label}`,
    description: profile.tagline,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title: `Nitrile gloves for ${profile.label}`,
      description: profile.tagline,
      url,
      type: "website",
    },
  };
}

export default async function HubPage({ params }: { params: Promise<RouteParams> }) {
  const { locale, vertical } = await params;
  setRequestLocale(locale);
  if (!isContentVertical(vertical)) notFound();

  const profile = verticalProfile(vertical);
  const hero = heroProductFor(vertical);

  const articles = await db
    .select({
      id: schema.contentPieces.id,
      title: schema.contentPieces.title,
      slug: schema.contentPieces.slug,
      vertical: schema.contentPieces.vertical,
      locale: schema.contentPieces.locale,
      excerpt: schema.contentPieces.excerpt,
      description: schema.contentPieces.description,
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
    .limit(50);

  const jsonLd = buildHubJsonLd({ vertical, locale, articles });

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 space-y-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <section>
        <div className="text-xs uppercase tracking-wide text-neutral-500">USProGlove for</div>
        <h1 className="text-4xl font-bold tracking-tight mt-1">{profile.label}</h1>
        <p className="mt-3 text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl">{profile.tagline}</p>
      </section>

      {hero && (
        <section className="grid sm:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-6">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Recommended SKU</div>
            <div className="text-xl font-semibold mt-1">{hero.name}</div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {hero.positioning.slice(0, 6).map((p, i) => (
                <li key={i} className="text-neutral-700 dark:text-neutral-300">· {p}</li>
              ))}
            </ul>
            <div className="mt-3 text-xs text-neutral-500">
              Certifications: {hero.certifications.join(", ")}
            </div>
          </div>
          <aside id="request-sample" className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 bg-neutral-50 dark:bg-neutral-900">
            <div className="font-semibold">Request a sample or quote</div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
              Tell us your monthly volume and we&apos;ll send samples and an itemized quote within one business day.
            </p>
            <a href="mailto:sales@usproglove.com" className="inline-block mt-3 rounded bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm">
              Email sales@usproglove.com
            </a>
          </aside>
        </section>
      )}

      <section>
        <h2 className="text-xl font-semibold mb-4">Articles for {profile.shortLabel} buyers</h2>
        {articles.length === 0 ? (
          <p className="text-sm text-neutral-500">Articles are being prepared. Check back soon.</p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-4">
            {articles.map((a) => (
              <li key={a.id} className="rounded border border-neutral-200 dark:border-neutral-800 p-4">
                <Link href={`/blog/${a.vertical}/${a.slug}`} className="font-medium hover:underline">{a.title}</Link>
                {(a.excerpt || a.description) && (
                  <p className="text-sm text-neutral-500 mt-1 line-clamp-3">{a.excerpt ?? a.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
