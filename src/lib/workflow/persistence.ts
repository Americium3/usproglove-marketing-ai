import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { DiscoveredCompany, EnrichedContact } from "@/lib/prospects/types";
import type { Vertical } from "@/../content/catalog/products";

export type EventKind =
  | "company.discovered"
  | "company.skipped"
  | "contact.skipped"
  | "prospect.enriched"
  | "prospect.verified"
  | "prospect.verify_failed"
  | "prospect.scored"
  | "prospect.skipped"
  | "message.drafted"
  | "message.sent"
  | "message.failed"
  | "email.delivered"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "email.unsubscribed"
  | "email.spam";

export async function upsertCompany(
  place: DiscoveredCompany,
  discoverySourceId: string,
): Promise<string> {
  const existing = place.externalId
    ? await db
        .select({ id: schema.companies.id })
        .from(schema.companies)
        .where(eq(schema.companies.googlePlaceId, place.externalId))
        .limit(1)
    : [];

  if (existing.length > 0) {
    await db
      .update(schema.companies)
      .set({
        name: place.name,
        website: place.website,
        phone: place.phone,
        addressLine: place.address,
        city: place.city,
        region: place.region,
        countryCode: place.countryCode ?? "US",
        subVertical: place.subVertical,
        rating: place.rating,
        reviewCount: place.reviewCount,
        metadata: (place.metadata ?? {}) as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(schema.companies.id, existing[0].id));
    return existing[0].id;
  }

  const inserted = await db
    .insert(schema.companies)
    .values({
      name: place.name,
      website: place.website,
      phone: place.phone,
      addressLine: place.address,
      city: place.city,
      region: place.region,
      countryCode: place.countryCode ?? "US",
      vertical: place.vertical,
      subVertical: place.subVertical,
      googlePlaceId: place.externalId,
      rating: place.rating,
      reviewCount: place.reviewCount,
      discoverySourceId,
      metadata: (place.metadata ?? {}) as Record<string, unknown>,
    })
    .returning({ id: schema.companies.id });
  return inserted[0].id;
}

export interface UpsertProspectInput {
  companyId: string;
  contact: EnrichedContact;
  enrichmentSourceId: string;
}

export async function upsertProspect(input: UpsertProspectInput): Promise<string> {
  const existing = await db
    .select({ id: schema.prospects.id })
    .from(schema.prospects)
    .where(
      and(
        eq(schema.prospects.companyId, input.companyId),
        eq(schema.prospects.email, input.contact.email.toLowerCase()),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.prospects)
      .set({
        firstName: input.contact.firstName,
        lastName: input.contact.lastName,
        role: input.contact.role,
        enrichmentSourceId: input.enrichmentSourceId,
        enrichmentConfidence: input.contact.confidence,
        updatedAt: new Date(),
      })
      .where(eq(schema.prospects.id, existing[0].id));
    return existing[0].id;
  }

  const inserted = await db
    .insert(schema.prospects)
    .values({
      companyId: input.companyId,
      email: input.contact.email.toLowerCase(),
      firstName: input.contact.firstName,
      lastName: input.contact.lastName,
      role: input.contact.role,
      status: "enriching",
      enrichmentSourceId: input.enrichmentSourceId,
      enrichmentConfidence: input.contact.confidence,
    })
    .returning({ id: schema.prospects.id });
  return inserted[0].id;
}

export async function updateProspectStatus(
  prospectId: string,
  status: (typeof schema.prospectStatusEnum.enumValues)[number],
  extra: Partial<{
    score: number;
    suppressedAt: Date;
    suppressionReason: string;
    metadata: Record<string, unknown>;
  }> = {},
) {
  await db
    .update(schema.prospects)
    .set({
      status,
      score: extra.score,
      suppressedAt: extra.suppressedAt,
      suppressionReason: extra.suppressionReason,
      metadata: extra.metadata,
      updatedAt: new Date(),
    })
    .where(eq(schema.prospects.id, prospectId));
}

export async function mergeProspectMetadata(
  prospectId: string,
  patch: Record<string, unknown>,
) {
  const rows = await db
    .select({ metadata: schema.prospects.metadata })
    .from(schema.prospects)
    .where(eq(schema.prospects.id, prospectId))
    .limit(1);
  const current = (rows[0]?.metadata ?? {}) as Record<string, unknown>;
  await db
    .update(schema.prospects)
    .set({ metadata: { ...current, ...patch }, updatedAt: new Date() })
    .where(eq(schema.prospects.id, prospectId));
}

export async function logEvent(args: {
  kind: EventKind;
  prospectId?: string;
  campaignId?: string;
  payload?: Record<string, unknown>;
}) {
  try {
    await db.insert(schema.events).values({
      kind: args.kind,
      prospectId: args.prospectId,
      campaignId: args.campaignId,
      payload: args.payload ?? {},
    });
  } catch (err) {
    const cause = (err as { cause?: unknown }).cause;
    console.error("[logEvent] failed — continuing", {
      kind: args.kind,
      prospectId: args.prospectId,
      campaignId: args.campaignId,
      message: (err as Error).message,
      cause,
    });
  }
}

export async function insertOutboundMessage(args: {
  prospectId: string;
  campaignId: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  messageId: string;
  providerMessageId: string;
}): Promise<string> {
  const rows = await db
    .insert(schema.messages)
    .values({
      prospectId: args.prospectId,
      campaignId: args.campaignId,
      direction: "outbound",
      kind: "first_touch",
      subject: args.subject,
      bodyText: args.bodyText,
      bodyHtml: args.bodyHtml,
      messageId: args.messageId,
      providerMessageId: args.providerMessageId,
      sentAt: new Date(),
    })
    .returning({ id: schema.messages.id });
  return rows[0].id;
}

export interface ExistingProspectInfo {
  id: string;
  status: (typeof schema.prospectStatusEnum.enumValues)[number];
  companyId: string;
}

/**
 * Look up which of the given emails already exist in our system.
 * Checks both `prospects` (any status) and `suppressions` (global blocklist).
 * Email matching is case-insensitive (we lowercase on insert).
 */
export async function findExistingEmails(
  emails: string[],
): Promise<{
  prospects: Map<string, ExistingProspectInfo>;
  suppressed: Set<string>;
}> {
  const result = {
    prospects: new Map<string, ExistingProspectInfo>(),
    suppressed: new Set<string>(),
  };
  if (emails.length === 0) return result;
  const normalized = Array.from(new Set(emails.map((e) => e.toLowerCase())));

  const [pRows, sRows] = await Promise.all([
    db
      .select({
        id: schema.prospects.id,
        email: schema.prospects.email,
        status: schema.prospects.status,
        companyId: schema.prospects.companyId,
      })
      .from(schema.prospects)
      .where(inArray(schema.prospects.email, normalized)),
    db
      .select({ email: schema.suppressions.email })
      .from(schema.suppressions)
      .where(inArray(schema.suppressions.email, normalized)),
  ]);

  for (const r of pRows) {
    result.prospects.set(r.email.toLowerCase(), {
      id: r.id,
      status: r.status,
      companyId: r.companyId,
    });
  }
  for (const r of sRows) {
    result.suppressed.add(r.email.toLowerCase());
  }
  return result;
}

export function extractDomain(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function rolesFor(vertical: Vertical): string[] {
  switch (vertical) {
    case "tattoo":
      return ["owner", "founder", "artist", "manager"];
    case "beauty":
      return ["owner", "founder", "manager", "director", "esthetician"];
    case "restaurant":
      return ["owner", "founder", "general manager", "gm", "manager", "chef", "procurement", "purchasing"];
    case "medical":
      return [
        "owner",
        "founder",
        "physician",
        "doctor",
        "nurse",
        "practice manager",
        "office manager",
        "operations",
        "director",
        "administrator",
        "procurement",
        "purchasing",
      ];
    case "automotive":
      return ["owner", "founder", "general manager", "service manager", "parts manager", "procurement", "purchasing"];
    case "industrial":
    case "agriculture":
    case "janitorial":
    case "cannabis":
    case "veterinary":
    default:
      return [
        "owner",
        "founder",
        "manager",
        "general manager",
        "director",
        "operations",
        "procurement",
        "purchasing",
        "buyer",
      ];
  }
}
