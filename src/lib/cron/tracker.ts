import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export const CRON_JOBS = [
  "outbound",
  "reply-poll",
  "content-publish",
  "usage-snapshot",
  "buyside-rfq",
] as const;

export type CronJob = (typeof CRON_JOBS)[number];

type TriggerKind = (typeof schema.cronRunTriggerEnum.enumValues)[number];

export function inferTrigger(request: Request): TriggerKind {
  const { searchParams } = new URL(request.url);
  const trigger = searchParams.get("trigger");
  if (trigger === "manual" || trigger === "retry") return trigger;
  return "scheduled";
}

export async function trackCronRun<T extends Record<string, unknown>>(
  job: CronJob,
  triggeredBy: TriggerKind,
  fn: () => Promise<T>,
): Promise<T> {
  const [row] = await db
    .insert(schema.cronRuns)
    .values({ job, triggeredBy, status: "running" })
    .returning({ id: schema.cronRuns.id });

  const startedMs = Date.now();
  try {
    const summary = await fn();
    await db
      .update(schema.cronRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        durationMs: Date.now() - startedMs,
        result: summary,
      })
      .where(eq(schema.cronRuns.id, row.id));
    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.cronRuns)
      .set({
        status: "error",
        finishedAt: new Date(),
        durationMs: Date.now() - startedMs,
        error: message,
      })
      .where(eq(schema.cronRuns.id, row.id));
    throw err;
  }
}
