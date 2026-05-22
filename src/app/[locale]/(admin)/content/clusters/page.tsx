import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { setRequestLocale, getTranslations, getFormatter } from "next-intl/server";
import { db, schema } from "@/lib/db";
import ClusterRow from "../_components/ClusterRow";

export const dynamic = "force-dynamic";

interface ClusterListRow {
  id: string;
  vertical: string;
  seedTerm: string;
  name: string;
  intent: string;
  termCount: number;
  briefCount: number;
  createdAt: Date;
}

async function fetchClusters(): Promise<ClusterListRow[]> {
  try {
    return await db
      .select({
        id: schema.keywordClusters.id,
        vertical: schema.keywordClusters.vertical,
        seedTerm: schema.keywordClusters.seedTerm,
        name: schema.keywordClusters.name,
        intent: schema.keywordClusters.intent,
        termCount: sql<number>`coalesce(jsonb_array_length(${schema.keywordClusters.terms}), 0)::int`,
        briefCount: sql<number>`count(${schema.contentBriefs.id})::int`,
        createdAt: schema.keywordClusters.createdAt,
      })
      .from(schema.keywordClusters)
      .leftJoin(schema.contentBriefs, eq(schema.contentBriefs.clusterId, schema.keywordClusters.id))
      .groupBy(schema.keywordClusters.id)
      .orderBy(desc(schema.keywordClusters.createdAt));
  } catch (err) {
    if (/relation .* does not exist|keyword_clusters/i.test((err as Error).message)) return [];
    throw err;
  }
}

export default async function ClustersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("content");
  const format = await getFormatter();

  const clusters = await fetchClusters();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/content" className="text-xs text-neutral-500 hover:underline">← {t("backToList")}</Link>
        <h1 className="text-2xl font-semibold mt-2">{t("clusters.title")}</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1 max-w-2xl">{t("clusters.description")}</p>
      </div>

      {clusters.length === 0 ? (
        <p className="text-sm text-neutral-500">{t("clusters.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="text-left px-3 py-2">{t("clusters.columns.name")}</th>
                <th className="text-left px-3 py-2">{t("clusters.columns.vertical")}</th>
                <th className="text-left px-3 py-2">{t("clusters.columns.intent")}</th>
                <th className="text-right px-3 py-2">{t("clusters.columns.terms")}</th>
                <th className="text-right px-3 py-2">{t("clusters.columns.briefs")}</th>
                <th className="text-left px-3 py-2">{t("clusters.columns.created")}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {clusters.map((c) => (
                <ClusterRow
                  key={c.id}
                  cluster={c}
                  createdLabel={format.dateTime(c.createdAt, { dateStyle: "short" })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
