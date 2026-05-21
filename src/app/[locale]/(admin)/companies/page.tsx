import Link from "next/link";
import { desc, eq, sql, and, ilike, or } from "drizzle-orm";
import { setRequestLocale, getTranslations, getFormatter } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { StageBadge, type DealStage } from "./[id]/_components/StageSelector";

export const dynamic = "force-dynamic";

const STAGE_VALUES: DealStage[] = ["lead", "qualified", "opportunity", "customer", "closed_lost"];

export default async function CompaniesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ stage?: string; vertical?: string; q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const t = await getTranslations("crm.list");
  const tStage = await getTranslations("crm.stage");
  const format = await getFormatter();

  const stage = STAGE_VALUES.includes(sp.stage as DealStage) ? (sp.stage as DealStage) : null;
  const vertical = sp.vertical?.trim() || null;
  const q = sp.q?.trim() || null;

  const filters = [];
  if (stage) filters.push(eq(schema.companies.dealStage, stage));
  if (vertical) {
    filters.push(eq(schema.companies.vertical, vertical as typeof schema.companies.vertical.enumValues[number]));
  }
  if (q) {
    const like = `%${q}%`;
    filters.push(or(ilike(schema.companies.name, like), ilike(schema.companies.website, like))!);
  }

  const where = filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select({
      company: schema.companies,
      contactCount: sql<number>`(SELECT COUNT(*)::int FROM ${schema.prospects} WHERE ${schema.prospects.companyId} = ${schema.companies.id})`,
      openTasks: sql<number>`(SELECT COUNT(*)::int FROM ${schema.crmTasks} WHERE ${schema.crmTasks.companyId} = ${schema.companies.id} AND ${schema.crmTasks.status} = 'open')`,
    })
    .from(schema.companies)
    .where(where)
    .orderBy(desc(schema.companies.updatedAt))
    .limit(200);

  const stageCounts = await db
    .select({
      stage: schema.companies.dealStage,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(schema.companies)
    .groupBy(schema.companies.dealStage);

  const totalByStage = new Map(stageCounts.map((s) => [s.stage, s.count]));

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <form className="flex items-center gap-2" action="">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder={t("searchPlaceholder")}
            className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400"
          />
          {stage && <input type="hidden" name="stage" value={stage} />}
          {vertical && <input type="hidden" name="vertical" value={vertical} />}
          <button
            type="submit"
            className="rounded bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1.5 text-sm"
          >
            {t("search")}
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Link
          href={{ query: { ...(q ? { q } : {}), ...(vertical ? { vertical } : {}) } }}
          className={`rounded border px-2.5 py-1 text-xs ${
            !stage
              ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-neutral-900 dark:border-white"
              : "border-neutral-200 dark:border-neutral-800 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          }`}
        >
          {t("all")} ({stageCounts.reduce((acc, s) => acc + s.count, 0)})
        </Link>
        {STAGE_VALUES.map((s) => (
          <Link
            key={s}
            href={{ query: { stage: s, ...(q ? { q } : {}), ...(vertical ? { vertical } : {}) } }}
            className={`rounded border px-2.5 py-1 text-xs ${
              stage === s
                ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-neutral-900 dark:border-white"
                : "border-neutral-200 dark:border-neutral-800 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
            }`}
          >
            {tStage(s)} ({totalByStage.get(s) ?? 0})
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-12 text-center text-sm text-neutral-500">
          {t("empty")}
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="text-left font-medium px-4 py-2">{t("colName")}</th>
                <th className="text-left font-medium px-4 py-2 hidden sm:table-cell">{t("colVertical")}</th>
                <th className="text-left font-medium px-4 py-2">{t("colStage")}</th>
                <th className="text-left font-medium px-4 py-2 hidden md:table-cell">{t("colLocation")}</th>
                <th className="text-right font-medium px-4 py-2">{t("colContacts")}</th>
                <th className="text-right font-medium px-4 py-2 hidden md:table-cell">{t("colTasks")}</th>
                <th className="text-right font-medium px-4 py-2 hidden lg:table-cell">{t("colUpdated")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {rows.map(({ company, contactCount, openTasks }) => (
                <tr key={company.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900">
                  <td className="px-4 py-3">
                    <Link href={`/companies/${company.id}`} className="font-medium hover:underline">
                      {company.name}
                    </Link>
                    {company.website && (
                      <div className="text-xs text-neutral-500 truncate max-w-[280px]">
                        {company.website.replace(/^https?:\/\//, "")}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-xs text-neutral-500">
                    {company.vertical}
                  </td>
                  <td className="px-4 py-3">
                    <StageBadge stage={company.dealStage as DealStage} />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-xs text-neutral-500">
                    {[company.city, company.region].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">{contactCount}</td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    {openTasks > 0 ? (
                      <span className="rounded bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.5 text-xs">
                        {openTasks}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell text-xs text-neutral-500">
                    {format.relativeTime(company.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
