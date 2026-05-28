import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export interface InboundMessage {
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  from: { email: string; name?: string };
  subject: string;
  textContent: string;
  htmlContent?: string;
  receivedAt: Date;
}

function stripAngles(v: string | undefined | null): string | undefined {
  return v ? v.replace(/^<|>$/g, "") : undefined;
}

function toRefArray(refs: string | string[] | undefined): string[] {
  if (!refs) return [];
  const arr = Array.isArray(refs) ? refs : [refs];
  return arr.map((r) => stripAngles(r)).filter((r): r is string => !!r);
}

/**
 * Poll the reply inbox over IMAP for messages received since `since`.
 * Returns parsed inbound messages. No-op (empty) if REPLY_IMAP_* isn't configured.
 */
export async function pollInbox(since: Date): Promise<InboundMessage[]> {
  const host = process.env.REPLY_IMAP_HOST;
  const user = process.env.REPLY_IMAP_USER;
  const pass = process.env.REPLY_IMAP_PASSWORD;
  if (!host || !user || !pass) return [];
  const port = Number(process.env.REPLY_IMAP_PORT ?? 993);

  const client = new ImapFlow({ host, port, secure: true, auth: { user, pass }, logger: false });
  const out: InboundMessage[] = [];

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const uids = await client.search({ since }, { uid: true });
    if (uids && uids.length > 0) {
      for await (const msg of client.fetch(uids, { source: true, uid: true })) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const fromAddr = parsed.from?.value?.[0];
        out.push({
          messageId: stripAngles(parsed.messageId) ?? "",
          inReplyTo: stripAngles(parsed.inReplyTo),
          references: toRefArray(parsed.references),
          from: { email: (fromAddr?.address ?? "").toLowerCase(), name: fromAddr?.name },
          subject: parsed.subject ?? "",
          textContent: parsed.text ?? "",
          htmlContent: typeof parsed.html === "string" ? parsed.html : undefined,
          receivedAt: parsed.date ?? new Date(),
        });
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }
  return out;
}

export interface IngestSummary {
  polled: number;
  matched: number;
  marked: number;
  skipped: number;
}

/**
 * Poll the inbox, match each reply to a prospect (by In-Reply-To/References →
 * our outbound messageId, falling back to sender email), store it as an inbound
 * message, and mark the prospect `replied` so the follow-up engine stops.
 * Idempotent: a reply whose Message-ID is already stored is skipped.
 */
export async function ingestReplies(since: Date): Promise<IngestSummary> {
  const inbound = await pollInbox(since);
  let matched = 0;
  let marked = 0;
  let skipped = 0;

  for (const msg of inbound) {
    // Match to a prospect: prefer threading headers → our outbound messageId.
    const refIds = [msg.inReplyTo, ...(msg.references ?? [])].filter((r): r is string => !!r);
    let target: { prospectId: string; campaignId: string | null } | null = null;

    if (refIds.length > 0) {
      const rows = await db
        .select({ prospectId: schema.messages.prospectId, campaignId: schema.messages.campaignId })
        .from(schema.messages)
        .where(and(eq(schema.messages.direction, "outbound"), inArray(schema.messages.messageId, refIds)))
        .limit(1);
      if (rows.length > 0) target = rows[0];
    }

    // Fallback: match by sender email to a known prospect.
    if (!target && msg.from.email) {
      const rows = await db
        .select({ id: schema.prospects.id })
        .from(schema.prospects)
        .where(eq(schema.prospects.email, msg.from.email))
        .limit(1);
      if (rows.length > 0) {
        const om = await db
          .select({ campaignId: schema.messages.campaignId })
          .from(schema.messages)
          .where(and(eq(schema.messages.prospectId, rows[0].id), eq(schema.messages.direction, "outbound")))
          .limit(1);
        target = { prospectId: rows[0].id, campaignId: om[0]?.campaignId ?? null };
      }
    }

    if (!target) {
      skipped += 1;
      continue;
    }
    matched += 1;

    // Store the inbound message. messageId is unique → onConflictDoNothing makes
    // re-polling the same reply idempotent.
    const inserted = await db
      .insert(schema.messages)
      .values({
        prospectId: target.prospectId,
        campaignId: target.campaignId ?? undefined,
        direction: "inbound",
        kind: "reply",
        subject: msg.subject,
        bodyText: msg.textContent,
        bodyHtml: msg.htmlContent ?? null,
        messageId: msg.messageId || null,
        inReplyTo: msg.inReplyTo ?? null,
        receivedAt: msg.receivedAt,
      })
      .onConflictDoNothing({ target: schema.messages.messageId })
      .returning({ id: schema.messages.id });

    if (inserted.length === 0) {
      skipped += 1;
      continue; // already ingested this reply
    }

    await db
      .update(schema.prospects)
      .set({ status: "replied", updatedAt: new Date() })
      .where(eq(schema.prospects.id, target.prospectId));
    marked += 1;
  }

  return { polled: inbound.length, matched, marked, skipped };
}
