import { z } from "zod";
import { trackedGenerateObject, trackEmailSent } from "@/lib/ai/track";
import { findContacts, verifyEmail } from "@/lib/prospects/enrichment";
import { googlePlacesSource } from "@/lib/prospects/sources/google-places";
import { sendEmail } from "@/lib/email/brevo";
import { composeEmail, type SenderIdentity } from "@/lib/email/compose";
import type { Vertical } from "@/../content/catalog/products";
import { products, heroSkuByVertical } from "@/../content/catalog/products";
import {
  upsertCompany,
  upsertProspect,
  updateProspectStatus,
  mergeProspectMetadata,
  logEvent,
  insertOutboundMessage,
  extractDomain,
  rolesFor,
  findExistingEmails,
  type EventKind,
} from "./persistence";
import { parseIcp, matchesExcludes, type IcpConfig } from "./icp";

const DraftSchema = z.object({
  subject: z.string().min(6).max(80),
  textBody: z.string().min(40).max(1200),
  htmlBody: z.string().min(40),
});

const ScoreSchema = z.object({
  fit: z.number().min(0).max(100),
  reasoning: z.string(),
  suggestedSkuId: z.string(),
});

export type OutboundMode = "discover" | "preview" | "send";

export type ProgressEventKind =
  | EventKind
  | "run.started"
  | "run.search"
  | "run.done"
  | "run.complete"
  | "run.error";

export interface ProgressEvent {
  kind: ProgressEventKind;
  prospectId?: string;
  [key: string]: unknown;
}

export interface OutboundContext {
  vertical: Vertical;
  city?: string;
  region?: string;
  dailyCap: number;
  contactsPerCompany?: number;
  senderEmail: string;
  senderName: string;
  replyToEmail: string;
  signatureText?: string | null;
  campaignId: string;
  mode?: OutboundMode;
  icp?: IcpConfig | Record<string, unknown> | null;
  onEvent?: (event: ProgressEvent) => void;
}

export async function runOutboundStep(ctx: OutboundContext) {
  const mode: OutboundMode = ctx.mode ?? "send";

  async function emit(args: {
    kind: ProgressEventKind;
    prospectId?: string;
    data?: Record<string, unknown>;
    persist?: boolean;
  }) {
    const data = args.data ?? {};
    if (args.persist !== false && isDbEventKind(args.kind)) {
      await logEvent({
        kind: args.kind,
        prospectId: args.prospectId,
        campaignId: ctx.campaignId,
        payload: data,
      });
    }
    try {
      ctx.onEvent?.({ kind: args.kind, prospectId: args.prospectId, ...data });
    } catch {
      // stream consumer errors must not kill the pipeline
    }
  }

  await emit({
    kind: "run.started",
    persist: false,
    data: { mode, dailyCap: ctx.dailyCap, vertical: ctx.vertical, campaignId: ctx.campaignId },
  });

  const icp = parseIcp(ctx.icp ?? null);
  const searchCities: (string | undefined)[] =
    icp?.cities && icp.cities.length > 0 ? icp.cities : [ctx.city];
  const perCityLimit = Math.min(20, Math.max(5, ctx.dailyCap * 3));
  const rolesForThis = icp?.preferredRoles?.length ? icp.preferredRoles : rolesFor(ctx.vertical);

  await emit({
    kind: "run.search",
    persist: false,
    data: {
      source: "google-places",
      vertical: ctx.vertical,
      cities: searchCities.filter(Boolean),
      perCityLimit,
      hasIcp: !!icp,
    },
  });

  const discoveredMap = new Map<string, Awaited<ReturnType<typeof googlePlacesSource.discover>>[number]>();
  for (const city of searchCities) {
    const batch = await googlePlacesSource.discover({
      vertical: ctx.vertical,
      city,
      region: ctx.region,
      limit: perCityLimit,
    });
    for (const c of batch) if (c.externalId) discoveredMap.set(c.externalId, c);
  }
  let discovered = Array.from(discoveredMap.values());

  // ICP quality filters on Google Places results (before burning any enrichment credits).
  if (icp) {
    const beforeCount = discovered.length;
    discovered = discovered.filter((c) => {
      if (icp.minReviewCount != null && (c.reviewCount ?? 0) < icp.minReviewCount) return false;
      if (icp.minRating != null) {
        const r = c.rating != null ? c.rating / 10 : 0;
        if (r < icp.minRating) return false;
      }
      return true;
    });
    const afterCount = discovered.length;
    if (beforeCount !== afterCount) {
      await emit({
        kind: "run.search",
        persist: false,
        data: { phase: "icp-filter", before: beforeCount, after: afterCount },
      });
    }
  }

  const contactsPerCompany = Math.max(1, Math.min(10, ctx.contactsPerCompany ?? 3));
  const minVerifyScore = Number(process.env.MIN_EMAIL_DELIVERABILITY_SCORE ?? 70);
  const minFit = Number(process.env.MIN_FIT_SCORE ?? 60);

  type FindResult = Awaited<ReturnType<typeof findContacts>>;
  const domainEnrichmentCache = new Map<string, FindResult>();

  type ResultItem = {
    prospectId: string;
    companyId: string;
    email: string;
    status: "sent" | "skipped" | "failed" | "preview" | "discovered";
    reason?: string;
  };
  const results: ResultItem[] = [];

  const capReached = (): boolean => {
    if (mode === "discover") return results.filter((r) => r.status === "discovered").length >= ctx.dailyCap;
    if (mode === "preview") return results.filter((r) => r.status === "preview").length >= ctx.dailyCap;
    return results.filter((r) => r.status === "sent" || r.status === "preview").length >= ctx.dailyCap;
  };

  companies: for (const company of discovered) {
    if (capReached()) break;

    const companyId = await upsertCompany(company, googlePlacesSource.id);
    await emit({
      kind: "company.discovered",
      data: {
        companyId,
        name: company.name,
        vertical: company.vertical,
        city: company.city,
        website: company.website,
      },
    });

    const excludeHit = matchesExcludes(company.name, icp?.excludeKeywords);
    if (excludeHit) {
      await emit({
        kind: "company.skipped",
        data: { companyId, name: company.name, reason: "icp_exclude", keyword: excludeHit },
      });
      continue;
    }

    if (!company.website) {
      await emit({
        kind: "company.skipped",
        data: { companyId, name: company.name, reason: "no_website" },
      });
      continue;
    }

    const domain = extractDomain(company.website);
    if (!domain) {
      await emit({
        kind: "company.skipped",
        data: { companyId, name: company.name, reason: "invalid_domain", website: company.website },
      });
      continue;
    }

    // Per-domain cache: 8 branches of the same chain share one enrichment lookup.
    let enrichment = domainEnrichmentCache.get(domain);
    if (!enrichment) {
      enrichment = await findContacts({
        companyName: company.name,
        domain,
        rolesOfInterest: rolesForThis,
      });
      domainEnrichmentCache.set(domain, enrichment);
    }
    const { providerId: enrichmentSourceId, contacts } = enrichment;

    if (contacts.length === 0) {
      await emit({
        kind: "company.skipped",
        data: { companyId, name: company.name, reason: "no_contacts_found", domain },
      });
      continue;
    }

    // Filter duplicates + suppressions, take up to contactsPerCompany new candidates.
    const existing = await findExistingEmails(contacts.map((c) => c.email));
    const picked: typeof contacts = [];
    for (const c of contacts) {
      if (picked.length >= contactsPerCompany) break;
      const key = c.email.toLowerCase();
      if (existing.suppressed.has(key)) {
        await emit({
          kind: "contact.skipped",
          data: { companyId, name: company.name, email: c.email, reason: "suppressed" },
        });
        continue;
      }
      const known = existing.prospects.get(key);
      if (known) {
        await emit({
          kind: "contact.skipped",
          data: {
            companyId,
            name: company.name,
            email: c.email,
            reason: "already_in_list",
            existingProspectId: known.id,
            existingStatus: known.status,
          },
        });
        continue;
      }
      picked.push(c);
    }

    if (picked.length === 0) {
      await emit({
        kind: "company.skipped",
        data: {
          companyId,
          name: company.name,
          reason: "all_contacts_known",
          candidatesFound: contacts.length,
        },
      });
      continue;
    }

    for (const contact of picked) {
      if (capReached()) break companies;

      const prospectId = await upsertProspect({ companyId, contact, enrichmentSourceId });
      await emit({
        kind: "prospect.enriched",
        prospectId,
        data: {
          companyName: company.name,
          email: contact.email,
          role: contact.role,
          confidence: contact.confidence,
        },
      });

      const verification = await verifyEmail(contact.email);
      await mergeProspectMetadata(prospectId, {
        verification: {
          deliverable: verification.deliverable,
          score: verification.score,
          verifierId: verification.verifierId,
          threshold: minVerifyScore,
        },
      });

      if (!verification.deliverable || verification.score < minVerifyScore) {
        await updateProspectStatus(prospectId, "suppressed", {
          suppressedAt: new Date(),
          suppressionReason: "low_verification",
        });
        await emit({
          kind: "prospect.verify_failed",
          prospectId,
          data: {
            companyName: company.name,
            email: contact.email,
            score: verification.score,
            threshold: minVerifyScore,
          },
        });
        results.push({ prospectId, companyId, email: contact.email, status: "skipped", reason: "low_verification" });
        continue;
      }

      await updateProspectStatus(prospectId, "enriched");
      await emit({
        kind: "prospect.verified",
        prospectId,
        data: { companyName: company.name, email: contact.email, score: verification.score },
      });

      if (mode === "discover") {
        results.push({ prospectId, companyId, email: contact.email, status: "discovered" });
        continue;
      }

      const score = await trackedGenerateObject({
        task: "score",
        modelKey: "fast",
        schema: ScoreSchema,
        prompt: scorePrompt(company.name, company.vertical, ctx.vertical, contact.role, icp?.description),
        campaignId: ctx.campaignId,
        metadata: { companyName: company.name, domain, prospectId },
      });
      await mergeProspectMetadata(prospectId, {
        score: {
          fit: score.object.fit,
          reasoning: score.object.reasoning,
          suggestedSkuId: score.object.suggestedSkuId,
        },
      });
      await emit({
        kind: "prospect.scored",
        prospectId,
        data: {
          companyName: company.name,
          email: contact.email,
          fit: score.object.fit,
          reasoning: score.object.reasoning,
          suggestedSkuId: score.object.suggestedSkuId,
        },
      });

      if (score.object.fit < minFit) {
        await updateProspectStatus(prospectId, "discovered", { score: score.object.fit });
        await emit({
          kind: "prospect.skipped",
          prospectId,
          data: {
            companyName: company.name,
            email: contact.email,
            reason: "low_fit",
            fit: score.object.fit,
            threshold: minFit,
          },
        });
        results.push({ prospectId, companyId, email: contact.email, status: "skipped", reason: "low_fit" });
        continue;
      }

      const heroSkuId = score.object.suggestedSkuId || heroSkuByVertical[ctx.vertical];
      const heroSku =
        products.find((p) => p.id === heroSkuId) ??
        products.find((p) => p.id === heroSkuByVertical[ctx.vertical])!;

      const draft = await trackedGenerateObject({
        task: "draft",
        modelKey: "primary",
        schema: DraftSchema,
        prompt: draftPrompt({
          company: company.name,
          vertical: ctx.vertical,
          contactName: contact.firstName,
          heroSkuName: heroSku.name,
          positioning: heroSku.positioning,
        }),
        campaignId: ctx.campaignId,
        metadata: { heroSkuId: heroSku.id, prospectId },
      });

      await updateProspectStatus(prospectId, "ready", { score: score.object.fit });
      await emit({
        kind: "message.drafted",
        prospectId,
        data: {
          companyName: company.name,
          email: contact.email,
          subject: draft.object.subject,
          heroSkuId: heroSku.id,
        },
      });

      const sender: SenderIdentity = {
        name: ctx.senderName,
        email: ctx.senderEmail,
        replyTo: ctx.replyToEmail,
        title: process.env.SENDER_TITLE || undefined,
        phone: process.env.SENDER_PHONE || undefined,
        companyName: process.env.SENDER_COMPANY_NAME || undefined,
        companyWebsite: process.env.SENDER_COMPANY_WEBSITE || undefined,
      };
      const composed = composeEmail({
        draft: draft.object,
        sender,
        recipient: { email: contact.email, firstName: contact.firstName, lastName: contact.lastName },
        signatureOverride: ctx.signatureText ? { text: ctx.signatureText } : undefined,
      });

      if (mode === "preview") {
        await mergeProspectMetadata(prospectId, {
          draft: {
            subject: composed.subject,
            textBody: composed.textContent,
            htmlBody: composed.htmlContent,
            from: composed.from,
            to: composed.to,
            replyTo: composed.replyTo,
            signatureText: composed.signatureText,
            signatureHtml: composed.signatureHtml,
          },
        });
        results.push({ prospectId, companyId, email: contact.email, status: "preview" });
        continue;
      }

      await updateProspectStatus(prospectId, "sending", { score: score.object.fit });

      try {
        const sent = await sendEmail({
          to: {
            email: contact.email,
            name: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || undefined,
          },
          from: { email: ctx.senderEmail, name: ctx.senderName },
          replyTo: { email: ctx.replyToEmail },
          subject: composed.subject,
          textContent: composed.textContent,
          htmlContent: composed.htmlContent,
          tags: [`vertical:${ctx.vertical}`, `campaign:${ctx.campaignId}`],
        });

        await insertOutboundMessage({
          prospectId,
          campaignId: ctx.campaignId,
          subject: composed.subject,
          bodyText: composed.textContent,
          bodyHtml: composed.htmlContent,
          messageId: sent.messageId,
          providerMessageId: sent.providerMessageId,
        });
        await updateProspectStatus(prospectId, "sent", { score: score.object.fit });
        await emit({
          kind: "message.sent",
          prospectId,
          data: { companyName: company.name, email: contact.email, messageId: sent.messageId },
        });
        await trackEmailSent({
          campaignId: ctx.campaignId,
          prospectId,
          vertical: ctx.vertical,
          messageId: sent.messageId,
        });
        results.push({ prospectId, companyId, email: contact.email, status: "sent" });
      } catch (err) {
        await updateProspectStatus(prospectId, "enriched", { score: score.object.fit });
        await emit({
          kind: "message.failed",
          prospectId,
          data: { companyName: company.name, email: contact.email, error: (err as Error).message },
        });
        results.push({ prospectId, companyId, email: contact.email, status: "failed", reason: (err as Error).message });
      }
    }
  }

  const summary = {
    sent: results.filter((r) => r.status === "sent").length,
    preview: results.filter((r) => r.status === "preview").length,
    discovered: results.filter((r) => r.status === "discovered").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    total: results.length,
  };

  await emit({ kind: "run.done", persist: false, data: { mode, summary } });

  return results;
}

const DB_EVENT_KINDS = new Set<ProgressEventKind>([
  "company.discovered",
  "company.skipped",
  "contact.skipped",
  "prospect.enriched",
  "prospect.verified",
  "prospect.verify_failed",
  "prospect.scored",
  "prospect.skipped",
  "message.drafted",
  "message.sent",
  "message.failed",
]);

function isDbEventKind(kind: ProgressEventKind): kind is EventKind {
  return DB_EVENT_KINDS.has(kind);
}

function scorePrompt(
  companyName: string,
  companyVertical: string,
  targetVertical: Vertical,
  role?: string,
  icpDescription?: string,
): string {
  const icpBlock = icpDescription && icpDescription.trim()
    ? `\nIdeal Customer Profile for this campaign:\n${icpDescription.trim()}\n\nCalibrate the score primarily against this ICP. Companies matching the ICP closely earn 80+; weak matches earn < 60.`
    : "";

  return `Score this prospect for a disposable nitrile glove cold outreach. Return fit 0-100.

Company: ${companyName}
Vertical tag: ${companyVertical}
Target vertical for campaign: ${targetVertical}
Contact role: ${role ?? "unknown"}
${icpBlock}

Rubric:
- 80-100: exact match vertical, owner/manager contact, clear glove usage
- 60-79: adjacent vertical or ops role
- 0-59: mismatch or unclear

Also suggest a SKU id from our catalog (e.g., "5.0-black", "3.0", "3.5-ice-blue").`;
}

function draftPrompt(args: {
  company: string;
  vertical: Vertical;
  contactName?: string;
  heroSkuName: string;
  positioning: string[];
}): string {
  return `Draft a short B2B cold outreach email — 3 short paragraphs, plainspoken, no marketing fluff, no emojis.

Company: ${args.company}
Vertical: ${args.vertical}
Contact: ${args.contactName ?? "there"}
Hero product: ${args.heroSkuName}
Product positioning: ${args.positioning.join(", ")}

Rules:
- Subject < 55 chars, curiosity over claim
- Open line references something specific to ${args.vertical} work (not "I was looking at your website")
- One concrete value bullet tied to the product positioning
- Close with a single soft CTA (reply to get a sample pack)
- Plaintext + HTML variants. HTML is semantic, no inline styles beyond <b> and <a>.
- No "Dear", no "I hope this finds you well".`;
}
