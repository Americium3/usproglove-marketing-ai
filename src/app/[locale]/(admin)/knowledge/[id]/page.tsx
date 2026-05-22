import { notFound } from "next/navigation";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { setRequestLocale, getTranslations, getFormatter } from "next-intl/server";
import { db, schema } from "@/lib/db";
import ReingestButton from "../_components/ReingestButton";
import DeleteSourceButton from "../_components/DeleteSourceButton";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function KnowledgeSourceDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!UUID_RE.test(id)) notFound();

  const t = await getTranslations("knowledge");
  const format = await getFormatter();

  const [source] = await db
    .select()
    .from(schema.knowledgeSources)
    .where(eq(schema.knowledgeSources.id, id))
    .limit(1);

  if (!source) notFound();

  const chunks = await db
    .select({
      id: schema.knowledgeChunks.id,
      ord: schema.knowledgeChunks.ord,
      text: schema.knowledgeChunks.text,
      createdAt: schema.knowledgeChunks.createdAt,
    })
    .from(schema.knowledgeChunks)
    .where(eq(schema.knowledgeChunks.sourceId, id))
    .orderBy(asc(schema.knowledgeChunks.ord));

  const canReingest = source.kind === "url" || chunks.length === 0 || source.rawContent.length >= 100;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/knowledge" className="text-sm text-neutral-500 hover:underline">
          ← {t("detail.back")}
        </Link>
        <h1 className="text-2xl font-semibold mt-1">{source.title}</h1>
      </div>

      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 bg-white dark:bg-neutral-950">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">{t("list.columns.kind")}</dt>
            <dd className="mt-0.5">{source.kind}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">{t("list.columns.vertical")}</dt>
            <dd className="mt-0.5">{source.vertical ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">{t("list.columns.category")}</dt>
            <dd className="mt-0.5">{source.category ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">{t("list.columns.chunks")}</dt>
            <dd className="mt-0.5 tabular-nums">{chunks.length}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">{t("list.columns.created")}</dt>
            <dd className="mt-0.5">
              {format.dateTime(source.createdAt, { dateStyle: "medium", timeStyle: "short" })}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">{t("detail.updated")}</dt>
            <dd className="mt-0.5">
              {format.dateTime(source.updatedAt, { dateStyle: "medium", timeStyle: "short" })}
            </dd>
          </div>
          {source.sourceUrl && (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-neutral-500">{t("fields.sourceUrl")}</dt>
              <dd className="mt-0.5 break-all">
                <a
                  href={source.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-neutral-700 dark:text-neutral-300 hover:underline"
                >
                  {source.sourceUrl}
                </a>
              </dd>
            </div>
          )}
          {source.createdBy && (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-neutral-500">{t("detail.createdBy")}</dt>
              <dd className="mt-0.5 text-neutral-600 dark:text-neutral-400">{source.createdBy}</dd>
            </div>
          )}
        </dl>

        <div className="mt-5 flex items-center gap-3 flex-wrap">
          {canReingest && (
            <ReingestButton sourceId={source.id} sourceKind={source.kind} hasSourceUrl={!!source.sourceUrl} />
          )}
          <DeleteSourceButton sourceId={source.id} title={source.title} />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-3">{t("detail.chunks")}</h2>
        {chunks.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("detail.noChunks")}</p>
        ) : (
          <ol className="space-y-3">
            {chunks.map((c) => (
              <li
                key={c.id}
                className="rounded border border-neutral-200 dark:border-neutral-800 p-3 bg-white dark:bg-neutral-950"
              >
                <div className="text-xs text-neutral-500 mb-1">#{c.ord + 1}</div>
                <div className="text-sm whitespace-pre-wrap font-mono leading-relaxed">{c.text}</div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
