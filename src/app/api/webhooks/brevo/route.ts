import { NextResponse } from "next/server";
import { eq, isNull, and } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logEvent } from "@/lib/workflow/persistence";

export const dynamic = "force-dynamic";

// Brevo transactional webhook receiver.
//
// Auth: shared secret. Brevo doesn't sign payloads, so we use a unique URL
// token (`?secret=...`) configured in Brevo's webhook UI. Set BREVO_WEBHOOK_SECRET
// to the same value the Brevo dashboard sends.
//
// Event mapping:
//   delivered                 → messages.* unchanged, log email.delivered
//   unique_opened             → messages.openedAt (first only), log email.opened
//   opened                    → ignored (we count unique opens only; "opened" fires
//                               every read and includes Apple Mail proxy fetches)
//   proxy_open / loadedByProxy → ignored (Apple Mail / image-proxy false positives;
//                               user explicitly noted these inflate metrics)
//   click                     → messages.clickedAt (first only), log email.clicked
//   hard_bounce               → messages.bouncedAt, suppress email, log email.bounced
//   soft_bounce               → log only (don't suppress — retryable)
//   unsubscribed              → suppress, log email.unsubscribed
//   spam                      → suppress, log email.spam
//
// Idempotency: openedAt/clickedAt/bouncedAt are set only when currently NULL,
// so replays from Brevo can't overwrite the first-event timestamp.

interface BrevoEvent {
  event: string;
  email?: string;
  "message-id"?: string;
  messageId?: string;
  date?: string;
  ts?: number;
  link?: string;
  reason?: string;
  tag?: string | string[];
}

const IGNORED_EVENTS = new Set(["proxy_open", "loadedByProxy", "opened"]);

export async function POST(request: Request) {
  const expected = process.env.BREVO_WEBHOOK_SECRET;
  if (expected) {
    const url = new URL(request.url);
    const provided = url.searchParams.get("secret") ?? request.headers.get("x-webhook-secret");
    if (provided !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let body: BrevoEvent | BrevoEvent[];
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const events = Array.isArray(body) ? body : [body];
  const summary = { received: events.length, applied: 0, ignored: 0, unmatched: 0 };

  for (const evt of events) {
    if (IGNORED_EVENTS.has(evt.event)) {
      summary.ignored++;
      continue;
    }
    const providerMessageId = stripAngles(evt["message-id"] ?? evt.messageId);
    if (!providerMessageId) {
      summary.ignored++;
      continue;
    }

    const message = await findMessageByProviderId(providerMessageId);
    if (!message) {
      summary.unmatched++;
      continue;
    }

    const eventAt = toDate(evt.date ?? evt.ts);
    await applyEvent(message, evt, eventAt);
    summary.applied++;
  }

  return NextResponse.json(summary);
}

function stripAngles(value: string | undefined): string | undefined {
  return value?.replace(/^<|>$/g, "");
}

function toDate(input: string | number | undefined): Date {
  if (typeof input === "number") return new Date(input * 1000);
  if (typeof input === "string") {
    const d = new Date(input);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

async function findMessageByProviderId(providerMessageId: string) {
  const rows = await db
    .select({
      id: schema.messages.id,
      prospectId: schema.messages.prospectId,
      campaignId: schema.messages.campaignId,
      openedAt: schema.messages.openedAt,
      clickedAt: schema.messages.clickedAt,
      bouncedAt: schema.messages.bouncedAt,
    })
    .from(schema.messages)
    .where(eq(schema.messages.providerMessageId, providerMessageId))
    .limit(1);
  return rows[0] ?? null;
}

async function applyEvent(
  message: { id: string; prospectId: string; campaignId: string | null; openedAt: Date | null; clickedAt: Date | null; bouncedAt: Date | null },
  evt: BrevoEvent,
  eventAt: Date,
) {
  const campaignId = message.campaignId ?? undefined;
  const payload: Record<string, unknown> = {
    providerEvent: evt.event,
    email: evt.email,
    link: evt.link,
    reason: evt.reason,
  };

  switch (evt.event) {
    case "delivered":
      await logEvent({ kind: "email.delivered", prospectId: message.prospectId, campaignId, payload });
      break;
    case "unique_opened":
      if (!message.openedAt) {
        await db
          .update(schema.messages)
          .set({ openedAt: eventAt })
          .where(and(eq(schema.messages.id, message.id), isNull(schema.messages.openedAt)));
      }
      await logEvent({ kind: "email.opened", prospectId: message.prospectId, campaignId, payload });
      break;
    case "click":
      if (!message.clickedAt) {
        await db
          .update(schema.messages)
          .set({ clickedAt: eventAt })
          .where(and(eq(schema.messages.id, message.id), isNull(schema.messages.clickedAt)));
      }
      await logEvent({ kind: "email.clicked", prospectId: message.prospectId, campaignId, payload });
      break;
    case "hard_bounce":
      if (!message.bouncedAt) {
        await db
          .update(schema.messages)
          .set({ bouncedAt: eventAt })
          .where(and(eq(schema.messages.id, message.id), isNull(schema.messages.bouncedAt)));
      }
      if (evt.email) await suppress(evt.email, "hard_bounce");
      await logEvent({ kind: "email.bounced", prospectId: message.prospectId, campaignId, payload });
      break;
    case "soft_bounce":
      await logEvent({ kind: "email.bounced", prospectId: message.prospectId, campaignId, payload });
      break;
    case "unsubscribed":
      if (evt.email) await suppress(evt.email, "unsubscribe");
      await logEvent({ kind: "email.unsubscribed", prospectId: message.prospectId, campaignId, payload });
      break;
    case "spam":
      if (evt.email) await suppress(evt.email, "spam");
      await logEvent({ kind: "email.spam", prospectId: message.prospectId, campaignId, payload });
      break;
    default:
      // Unknown event — store for visibility but don't mutate state.
      await logEvent({
        kind: "email.delivered",
        prospectId: message.prospectId,
        campaignId,
        payload: { ...payload, note: "unmapped_event" },
      });
  }
}

async function suppress(email: string, reason: string) {
  try {
    await db.insert(schema.suppressions).values({ email, reason }).onConflictDoNothing();
  } catch (err) {
    console.error("[brevo-webhook] suppress failed", { email, reason, err });
  }
}
