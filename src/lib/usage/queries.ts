import { sql, and, gte, eq, desc, isNotNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export interface TodayTokenUsage {
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
}

export async function getTodayTokenUsage(): Promise<TodayTokenUsage> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const res = await db
    .select({
      callCount: sql<string>`COUNT(*)::text`,
      inputTokens: sql<string>`COALESCE(SUM(${schema.aiUsage.inputTokens}), 0)::text`,
      outputTokens: sql<string>`COALESCE(SUM(${schema.aiUsage.outputTokens}), 0)::text`,
      cachedTokens: sql<string>`COALESCE(SUM(${schema.aiUsage.cachedTokens}), 0)::text`,
      costUsd: sql<string>`COALESCE(SUM(${schema.aiUsage.costUsd}), 0)::text`,
    })
    .from(schema.aiUsage)
    .where(gte(schema.aiUsage.createdAt, startOfDay));

  const row = res[0];
  return {
    callCount: Number(row?.callCount ?? 0),
    inputTokens: Number(row?.inputTokens ?? 0),
    outputTokens: Number(row?.outputTokens ?? 0),
    cachedTokens: Number(row?.cachedTokens ?? 0),
    costUsd: Number(row?.costUsd ?? 0),
  };
}

export interface LatestSnapshot {
  kind: (typeof schema.usageSnapshotKindEnum.enumValues)[number];
  scope: string | null;
  value: number;
  unit: string;
  createdAt: Date;
}

export async function getLatestSnapshotsByKind(): Promise<Record<string, LatestSnapshot>> {
  const rows = await db.execute<{
    kind: LatestSnapshot["kind"];
    scope: string | null;
    value: string;
    unit: string;
    created_at: Date;
  }>(sql`
    SELECT DISTINCT ON (kind, scope) kind, scope, value::text, unit, created_at
    FROM usage_snapshots
    ORDER BY kind, scope, created_at DESC
  `);

  const result: Record<string, LatestSnapshot> = {};
  for (const row of rows.rows ?? []) {
    const key = row.scope ? `${row.kind}:${row.scope}` : row.kind;
    result[key] = {
      kind: row.kind,
      scope: row.scope,
      value: Number(row.value),
      unit: row.unit,
      createdAt: new Date(row.created_at),
    };
  }
  return result;
}

export async function getActiveCampaignCount(): Promise<number> {
  const res = await db
    .select({ count: sql<string>`COUNT(*)::text` })
    .from(schema.campaigns)
    .where(eq(schema.campaigns.status, "active"));
  return Number(res[0]?.count ?? 0);
}

export async function getTodaySentCount(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const res = await db
    .select({ count: sql<string>`COUNT(*)::text` })
    .from(schema.messages)
    .where(and(eq(schema.messages.direction, "outbound"), gte(schema.messages.sentAt, startOfDay)));
  return Number(res[0]?.count ?? 0);
}

export async function getTodayReplyCount(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const res = await db
    .select({ count: sql<string>`COUNT(*)::text` })
    .from(schema.messages)
    .where(and(eq(schema.messages.direction, "inbound"), gte(schema.messages.receivedAt, startOfDay)));
  return Number(res[0]?.count ?? 0);
}

export interface OutboundFunnel {
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
}

/**
 * All-time outbound funnel. Counts unique outbound messages with the relevant
 * timestamp set; opens/clicks/bounces are populated by the Brevo webhook,
 * replies by inbound matching via in_reply_to.
 */
export async function getOutboundFunnel(opts?: { sinceDays?: number }): Promise<OutboundFunnel> {
  const since = opts?.sinceDays
    ? new Date(Date.now() - opts.sinceDays * 86400_000)
    : null;

  const baseWhere = and(
    eq(schema.messages.direction, "outbound"),
    isNotNull(schema.messages.sentAt),
    since ? gte(schema.messages.sentAt, since) : undefined,
  );

  const [counts] = await db
    .select({
      sent: sql<string>`COUNT(*)::text`,
      opened: sql<string>`COUNT(${schema.messages.openedAt})::text`,
      clicked: sql<string>`COUNT(${schema.messages.clickedAt})::text`,
      bounced: sql<string>`COUNT(${schema.messages.bouncedAt})::text`,
    })
    .from(schema.messages)
    .where(baseWhere);

  const repliedWhere = and(
    eq(schema.messages.direction, "inbound"),
    isNotNull(schema.messages.inReplyTo),
    since ? gte(schema.messages.receivedAt, since) : undefined,
  );

  const [repliedRow] = await db
    .select({
      replied: sql<string>`COUNT(DISTINCT ${schema.messages.inReplyTo})::text`,
    })
    .from(schema.messages)
    .where(repliedWhere);

  return {
    sent: Number(counts?.sent ?? 0),
    opened: Number(counts?.opened ?? 0),
    clicked: Number(counts?.clicked ?? 0),
    bounced: Number(counts?.bounced ?? 0),
    replied: Number(repliedRow?.replied ?? 0),
  };
}

export async function getRecentAiCalls(limit = 10) {
  return db
    .select()
    .from(schema.aiUsage)
    .orderBy(desc(schema.aiUsage.createdAt))
    .limit(limit);
}

export interface CronRunRow {
  id: string;
  job: string;
  status: (typeof schema.cronRunStatusEnum.enumValues)[number];
  triggeredBy: (typeof schema.cronRunTriggerEnum.enumValues)[number];
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

export async function getLatestCronRunPerJob(): Promise<Record<string, CronRunRow>> {
  const rows = await db.execute<{
    id: string;
    job: string;
    status: CronRunRow["status"];
    triggered_by: CronRunRow["triggeredBy"];
    started_at: Date;
    finished_at: Date | null;
    duration_ms: number | null;
    result: Record<string, unknown> | null;
    error: string | null;
  }>(sql`
    SELECT DISTINCT ON (job) id, job, status, triggered_by, started_at, finished_at, duration_ms, result, error
    FROM cron_runs
    ORDER BY job, started_at DESC
  `);

  const result: Record<string, CronRunRow> = {};
  for (const row of rows.rows ?? []) {
    result[row.job] = {
      id: row.id,
      job: row.job,
      status: row.status,
      triggeredBy: row.triggered_by,
      startedAt: new Date(row.started_at),
      finishedAt: row.finished_at ? new Date(row.finished_at) : null,
      durationMs: row.duration_ms,
      result: row.result,
      error: row.error,
    };
  }
  return result;
}

export async function getCronRunHistory(opts?: { job?: string; limit?: number }): Promise<CronRunRow[]> {
  const limit = opts?.limit ?? 100;
  const q = db
    .select()
    .from(schema.cronRuns)
    .orderBy(desc(schema.cronRuns.startedAt))
    .limit(limit);
  const rows = opts?.job
    ? await db
        .select()
        .from(schema.cronRuns)
        .where(eq(schema.cronRuns.job, opts.job))
        .orderBy(desc(schema.cronRuns.startedAt))
        .limit(limit)
    : await q;
  return rows.map((r) => ({
    id: r.id,
    job: r.job,
    status: r.status,
    triggeredBy: r.triggeredBy,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    durationMs: r.durationMs,
    result: r.result,
    error: r.error,
  }));
}
