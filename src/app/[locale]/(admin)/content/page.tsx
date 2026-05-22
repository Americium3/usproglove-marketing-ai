import Link from "next/link";
import { desc } from "drizzle-orm";
import { setRequestLocale, getTranslations, getFormatter } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { CONTENT_VERTICALS, verticalProfile } from "@/lib/content/verticals";
import { inboundCounts, orphans } from "@/lib/content/audit";
import ClusterGenerator from "./_components/ClusterGenerator";

export const dynamic = "force-dynamic";

interface PieceRow {
  id: string;
  title: string;
  slug: string;
  vertical: string;
  locale: string;
  status: string;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  wordCount: number;
  internalLinkCount: number;
  updatedAt: Date;
}

async function fetchPieces(): Promise<PieceRow[]> {
  try {
    return await db
      .select({
        id: schema.contentPieces.id,
        title: schema.contentPieces.title,
        slug: schema.contentPieces.slug,
        vertical: schema.contentPieces.vertical,
        locale: schema.contentPieces.locale,
        status: schema.contentPieces.status,
        scheduledAt: schema.contentPieces.scheduledAt,
        publishedAt: schema.contentPieces.publishedAt,
        wordCount: schema.contentPieces.wordCount,
        internalLinkCount: schema.contentPieces.internalLinkCount,
        updatedAt: schema.contentPieces.updatedAt,
      })
      .from(schema.contentPieces)
      .orderBy(desc(schema.contentPieces.updatedAt))
      .limit(200);
  } catch (err) {
    if (/relation .* does not exist|content_pieces|content_status/i.test((err as Error).message)) {
      return [];
    }
    throw err;
  }
}

async function fetchAudit() {
  try {
    const [inbound, orphanRows] = await Promise.all([inboundCounts(10), orphans()]);
    return { inbound, orphans: orphanRows };
  } catch {
    return { inbound: [], orphans: [] };
  }
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200",
  ready: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  scheduled: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  published: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  archived: "bg-neutral-200 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400",
};

export default async function ContentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("content");
  const format = await getFormatter();

  const [pieces, audit] = await Promise.all([fetchPieces(), fetchAudit()]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1 max-w-2xl">{t("description")}</p>
      </div>

      <div className="flex gap-2 flex-wrap text-sm">
        <Link href="/content/clusters" className="rounded border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-900">
          {t("nav.clusters")}
        </Link>
        <Link href="/content/new" className="rounded bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5">
          {t("nav.newPiece")}
        </Link>
      </div>

      <ClusterGenerator verticals={CONTENT_VERTICALS as unknown as string[]} />

      <section>
        <h2 className="text-base font-semibold mb-3">{t("list.title")}</h2>
        {pieces.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("list.empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="text-left px-3 py-2">{t("list.columns.title")}</th>
                  <th className="text-left px-3 py-2">{t("list.columns.status")}</th>
                  <th className="text-left px-3 py-2">{t("list.columns.vertical")}</th>
                  <th className="text-left px-3 py-2">{t("list.columns.locale")}</th>
                  <th className="text-right px-3 py-2">{t("list.columns.words")}</th>
                  <th className="text-right px-3 py-2">{t("list.columns.links")}</th>
                  <th className="text-left px-3 py-2">{t("list.columns.scheduled")}</th>
                  <th className="text-left px-3 py-2">{t("list.columns.updated")}</th>
                </tr>
              </thead>
              <tbody>
                {pieces.map((p) => (
                  <tr key={p.id} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="px-3 py-2">
                      <Link href={`/content/${p.id}`} className="font-medium hover:underline">
                        {p.title}
                      </Link>
                      <div className="text-xs text-neutral-500">/{p.slug}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wide ${STATUS_STYLES[p.status] ?? STATUS_STYLES.draft}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{p.vertical}</td>
                    <td className="px-3 py-2 text-xs">{p.locale}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.wordCount || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.internalLinkCount}</td>
                    <td className="px-3 py-2 text-xs text-neutral-500">
                      {p.scheduledAt ? format.dateTime(p.scheduledAt, { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-500">
                      {format.dateTime(p.updatedAt, { dateStyle: "short", timeStyle: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold mb-3">{t("audit.title")}</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">{t("audit.topInbound")}</div>
            {audit.inbound.length === 0 ? (
              <p className="text-sm text-neutral-500">{t("audit.empty")}</p>
            ) : (
              <ul className="text-sm space-y-1">
                {audit.inbound.map((row) => (
                  <li key={row.pieceId} className="flex justify-between gap-3">
                    <Link href={`/content/${row.pieceId}`} className="truncate hover:underline">{row.title}</Link>
                    <span className="tabular-nums text-neutral-500">{row.inbound}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">{t("audit.orphans")}</div>
            {audit.orphans.length === 0 ? (
              <p className="text-sm text-neutral-500">{t("audit.orphansClean")}</p>
            ) : (
              <ul className="text-sm space-y-1">
                {audit.orphans.map((row) => {
                  const profile = verticalProfile(row.vertical as never);
                  return (
                    <li key={row.pieceId}>
                      <Link href={`/content/${row.pieceId}`} className="hover:underline">{row.title}</Link>
                      <span className="text-xs text-neutral-500 ml-2">[{profile?.shortLabel ?? row.vertical}]</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
