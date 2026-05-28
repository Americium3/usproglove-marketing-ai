/**
 * Sell-side follow-up engine. Advances prospects who already got a first_touch
 * through follow_up_1 / follow_up_2 on a fixed cadence, with AI-drafted copy
 * that references the prior email.
 *
 * Mirrors buyside-rfq.ts's nextTouchFor cadence logic, but for AI-drafted
 * sell-side outreach (vertical != "supplier"). Dedup is structural: the next
 * touch is derived from the latest outbound kind, so a prospect can never be
 * sent the same stage twice. Stops on reply / bounce / suppression.
 */
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { trackedGenerateObject } from "@/lib/ai/track";
import { sendEmail } from "@/lib/email/brevo";
import { composeEmail, getSenderFromEnv, type SenderIdentity } from "@/lib/email/compose";

export type FollowUpTouch = "follow_up_1" | "follow_up_2";
type AnyTouch = "first_touch" | "follow_up_1" | "follow_up_2";

// Days after first_touch that each touch is due.
const CADENCE_DAYS: Record<AnyTouch, number> = { first_touch: 0, follow_up_1: 3, follow_up_2: 7 };

const STOP_STATUSES = new Set(["replied", "bounced", "suppressed", "unsubscribed"]);

const DraftSchema = z.object({
  subject: z.string().min(6).max(80),
  textBody: z.string().min(40).max(1200),
  htmlBody: z.string().min(40),
});

export interface FollowUpContext {
  campaignId: string;
  vertical: (typeof schema.campaigns.$inferSelect)["vertical"];
  dailyCap: number;
  senderEmail: string;
  senderName: string;
  replyToEmail: string;
  dryRun?: boolean;
}

export interface FollowUpResultItem {
  prospectId: string;
  email: string;
  touch: FollowUpTouch;
  status: "sent" | "skipped" | "failed" | "dry_run";
  reason?: string;
}

export interface FollowUpSummary {
  totalProspects: number;
  followUp1Sent: number;
  followUp2Sent: number;
  skippedStopped: number;
  skippedNotDue: number;
  skippedDone: number;
  failed: number;
  results: FollowUpResultItem[];
}

/** Decide the next due follow-up for a prospect, or "done"/null if no action. */
function nextTouchDue(
  last: { kind: AnyTouch; sentAt: Date },
  now: Date,
): FollowUpTouch | "done" | null {
  const order: AnyTouch[] = ["first_touch", "follow_up_1", "follow_up_2"];
  const idx = order.indexOf(last.kind);
  if (idx === -1 || idx === order.length - 1) return "done";
  const next = order[idx + 1] as FollowUpTouch;
  const dueAfter = new Date(
    last.sentAt.getTime() + (CADENCE_DAYS[next] - CADENCE_DAYS[last.kind]) * 24 * 60 * 60 * 1000,
  );
  return now >= dueAfter ? next : null;
}

export async function runFollowUpStep(ctx: FollowUpContext): Promise<FollowUpSummary> {
  const now = new Date();
  const summary: FollowUpSummary = {
    totalProspects: 0,
    followUp1Sent: 0,
    followUp2Sent: 0,
    skippedStopped: 0,
    skippedNotDue: 0,
    skippedDone: 0,
    failed: 0,
    results: [],
  };

  const prospects = await db
    .select({
      id: schema.prospects.id,
      email: schema.prospects.email,
      firstName: schema.prospects.firstName,
      lastName: schema.prospects.lastName,
      role: schema.prospects.role,
      status: schema.prospects.status,
      companyName: schema.companies.name,
    })
    .from(schema.prospects)
    .innerJoin(schema.companies, eq(schema.prospects.companyId, schema.companies.id))
    .where(eq(schema.companies.vertical, ctx.vertical));

  summary.totalProspects = prospects.length;
  if (prospects.length === 0) return summary;

  const ids = prospects.map((p) => p.id);
  const msgs = await db
    .select()
    .from(schema.messages)
    .where(and(inArray(schema.messages.prospectId, ids), eq(schema.messages.campaignId, ctx.campaignId)));

  const lastOutbound = new Map<string, { kind: AnyTouch; sentAt: Date }>();
  const firstTouchBody = new Map<string, { subject: string; bodyText: string }>();
  const hasInbound = new Set<string>();

  for (const m of msgs) {
    if (m.direction === "inbound") {
      hasInbound.add(m.prospectId);
      continue;
    }
    const k = m.kind;
    if (k !== "first_touch" && k !== "follow_up_1" && k !== "follow_up_2") continue;
    const sentAt = m.sentAt ?? m.createdAt;
    if (k === "first_touch") {
      firstTouchBody.set(m.prospectId, { subject: m.subject ?? "", bodyText: m.bodyText ?? "" });
    }
    const cur = lastOutbound.get(m.prospectId);
    if (!cur || sentAt > cur.sentAt) lastOutbound.set(m.prospectId, { kind: k as AnyTouch, sentAt });
  }

  const base = getSenderFromEnv();
  const sender: SenderIdentity = { ...base, name: ctx.senderName, email: ctx.senderEmail, replyTo: ctx.replyToEmail };

  let sentCount = 0;
  for (const p of prospects) {
    if (sentCount >= ctx.dailyCap) break;

    const last = lastOutbound.get(p.id);
    if (!last) continue; // never received first_touch — outbound engine's job, not ours

    if (STOP_STATUSES.has(p.status) || hasInbound.has(p.id)) {
      summary.skippedStopped += 1;
      continue;
    }

    const action = nextTouchDue(last, now);
    if (action === "done") {
      summary.skippedDone += 1;
      continue;
    }
    if (action === null) {
      summary.skippedNotDue += 1;
      continue;
    }

    const prior = firstTouchBody.get(p.id);
    let draftObj;
    try {
      const draft = await trackedGenerateObject({
        task: "draft",
        modelKey: "primary",
        schema: DraftSchema,
        prompt: followUpPrompt({
          touch: action,
          company: p.companyName,
          contactName: p.firstName,
          priorSubject: prior?.subject,
          priorBody: prior?.bodyText,
        }),
        campaignId: ctx.campaignId,
        prospectId: p.id,
        metadata: { touch: action },
      });
      draftObj = draft.object;
    } catch (err) {
      summary.failed += 1;
      summary.results.push({ prospectId: p.id, email: p.email, touch: action, status: "failed", reason: (err as Error).message });
      continue;
    }

    const composed = composeEmail({
      draft: draftObj,
      sender,
      recipient: { email: p.email, firstName: p.firstName, lastName: p.lastName },
    });

    if (ctx.dryRun) {
      summary.results.push({ prospectId: p.id, email: p.email, touch: action, status: "dry_run" });
      sentCount += 1;
      summary[action === "follow_up_1" ? "followUp1Sent" : "followUp2Sent"] += 1;
      continue;
    }

    try {
      const res = await sendEmail({
        to: { email: p.email, name: [p.firstName, p.lastName].filter(Boolean).join(" ") || undefined },
        from: { email: ctx.senderEmail, name: ctx.senderName },
        replyTo: { email: ctx.replyToEmail },
        subject: composed.subject,
        textContent: composed.textContent,
        htmlContent: composed.htmlContent,
        tags: [`campaign:${ctx.campaignId}`, `followup:${action}`],
      });
      await db.insert(schema.messages).values({
        prospectId: p.id,
        campaignId: ctx.campaignId,
        direction: "outbound",
        kind: action,
        subject: composed.subject,
        bodyText: composed.textContent,
        bodyHtml: composed.htmlContent,
        messageId: res.messageId,
        providerMessageId: res.providerMessageId,
        sentAt: new Date(),
      });
      summary.results.push({ prospectId: p.id, email: p.email, touch: action, status: "sent" });
      sentCount += 1;
      summary[action === "follow_up_1" ? "followUp1Sent" : "followUp2Sent"] += 1;
    } catch (err) {
      summary.failed += 1;
      summary.results.push({ prospectId: p.id, email: p.email, touch: action, status: "failed", reason: (err as Error).message });
    }
  }

  return summary;
}

export function followUpPrompt(a: {
  touch: FollowUpTouch;
  company: string;
  contactName?: string | null;
  priorSubject?: string;
  priorBody?: string;
}): string {
  const num = a.touch === "follow_up_1" ? 1 : 2;
  return `Write follow-up #${num} to a prospect who hasn't replied to a cold email about disposable nitrile gloves.

Company: ${a.company}
Contact: ${a.contactName ?? "there"}
Prior email subject: "${a.priorSubject ?? "(unknown)"}"
Prior email body:
${(a.priorBody ?? "").slice(0, 500)}

Rules:
- Shorter than the prior email (2-4 sentences).
- Lightly float the prior note back up — never guilt-trip ("circling back", not "you didn't reply").
- Take a fresh angle or add ONE concrete value point (free sample pack, importer pricing, a specific SKU benefit like 3.5 mil fully-textured).
- Single soft CTA: reply to get a free sample pack. Do NOT include URLs or calendar links.
- Subject under 55 chars — a "Re: ${a.priorSubject ?? a.company}" style reply-thread subject is fine.
- Plaintext + HTML variants. HTML semantic, only <b>/<a>. No "Dear", no "I hope this finds you well".${
    a.touch === "follow_up_2"
      ? "\n- This is the LAST follow-up — gently signal you'll close the loop if now isn't the right time."
      : ""
  }`;
}
