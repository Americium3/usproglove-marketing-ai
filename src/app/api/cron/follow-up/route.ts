import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { runFollowUpStep } from "@/lib/workflow/follow-up";
import { trackCronRun, inferTrigger } from "@/lib/cron/tracker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await trackCronRun("follow-up", inferTrigger(request), async () => {
    // Same scope as outbound: active, non-supplier campaigns. Buy-side follow-ups
    // run from the dedicated buyside-rfq flow.
    const active = await db
      .select()
      .from(schema.campaigns)
      .where(and(eq(schema.campaigns.status, "active"), ne(schema.campaigns.vertical, "supplier")));

    const runs: Array<{ campaignId: string; followUp1?: number; followUp2?: number; error?: string }> = [];
    let sentTotal = 0;
    let errored = 0;
    for (const campaign of active) {
      try {
        const r = await runFollowUpStep({
          campaignId: campaign.id,
          vertical: campaign.vertical,
          dailyCap: campaign.dailyCap,
          senderEmail: campaign.senderEmail,
          senderName: campaign.senderName,
          replyToEmail: campaign.replyToEmail,
        });
        runs.push({ campaignId: campaign.id, followUp1: r.followUp1Sent, followUp2: r.followUp2Sent });
        sentTotal += r.followUp1Sent + r.followUp2Sent;
      } catch (err) {
        runs.push({ campaignId: campaign.id, error: (err as Error).message });
        errored += 1;
      }
    }
    return { campaignsProcessed: active.length, sentTotal, errored, runs };
  });

  return NextResponse.json({ ok: true, ...summary });
}
