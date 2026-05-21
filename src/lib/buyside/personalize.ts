/**
 * Per-recipient personalization for the buy-side nitrile RFQ.
 *
 * The RFQ body (volume, certs, terms, timeline) stays static — it is the
 * regulated content that suppliers must see identically across the sequence.
 * We use AI only to tune the OPENER and the CLOSING CTA to the recipient's
 * role and region, so a Chinese factory CEO and a UK regional Sales Director
 * read different first/last lines but the same spec contract in between.
 */
import { z } from "zod";
import { trackedGenerateObject } from "@/lib/ai/track";
import type { TouchKind } from "@/../content/buyside/rfq";

export type RoleBucket =
  | "executive"
  | "senior_sales"
  | "business_dev"
  | "export_logistics"
  | "sales_manager"
  | "procurement_partner";

export type Region = "asia" | "europe" | "north_america" | "mena" | "africa" | "oceania" | "other";

export interface PersonalizationInput {
  campaignId: string;
  prospectId: string;
  touch: TouchKind;
  recipient: {
    firstName?: string | null;
    title?: string | null;
  };
  supplier: {
    name: string;
    country?: string | null;
    city?: string | null;
    employees?: number | null;
    founded?: number | null;
    industry?: string | null;
    keywords?: string | null;
  };
  /**
   * Optional research snippets gathered via web search (LinkedIn + public
   * content). When provided, the AI will reference concrete public signals
   * about the recipient instead of generic role-bucket guesses.
   */
  researchContext?: string;
}

export interface PersonalizationOutput {
  opener: string;
  closeCta: string;
  psLine?: string;
  meta: {
    roleBucket: RoleBucket;
    region: Region;
  };
}

const Schema = z.object({
  opener: z
    .string()
    .min(20)
    .max(420)
    .describe(
      "1–2 sentences that go right after the greeting. Identify Jay Lin at US Pro Glove, anchor on the $-value of the program (~$50M/year), reference ONE specific signal about the recipient (from the research section) or one supplier fact. No greeting — that is prepended separately. No filler. Plainspoken B2B procurement tone.",
    ),
  closeCta: z
    .string()
    .min(20)
    .max(420)
    .describe(
      "1–2 sentences. Bilateral ask: present 2 specific ET time windows (Jay is in Eastern Time, US) PLUS ask for their phone and preferred slot. Pick windows that line up with the recipient's likely working hours. The phone number itself is rendered separately by the template — do NOT include it here.",
    ),
  psLine: z
    .string()
    .max(260)
    .optional()
    .describe(
      "Required for first_touch when region is non-US (Asia, EU, MENA, Africa, Oceania). Omitted otherwise. A one-line PS acknowledging the timezone gap and Jay's willingness to bend his ET hours to meet the recipient — must start with 'P.S. —'. Example for an Asia recipient: 'P.S. — happy to take your morning calls; ET evenings (= your mornings) are convenient on my side.' For US/Canada recipients and all follow-ups: do not include this field.",
    ),
});

export function classifyRole(title?: string | null): RoleBucket {
  const t = (title ?? "").toLowerCase();
  if (!t) return "sales_manager";
  if (/\b(ceo|founder|owner|president|managing director|chairman)\b/.test(t)) return "executive";
  if (/\b(vp|vice president|svp|chief|director of sales|sales director|commercial director)\b/.test(t))
    return "senior_sales";
  if (/\b(business development|bd|channel|partnerships?|alliance)\b/.test(t)) return "business_dev";
  if (/\b(export|international|trade|global)\b/.test(t)) return "export_logistics";
  if (/\b(procurement|purchasing|sourcing|buyer)\b/.test(t)) return "procurement_partner";
  return "sales_manager";
}

export function classifyRegion(country?: string | null): Region {
  const c = (country ?? "").toLowerCase();
  if (!c) return "other";
  if (/(china|india|malaysia|thailand|vietnam|indonesia|philippines|singapore|korea|japan|hong kong|taiwan)/.test(c))
    return "asia";
  if (/(united kingdom|uk|england|scotland|wales|ireland|belgium|portugal|spain|france|germany|netherlands|italy|poland|sweden|norway|denmark|finland|switzerland|austria|czech|hungary|romania|greece|bulgaria|slovakia|estonia|latvia|lithuania)/.test(c))
    return "europe";
  if (/(united states|usa|us|canada|mexico)/.test(c)) return "north_america";
  if (/(saudi arabia|uae|emirates|qatar|kuwait|bahrain|oman|jordan|egypt|israel|turkey|iran|iraq)/.test(c))
    return "mena";
  if (/(uganda|kenya|nigeria|ghana|south africa|tanzania|ethiopia|morocco|tunisia|algeria)/.test(c))
    return "africa";
  if (/(australia|new zealand|fiji)/.test(c)) return "oceania";
  return "other";
}

// The email IS the ask: confirm interest + share phone number + 15-min slot.
// Role guidance below shapes HOW we ask, not what we ask for.
const ROLE_GUIDANCE: Record<RoleBucket, { opener: string; close: string }> = {
  executive: {
    opener:
      "Peer-to-peer. They evaluate strategic supply partnerships. Mention the 12-month commitment shape and that they personally are on the shortlist — they decide whether to delegate.",
    close: "Ask for a 15-min call slot at their convenience, or for them to point you to the right deputy. Use language a CEO would respect, not pitch language.",
  },
  senior_sales: {
    opener:
      "Revenue-impact framing. Signal that this is a qualified, funded buyer with real volume — not a fishing expedition. Reference the deal shape (100 containers/mo, multi-year, North America destination).",
    close: "Ask for their best direct phone and a 15-min slot this week — language that respects their pipeline-management instinct.",
  },
  business_dev: {
    opener:
      "Partnership angle. Hint at private-label / channel exclusivity being on the table. They respond to deals where both sides grow.",
    close: "Ask whether they're open to a 15-min scoping call to see if there's a partnership-shape fit; request best number + time.",
  },
  export_logistics: {
    opener:
      "Logistics-first. Mention the destination (Long Beach, CA CFS) and the monthly container cadence. They'll mentally model container utilization while reading.",
    close: "Ask for the best phone for an export-logistics-focused call and their preferred time slot in their time zone.",
  },
  sales_manager: {
    opener:
      "Direct and concrete. They want to know in 10 seconds whether this is worth their week. Lead with volume + that we already shortlisted them.",
    close: "Ask for a phone number and a 15-min slot — or the right colleague to forward to if not them.",
  },
  procurement_partner: {
    opener:
      "Vendor-to-vendor framing. Treat them as a peer setting up a buyer–supplier agreement, not as a sales prospect.",
    close: "Ask whether their vendor-partnership track is open for new buyers at this volume; if yes, request a 15-min onboarding-scope call.",
  },
};

const REGION_NOTES: Record<Region, string> = {
  asia: "Slightly more formal. Acknowledge their manufacturing strength and operating timezone. They often run on relationship-building. Direct factory contact preferred.",
  europe: "Compliance-heavy: CE / EN 455 / ISO 13485 land harder than FDA. Mention regulatory paperwork explicitly. Tone is professional, less casual than US.",
  north_america: "Direct, ROI-focused, fast decision cadence. Pricing transparency matters. Mention domestic-stock vs factory-direct split if relevant.",
  mena: "Formal greeting. Hierarchical decision-making — acknowledge they may need to route internally. Avoid first-name informality in opener.",
  africa: "Capacity-partnership angle. They appreciate being treated as a serious supplier (not an afterthought). Mention growth potential.",
  oceania: "Direct, professional. No special framing needed.",
  other: "Default to a professional, neutral tone. No regional framing.",
};

const TOUCH_NOTES: Record<TouchKind, string> = {
  first_touch: "First contact. Establish credibility quickly, no over-pitching. They have not heard from us before.",
  follow_up_1: "Day +3 nudge after no reply. Acknowledge the prior thread implicitly. Be shorter and more direct. Do not re-pitch the volume — they already saw it.",
  follow_up_2: "Day +7, final touch. Acknowledge this is the last attempt. Offer them an easy 'not a fit' out so we can close the loop. Less pushy.",
};

export async function personalizeForRecipient(
  input: PersonalizationInput,
): Promise<PersonalizationOutput> {
  const roleBucket = classifyRole(input.recipient.title);
  const region = classifyRegion(input.supplier.country);
  const roleGuide = ROLE_GUIDANCE[roleBucket];
  const regionNote = REGION_NOTES[region];
  const touchNote = TOUCH_NOTES[input.touch];

  const supplierFacts: string[] = [`Name: ${input.supplier.name}`];
  if (input.supplier.country) supplierFacts.push(`HQ: ${[input.supplier.city, input.supplier.country].filter(Boolean).join(", ")}`);
  if (input.supplier.employees) supplierFacts.push(`Employees: ${input.supplier.employees}`);
  if (input.supplier.founded) supplierFacts.push(`Founded: ${input.supplier.founded}`);
  if (input.supplier.industry) supplierFacts.push(`Industry: ${input.supplier.industry}`);
  if (input.supplier.keywords) supplierFacts.push(`Keywords: ${input.supplier.keywords}`);

  const recipientFacts: string[] = [];
  if (input.recipient.firstName) recipientFacts.push(`First name: ${input.recipient.firstName}`);
  if (input.recipient.title) recipientFacts.push(`Title: ${input.recipient.title}`);

  const prompt = `You are tuning a short buy-side B2B email for US Pro Glove, a US importer running a 12-month nitrile examination glove sourcing program: roughly **$50M+ annual spend**, 100 × 40HQ containers / month. The sender — Jay Lin — is on **Eastern Time (ET), US**. Destination: Long Beach, CA.

The email is intentionally short. The goal is NOT to pitch the full spec deck. The goal is to qualify interest and book a 15-minute call with a phone number. The full RFQ package only goes to whoever responds.

Your job is to write three things (psLine is optional):
1. OPENER: 1–2 sentences right after the greeting. Identify Jay at US Pro Glove. Lead with the dollar-value of the program (e.g. "~$50M/year"), not just container count — that is the credibility marker procurement reads first. Then reference ONE specific signal about the recipient (preferred: from the research section) OR one supplier fact, explaining why they were shortlisted.
2. CLOSE CTA: 1–2 sentences. Present TWO specific ET time windows that overlap the recipient's likely working hours, and ask for their phone + preferred slot. Do NOT include Jay's phone digits — the template inserts them automatically. Frame it as bilateral commitment, not a one-sided ask.
3. PS LINE: include ONLY for first_touch when the recipient is outside North America. One line acknowledging the timezone gap and Jay's willingness to bend his hours. Skip entirely for US/Canada recipients and for all follow_ups.

Both must feel hand-written by Jay Lin (procurement at US Pro Glove) directly to this specific recipient. No filler, no hype, no emojis, no "I hope this email finds you well." Plainspoken B2B procurement tone.

# Touch type
${input.touch} — ${touchNote}

# Recipient role bucket: ${roleBucket}
${roleGuide.opener}
Closing tone: ${roleGuide.close}

# Supplier region: ${region}
${regionNote}

# Supplier facts
${supplierFacts.join("\n")}

# Recipient facts
${recipientFacts.join("\n") || "(only company-level info available)"}

# Public research signals (use these to reference something REAL about the recipient or their company)
${input.researchContext?.trim() || "(no public signals available — fall back to supplier facts only)"}

Hard rules:
- Never quote pricing or specific spec numbers (those go in the post-call package)
- Never use ALL CAPS, exclamation marks, or marketing language
- Opener: PREFER referencing a specific signal from the public research section (e.g., a recent talk, post, role-shift, podcast appearance, conference mention) — that is what builds genuine interest. Only fall back to a supplier fact (city, country, employee count, founding year, keyword) if no usable research signal exists.
- If you do reference public research, paraphrase the signal — do not quote verbatim, and do not name the source URL.
- NEVER fabricate or extrapolate a signal beyond what the research snippets explicitly state. If a snippet only confirms "X is CEO of Y", do NOT invent things like "your recent factory tour" or "your talk at the conference" — those are hallucinations. When research is thin, default to verifiable supplier facts (founding year, employee count, certifications).
- PS line: if region is asia / europe / mena / africa / oceania AND touch is first_touch, you MUST include a psLine acknowledging the timezone bridge. For north_america / other, do NOT include psLine.
- Close CTA: must end with an ask for a phone number AND a time slot. Do NOT offer a Calendly link or suggest scheduling tools.
- No first names in the body (the greeting handles that)
- Avoid clichés: "circling back", "touching base", "synergies", "leveraging", "best in class"
- For follow_up_1 and follow_up_2: be SHORTER. Do not re-pitch volume — they already saw it.`;

  const result = await trackedGenerateObject({
    task: "draft",
    modelKey: "fast", // Haiku 4.5 is plenty for 2-sentence personalization
    schema: Schema,
    prompt,
    campaignId: input.campaignId,
    prospectId: input.prospectId,
    metadata: { touch: input.touch, roleBucket, region },
  });

  return {
    opener: result.object.opener.trim(),
    closeCta: result.object.closeCta.trim(),
    meta: { roleBucket, region },
  };
}
