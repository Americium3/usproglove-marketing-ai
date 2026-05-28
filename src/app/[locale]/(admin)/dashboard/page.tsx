import Link from "next/link";
import { setRequestLocale, getTranslations, getFormatter } from "next-intl/server";
import { DashboardChatInput } from "../_components/DashboardChatInput";
import {
  getTodayTokenUsage,
  getTodaySentCount,
  getTodayReplyCount,
  getActiveCampaignCount,
  getLatestSnapshotsByKind,
  getLatestCronRunPerJob,
  getOutboundFunnel,
  type LatestSnapshot,
} from "@/lib/usage/queries";
import { CRON_JOBS } from "@/lib/cron/tracker";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(2)} ${units[i]}`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");
  const format = await getFormatter();

  const [tokens, sentToday, repliesToday, activeCampaigns, snapshots, latestCronRuns, funnel30d] = await Promise.all([
    getTodayTokenUsage().catch(() => null),
    getTodaySentCount().catch(() => 0),
    getTodayReplyCount().catch(() => 0),
    getActiveCampaignCount().catch(() => 0),
    getLatestSnapshotsByKind().catch(() => ({} as Record<string, LatestSnapshot>)),
    getLatestCronRunPerJob().catch(() => ({}) as Record<string, import("@/lib/usage/queries").CronRunRow>),
    getOutboundFunnel({ sinceDays: 30 }).catch(() => ({ sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 })),
  ]);

  const pct = (num: number, denom: number): string =>
    denom > 0 ? `${((num / denom) * 100).toFixed(1)}%` : "—";

  const dbSize = snapshots["db_total_size_bytes"]?.value ?? 0;
  const brevoDaily =
    snapshots["brevo_daily_remaining:free"] ??
    snapshots["brevo_daily_remaining:sms"] ??
    Object.values(snapshots).find((s) => s.kind === "brevo_daily_remaining");
  const brevoCredits = Object.values(snapshots).find(
    (s) => s.kind === "brevo_credits_remaining" && s.value > 0,
  );
  const hunterSearches = snapshots["hunter_searches_remaining"];
  const hunterVerifications = snapshots["hunter_verifications_remaining"];
  const snovCredits = snapshots["snov_credits_remaining"];

  const campaignStats = [
    { label: t("todaySent"), value: String(sentToday) },
    { label: t("todayReplies"), value: String(repliesToday) },
    { label: t("activeCampaigns"), value: String(activeCampaigns) },
    { label: t("replyRate"), value: pct(funnel30d.replied, funnel30d.sent), sub: "30d window" },
  ];

  const funnelStats = [
    { label: t("funnelSent"), value: String(funnel30d.sent) },
    {
      label: t("funnelOpened"),
      value: String(funnel30d.opened),
      sub: pct(funnel30d.opened, funnel30d.sent),
    },
    {
      label: t("funnelClicked"),
      value: String(funnel30d.clicked),
      sub: pct(funnel30d.clicked, funnel30d.sent),
    },
    {
      label: t("funnelReplied"),
      value: String(funnel30d.replied),
      sub: pct(funnel30d.replied, funnel30d.sent),
    },
    {
      label: t("funnelBounced"),
      value: String(funnel30d.bounced),
      sub: pct(funnel30d.bounced, funnel30d.sent),
    },
  ];

  const usageStats = [
    {
      label: t("tokensToday"),
      value: tokens ? format.number(tokens.inputTokens + tokens.outputTokens) : "—",
      sub: tokens ? `in ${format.number(tokens.inputTokens)} · out ${format.number(tokens.outputTokens)}` : undefined,
    },
    { label: t("aiCostToday"), value: tokens ? formatUsd(tokens.costUsd) : "—" },
    { label: t("aiCallsToday"), value: tokens ? String(tokens.callCount) : "—" },
    { label: t("dbSize"), value: formatBytes(dbSize) },
  ];

  const quotaStats = [
    {
      label: t("emailQuota"),
      value: brevoDaily ? format.number(brevoDaily.value) : "—",
      sub: t("emailQuotaSub"),
    },
    {
      label: t("emailCredits"),
      value: brevoCredits ? format.number(brevoCredits.value) : "—",
      sub: t("emailCreditsSub"),
    },
    {
      label: t("discoveryQuota"),
      value: hunterSearches ? format.number(hunterSearches.value) : "—",
      sub: t("discoveryQuotaSub"),
    },
    {
      label: t("verificationQuota"),
      value: hunterVerifications ? format.number(hunterVerifications.value) : "—",
      sub: t("verificationQuotaSub"),
    },
    {
      label: t("enrichmentCredits"),
      value: snovCredits ? format.number(snovCredits.value) : "—",
      sub: t("enrichmentCreditsSub"),
    },
  ];

  return (
    <div className="space-y-10">
      <DashboardChatInput />

      <section>
        <h1 className="text-2xl font-semibold mb-6">{t("title")}</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {campaignStats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} sub={"sub" in s ? s.sub : undefined} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">{t("funnelTitle")}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {funnelStats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} sub={"sub" in s ? s.sub : undefined} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">{t("usageTitle")}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {usageStats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">{t("quotaTitle")}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {quotaStats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-semibold">{t("cronTitle")}</h2>
          <Link href="/cron" className="text-xs text-neutral-500 hover:underline">
            {t("cronViewAll")} →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CRON_JOBS.map((job) => {
            const run = latestCronRuns[job];
            return <CronCard key={job} job={job} run={run} t={t} format={format} />;
          })}
        </div>
      </section>
    </div>
  );
}

function CronCard({
  job,
  run,
  t,
  format,
}: {
  job: string;
  run: import("@/lib/usage/queries").CronRunRow | undefined;
  t: Awaited<ReturnType<typeof getTranslations>>;
  format: Awaited<ReturnType<typeof getFormatter>>;
}) {
  const statusClass = run
    ? run.status === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : run.status === "error"
      ? "text-red-600 dark:text-red-400"
      : "text-amber-600 dark:text-amber-400"
    : "text-neutral-500";

  const name = safeTranslate(t, `cronJobs.${job}.name`, job);
  const description = safeTranslate(t, `cronJobs.${job}.description`);
  const schedule = safeTranslate(t, `cronJobs.${job}.schedule`);

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 flex flex-col h-full">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-medium">{name}</div>
        {run && (
          <div className={`text-xs font-medium ${statusClass}`}>
            {t(`cronStatus.${run.status}`)}
          </div>
        )}
      </div>
      {description && (
        <div className="mt-1.5 text-xs text-neutral-500 leading-snug">{description}</div>
      )}
      {schedule && (
        <div className="mt-2 text-xs uppercase tracking-wide text-neutral-400">{schedule}</div>
      )}
      <div className="mt-auto pt-3">
        {run ? (
          <>
            <div className="text-sm">{format.relativeTime(run.startedAt, new Date())}</div>
            <div className="mt-1 text-xs text-neutral-500 tabular-nums">
              {run.durationMs != null ? `${run.durationMs}ms` : "—"}
              {run.error ? ` · ${run.error.slice(0, 48)}` : ""}
            </div>
          </>
        ) : (
          <div className="text-sm text-neutral-500">{t("cronNever")}</div>
        )}
      </div>
    </div>
  );
}

function safeTranslate(
  t: Awaited<ReturnType<typeof getTranslations>>,
  key: string,
  fallback = "",
): string {
  try {
    const value = t(key as Parameters<typeof t>[0]);
    return value === key ? fallback : value;
  } catch {
    return fallback;
  }
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-neutral-500 tabular-nums">{sub}</div>}
    </div>
  );
}
