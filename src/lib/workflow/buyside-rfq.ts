/**
 * Buy-side RFQ runner — sends initial nitrile-glove RFQ + follow-ups to
 * supplier contacts on a fixed cadence. Reuses the existing prospects/messages
 * schema (with vertical="supplier") so reply detection rides on the same
 * reply-poller as the sell-side flow.
 *
 * Design constraints:
 * - Templates are static (content/buyside/rfq.ts) — no AI drafting.
 * - One touch per prospect per cron run, max.
 * - We stop touching a prospect once they reply, bounce, or hit the final follow-up.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { sendEmail } from "@/lib/email/brevo";
import { renderRfqTouch, TOUCH_CADENCE_DAYS, type TouchKind } from "@/../content/buyside/rfq";

export interface BuysideContext {
  campaignId: string;
  senderEmail: string;
  senderName: string;
  replyToEmail: string;
  dailyCap: number;
  dryRun?: boolean;
}

export interface BuysideResultItem {
  prospectId: string;
  email: string;
  supplierName: string;
  touch: TouchKind;
  status: "sent" | "skipped" | "failed" | "dry_run";
  reason?: string;
  messageId?: string;
}

export interface BuysideSummary {
  totalProspects: number;
  firstTouchSent: number;
  followUp1Sent: number;
  followUp2Sent: number;
  skippedNotDue: number;
  skippedReplied: number;
  skippedDone: number;
  skippedBlocked: number;
  failed: number;
  newReplies: number;
  pipeline: {
    awaitingFirstTouch: number;
    awaitingFollowUp1: number;
    awaitingFollowUp2: number;
    completed: number;
    replied: number;
  };
  byTouch: BuysideResultItem[];
}

/**
 * Decide which touch (if any) is due for a prospect today.
 * Returns the next touch kind, or null if no action is due.
 */
function nextTouchFor(
  lastOutbound: { kind: TouchKind; sentAt: Date } | null,
  now: Date,
): TouchKind | "done" | null {
  if (!lastOutbound) return "first_touch";

  const order: TouchKind[] = ["first_touch", "follow_up_1", "follow_up_2"];
  const idx = order.indexOf(lastOutbound.kind);
  if (idx === -1 || idx === order.length - 1) return "done"; // already sent the final touch
  const nextKind = order[idx + 1];
  const dueAfter = new Date(
    lastOutbound.sentAt.getTime() +
      (TOUCH_CADENCE_DAYS[nextKind] - TOUCH_CADENCE_DAYS[lastOutbound.kind]) *
        24 *
        60 *
        60 *
        1000,
  );
  return now >= dueAfter ? nextKind : null;
}

export async function runBuysideRfq(ctx: BuysideContext): Promise<BuysideSummary> {
  const now = new Date();

  // 1. Pull all prospects on this campaign by joining through companies (vertical=supplier).
  //    A prospect belongs to the campaign if it shares a company whose vertical matches the
  //    campaign's vertical. Buy-side prospects all live under "supplier"-vertical companies.
  const campaignRows = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.id, ctx.campaignId))
    .limit(1);
  if (campaignRows.length === 0) {
    throw new Error(`Buyside campaign not found: ${ctx.campaignId}`);
  }
  const campaign = campaignRows[0];

  const prospects = await db
    .select({
      id: schema.prospects.id,
      email: schema.prospects.email,
      firstName: schema.prospects.firstName,
      lastName: schema.prospects.lastName,
      role: schema.prospects.role,
      status: schema.prospects.status,
      companyId: schema.prospects.companyId,
      companyName: schema.companies.name,
    })
    .from(schema.prospects)
    .innerJoin(schema.companies, eq(schema.prospects.companyId, schema.companies.id))
    .where(eq(schema.companies.vertical, campaign.vertical));

  if (prospects.length === 0) {
    return zeroSummary();
  }

  // 2. Bulk-load last outbound + any inbound (reply) per prospect.
  const prospectIds = prospects.map((p) => p.id);
  const messageRows = await db
    .select()
    .from(schema.messages)
    .where(
      and(
        inArray(schema.messages.prospectId, prospectIds),
        eq(schema.messages.campaignId, ctx.campaignId),
      ),
    );

  const lastOutboundByProspect = new Map<string, { kind: TouchKind; sentAt: Date }>();
  const hasInboundByProspect = new Set<string>();
  let newReplies = 0;
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  for (const m of messageRows) {
    if (m.direction === "inbound") {
      hasInboundByProspect.add(m.prospectId);
      if (m.receivedAt && m.receivedAt >= oneDayAgo) newReplies += 1;
      continue;
    }
    // outbound — track the latest touch
    if (m.kind !== "first_touch" && m.kind !== "follow_up_1" && m.kind !== "follow_up_2") continue;
    const sentAt = m.sentAt ?? m.createdAt;
    const cur = lastOutboundByProspect.get(m.prospectId);
    if (!cur || sentAt > cur.sentAt) {
      lastOutboundByProspect.set(m.prospectId, { kind: m.kind as TouchKind, sentAt });
    }
  }

  // 3. Iterate prospects, decide action, send (or dry-run).
  const results: BuysideResultItem[] = [];
  let sentCount = 0;
  const summary: BuysideSummary = zeroSummary();
  summary.totalProspects = prospects.length;
  summary.newReplies = newReplies;

  // Pipeline counters
  for (const p of prospects) {
    const lastOut = lastOutboundByProspect.get(p.id) ?? null;
    if (hasInboundByProspect.has(p.id) || p.status === "replied") {
      summary.pipeline.replied += 1;
    } else if (!lastOut) {
      summary.pipeline.awaitingFirstTouch += 1;
    } else if (lastOut.kind === "first_touch") {
      summary.pipeline.awaitingFollowUp1 += 1;
    } else if (lastOut.kind === "follow_up_1") {
      summary.pipeline.awaitingFollowUp2 += 1;
    } else {
      summary.pipeline.completed += 1;
    }
  }

  for (const p of prospects) {
    if (sentCount >= ctx.dailyCap) break;

    // Skip if replied / suppressed / bounced / unsubscribed
    if (
      p.status === "replied" ||
      p.status === "bounced" ||
      p.status === "suppressed" ||
      p.status === "unsubscribed" ||
      hasInboundByProspect.has(p.id)
    ) {
      summary[p.status === "replied" || hasInboundByProspect.has(p.id) ? "skippedReplied" : "skippedBlocked"] += 1;
      continue;
    }

    const lastOut = lastOutboundByProspect.get(p.id) ?? null;
    const action = nextTouchFor(lastOut, now);
    if (action === "done") {
      summary.skippedDone += 1;
      continue;
    }
    if (action === null) {
      summary.skippedNotDue += 1;
      continue;
    }

    const rendered = renderRfqTouch(action, {
      supplierName: p.companyName,
      recipientFirstName: p.firstName,
    });

    if (ctx.dryRun) {
      results.push({
        prospectId: p.id,
        email: p.email,
        supplierName: p.companyName,
        touch: action,
        status: "dry_run",
      });
      sentCount += 1;
      summary[touchKeyFor(action)] += 1;
      continue;
    }

    try {
      const sent = await sendEmail({
        to: {
          email: p.email,
          name: [p.firstName, p.lastName].filter(Boolean).join(" ") || undefined,
        },
        from: { email: ctx.senderEmail, name: ctx.senderName },
        replyTo: { email: ctx.replyToEmail },
        subject: rendered.subject,
        textContent: rendered.textBody,
        htmlContent: rendered.htmlBody,
        tags: [`campaign:${ctx.campaignId}`, `buyside:${action}`],
      });

      await db.insert(schema.messages).values({
        prospectId: p.id,
        campaignId: ctx.campaignId,
        direction: "outbound",
        kind: action,
        subject: rendered.subject,
        bodyText: rendered.textBody,
        bodyHtml: rendered.htmlBody,
        messageId: sent.messageId,
        providerMessageId: sent.providerMessageId,
        sentAt: new Date(),
      });

      // Mark prospect as "sent" on first touch; subsequent touches keep status as is.
      if (action === "first_touch") {
        await db
          .update(schema.prospects)
          .set({ status: "sent", updatedAt: new Date() })
          .where(eq(schema.prospects.id, p.id));
      }

      results.push({
        prospectId: p.id,
        email: p.email,
        supplierName: p.companyName,
        touch: action,
        status: "sent",
        messageId: sent.messageId,
      });
      sentCount += 1;
      summary[touchKeyFor(action)] += 1;
    } catch (err) {
      results.push({
        prospectId: p.id,
        email: p.email,
        supplierName: p.companyName,
        touch: action,
        status: "failed",
        reason: (err as Error).message,
      });
      summary.failed += 1;
    }
  }

  // Recompute new replies as of right now in case the count was missed earlier.
  summary.byTouch = results;
  return summary;
}

function touchKeyFor(touch: TouchKind): "firstTouchSent" | "followUp1Sent" | "followUp2Sent" {
  if (touch === "first_touch") return "firstTouchSent";
  if (touch === "follow_up_1") return "followUp1Sent";
  return "followUp2Sent";
}

function zeroSummary(): BuysideSummary {
  return {
    totalProspects: 0,
    firstTouchSent: 0,
    followUp1Sent: 0,
    followUp2Sent: 0,
    skippedNotDue: 0,
    skippedReplied: 0,
    skippedDone: 0,
    skippedBlocked: 0,
    failed: 0,
    newReplies: 0,
    pipeline: {
      awaitingFirstTouch: 0,
      awaitingFollowUp1: 0,
      awaitingFollowUp2: 0,
      completed: 0,
      replied: 0,
    },
    byTouch: [],
  };
}

// Suppress unused-import warning if `sql` import isn't needed after final edits.
void sql;
