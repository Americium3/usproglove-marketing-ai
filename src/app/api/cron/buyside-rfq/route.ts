import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { sendEmail } from "@/lib/email/brevo";
import { runBuysideRfq, type BuysideSummary } from "@/lib/workflow/buyside-rfq";
import { trackCronRun, inferTrigger } from "@/lib/cron/tracker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const REPORT_RECIPIENT = process.env.BUYSIDE_REPORT_TO ?? "jay.lin@usproglove.com";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dry") === "1";

  const summary = await trackCronRun("buyside-rfq", inferTrigger(request), async () => {
    const campaigns = await db
      .select()
      .from(schema.campaigns)
      .where(and(eq(schema.campaigns.vertical, "supplier"), eq(schema.campaigns.status, "active")));

    const runs: Array<{ campaignId: string; name: string; summary?: BuysideSummary; error?: string }> = [];
    for (const c of campaigns) {
      try {
        const result = await runBuysideRfq({
          campaignId: c.id,
          senderEmail: c.senderEmail,
          senderName: c.senderName,
          replyToEmail: c.replyToEmail,
          dailyCap: c.dailyCap,
          dryRun,
        });
        runs.push({ campaignId: c.id, name: c.name, summary: result });
      } catch (err) {
        runs.push({ campaignId: c.id, name: c.name, error: (err as Error).message });
      }
    }

    // Send the report unless this was a dry-run probe.
    if (!dryRun && runs.length > 0) {
      try {
        await sendReport(runs);
      } catch (err) {
        console.error("[buyside-rfq] report send failed", err);
      }
    }

    return {
      campaignsProcessed: campaigns.length,
      runs: runs.map((r) => ({
        campaignId: r.campaignId,
        name: r.name,
        error: r.error,
        firstTouchSent: r.summary?.firstTouchSent ?? 0,
        followUp1Sent: r.summary?.followUp1Sent ?? 0,
        followUp2Sent: r.summary?.followUp2Sent ?? 0,
        newReplies: r.summary?.newReplies ?? 0,
        failed: r.summary?.failed ?? 0,
        pipeline: r.summary?.pipeline,
      })),
    };
  });

  return NextResponse.json({ ok: true, dryRun, ...summary });
}

async function sendReport(
  runs: Array<{ campaignId: string; name: string; summary?: BuysideSummary; error?: string }>,
) {
  // Report comes from the same buy-side identity that the RFQs go from, so
  // replies to the report thread (e.g. ops notes from Jay) stay on usproglove.com.
  const fromEmail = process.env.BUYSIDE_SENDER_EMAIL ?? "jay.lin@usproglove.com";
  const fromName = process.env.BUYSIDE_SENDER_NAME ?? "Jay Lin";

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const lines: string[] = [];
  const htmlSections: string[] = [];
  let totalSent = 0;
  let totalReplies = 0;

  for (const r of runs) {
    if (r.error) {
      lines.push(`[ERROR] ${r.name}: ${r.error}`);
      htmlSections.push(`<p><b>${escapeHtml(r.name)}</b> — <span style="color:#b00">ERROR: ${escapeHtml(r.error)}</span></p>`);
      continue;
    }
    const s = r.summary!;
    const sent = s.firstTouchSent + s.followUp1Sent + s.followUp2Sent;
    totalSent += sent;
    totalReplies += s.newReplies;

    lines.push(`== ${r.name} ==`);
    lines.push(`Sent today: ${sent}  (first ${s.firstTouchSent} · FU1 ${s.followUp1Sent} · FU2 ${s.followUp2Sent})`);
    lines.push(`Replies in last 24h: ${s.newReplies}`);
    lines.push(`Failed sends: ${s.failed}`);
    lines.push(`Pipeline:`);
    lines.push(`  Awaiting first touch: ${s.pipeline.awaitingFirstTouch}`);
    lines.push(`  Awaiting follow-up #1: ${s.pipeline.awaitingFollowUp1}`);
    lines.push(`  Awaiting follow-up #2: ${s.pipeline.awaitingFollowUp2}`);
    lines.push(`  Sequence complete (3/3): ${s.pipeline.completed}`);
    lines.push(`  Replied: ${s.pipeline.replied}`);
    lines.push("");

    if (s.byTouch.length > 0) {
      lines.push("Activity:");
      for (const r2 of s.byTouch) {
        lines.push(`  [${r2.status}] ${r2.touch} → ${r2.supplierName} <${r2.email}>${r2.reason ? ` — ${r2.reason}` : ""}`);
      }
    }
    lines.push("");

    htmlSections.push(`
      <h3 style="margin:24px 0 8px;font:600 16px/1.3 system-ui">${escapeHtml(r.name)}</h3>
      <p style="margin:0 0 6px">Sent today: <b>${sent}</b> (first ${s.firstTouchSent} · FU1 ${s.followUp1Sent} · FU2 ${s.followUp2Sent}) — Replies last 24h: <b>${s.newReplies}</b> — Failed: ${s.failed}</p>
      <p style="margin:0 0 8px">Pipeline:
        first ${s.pipeline.awaitingFirstTouch} ·
        FU1 ${s.pipeline.awaitingFollowUp1} ·
        FU2 ${s.pipeline.awaitingFollowUp2} ·
        done ${s.pipeline.completed} ·
        replied ${s.pipeline.replied}
      </p>
      ${s.byTouch.length > 0 ? `<table style="border-collapse:collapse;font:13px/1.4 system-ui">
        <thead><tr style="background:#f4f4f5"><th style="text-align:left;padding:4px 8px">Action</th><th style="text-align:left;padding:4px 8px">Supplier</th><th style="text-align:left;padding:4px 8px">Email</th><th style="text-align:left;padding:4px 8px">Status</th></tr></thead>
        <tbody>${s.byTouch
          .map(
            (a) =>
              `<tr><td style="padding:4px 8px;border-top:1px solid #e4e4e7">${a.touch}</td><td style="padding:4px 8px;border-top:1px solid #e4e4e7">${escapeHtml(a.supplierName)}</td><td style="padding:4px 8px;border-top:1px solid #e4e4e7">${escapeHtml(a.email)}</td><td style="padding:4px 8px;border-top:1px solid #e4e4e7">${a.status}${a.reason ? ` <span style="color:#666">— ${escapeHtml(a.reason)}</span>` : ""}</td></tr>`,
          )
          .join("")}</tbody>
      </table>` : ""}
    `);
  }

  const subject = `Buyside RFQ — ${today}: ${totalSent} sent, ${totalReplies} new repl${totalReplies === 1 ? "y" : "ies"}`;
  const textBody = `US Pro Glove — Buyside RFQ daily report (${today})\n\n${lines.join("\n")}`;
  const htmlBody = `
    <div style="font:14px/1.5 system-ui,Segoe UI,Arial;color:#111">
      <h2 style="margin:0 0 4px">Buyside RFQ — daily report</h2>
      <p style="margin:0 0 16px;color:#666">${today}</p>
      <p style="margin:0 0 20px">Total: <b>${totalSent}</b> emails sent · <b>${totalReplies}</b> new replies</p>
      ${htmlSections.join("\n")}
    </div>
  `;

  await sendEmail({
    to: { email: REPORT_RECIPIENT },
    from: { email: fromEmail, name: fromName },
    replyTo: { email: fromEmail },
    subject,
    textContent: textBody,
    htmlContent: htmlBody,
    tags: ["buyside:report"],
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
