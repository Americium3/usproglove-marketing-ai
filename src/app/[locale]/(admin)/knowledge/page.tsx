import { desc, eq, sql } from "drizzle-orm";
import { setRequestLocale, getTranslations, getFormatter } from "next-intl/server";
import { db, schema } from "@/lib/db";
import KnowledgeForm from "./_components/KnowledgeForm";
import DeleteSourceButton from "./_components/DeleteSourceButton";

export const dynamic = "force-dynamic";

interface SourceRow {
  id: string;
  title: string;
  kind: string;
  vertical: string | null;
  category: string | null;
  sourceUrl: string | null;
  chunkCount: number;
  createdAt: Date;
}

async function fetchSources(): Promise<SourceRow[]> {
  try {
    return await db
      .select({
        id: schema.knowledgeSources.id,
        title: schema.knowledgeSources.title,
        kind: schema.knowledgeSources.kind,
        vertical: schema.knowledgeSources.vertical,
        category: schema.knowledgeSources.category,
        sourceUrl: schema.knowledgeSources.sourceUrl,
        createdAt: schema.knowledgeSources.createdAt,
        chunkCount: sql<number>`count(${schema.knowledgeChunks.id})::int`,
      })
      .from(schema.knowledgeSources)
      .leftJoin(
        schema.knowledgeChunks,
        eq(schema.knowledgeChunks.sourceId, schema.knowledgeSources.id),
      )
      .groupBy(schema.knowledgeSources.id)
      .orderBy(desc(schema.knowledgeSources.createdAt));
  } catch (err) {
    const msg = (err as Error).message || "";
    if (/relation .* does not exist|knowledge_sources/i.test(msg)) {
      return [];
    }
    throw err;
  }
}

export default async function KnowledgePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("knowledge");
  const format = await getFormatter();

  const { rows } = await fetchSources();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1 max-w-2xl">{t("description")}</p>
      </div>

      <KnowledgeForm
        verticals={schema.verticalEnum.enumValues}
        kinds={schema.knowledgeSourceKindEnum.enumValues}
      />

      <section>
        <h2 className="text-base font-semibold mb-3">{t("list.title")}</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("list.empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="text-left px-3 py-2">{t("list.columns.title")}</th>
                  <th className="text-left px-3 py-2">{t("list.columns.kind")}</th>
                  <th className="text-left px-3 py-2">{t("list.columns.vertical")}</th>
                  <th className="text-left px-3 py-2">{t("list.columns.category")}</th>
                  <th className="text-right px-3 py-2">{t("list.columns.chunks")}</th>
                  <th className="text-left px-3 py-2">{t("list.columns.created")}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.title}</div>
                      {r.sourceUrl && (
                        <a
                          href={r.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-neutral-500 hover:underline"
                        >
                          {r.sourceUrl}
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">{r.kind}</td>
                    <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">{r.vertical ?? "—"}</td>
                    <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">{r.category ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.chunkCount}</td>
                    <td className="px-3 py-2 text-neutral-500 text-xs">
                      {format.dateTime(r.createdAt, { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <DeleteSourceButton sourceId={r.id} title={r.title} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
