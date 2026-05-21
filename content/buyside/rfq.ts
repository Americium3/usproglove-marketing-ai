/**
 * Buy-side first-touch sequence — sourcing nitrile gloves at 100×40HQ/month.
 *
 * Strategy: qualify by response. First touch is a short signal-of-interest
 * email asking only for a phone number + availability. The full RFQ spec deck
 * (FOB by SKU, certs, INCOTERMS, payment terms) goes to whoever replies — sent
 * out-of-band after the call lands.
 *
 * Opener and close CTA can be AI-personalized per recipient (see
 * src/lib/buyside/personalize.ts); the static fallbacks below kick in when
 * personalization is disabled or the AI call fails.
 */

export interface RfqTemplateContext {
  supplierName: string;
  recipientFirstName?: string | null;
  /** Optional AI-generated opener (1–2 sentences) inserted after the greeting. */
  opener?: string | null;
  /** Optional AI-generated close CTA (1–2 sentences) inserted before the signature. */
  closeCta?: string | null;
  /**
   * Optional region-aware PS line (e.g. "P.S. — I take calls late evenings ET
   * to catch your morning hours"). Rendered only on first_touch. AI-generated
   * for non-NA recipients; omitted when null/undefined.
   */
  psLine?: string | null;
  /** Sender phone (E.164 or readable). Surfaces in the close so the ask is bilateral. */
  senderPhone?: string | null;
}

export type TouchKind = "first_touch" | "follow_up_1" | "follow_up_2";

const SENDER_NAME = "Jay Lin";
const SENDER_TITLE = "Procurement, US Pro Glove";

function greeting(ctx: RfqTemplateContext): string {
  const first = ctx.recipientFirstName?.trim();
  if (first) return `Hi ${first},`;
  return `Hello ${ctx.supplierName} team,`;
}

export interface RenderedTouch {
  subject: string;
  textBody: string;
  htmlBody: string;
}

export function renderRfqTouch(kind: TouchKind, ctx: RfqTemplateContext): RenderedTouch {
  switch (kind) {
    case "first_touch":
      return renderFirstTouch(ctx);
    case "follow_up_1":
      return renderFollowUp1(ctx);
    case "follow_up_2":
      return renderFollowUp2(ctx);
  }
}

function renderFirstTouch(ctx: RfqTemplateContext): RenderedTouch {
  const subject = "Nitrile sourcing — ~$50M/yr program, 15 min this week?";
  const lead = greeting(ctx);
  const opener = ctx.opener?.trim()
    ? ctx.opener.trim()
    : `I'm Jay Lin at US Pro Glove (Eastern Time, US). We're running a 12-month nitrile examination glove sourcing program — roughly $50M+ annually, 100 × 40HQ containers / month — and shortlisted ${ctx.supplierName} as one of the manufacturers we'd like to talk to.`;
  const close = ctx.closeCta?.trim()
    ? ctx.closeCta.trim()
    : `${ctx.senderPhone ? `Best to reach me at ${ctx.senderPhone}. ` : ""}I'm holding Wed 8–9 AM ET and Thu 9–10 PM ET for new conversations — pick whichever lands better in your time zone, or reply with the slot and best number that work on your end. I'll send the full spec package right before the call.`;
  const ps = ctx.psLine?.trim() ? `\n\n${ctx.psLine.trim()}` : "";

  const textBody = `${lead}

${opener}

US-registered importer; FDA brand-owner filings on record; DUNS available on request.

Rather than drop a long spec deck cold, I'd like to confirm interest first and align on a quick call.

${close}

Best regards,

${SENDER_NAME}
${SENDER_TITLE}${ps}`;

  return toRendered(subject, textBody);
}

function renderFollowUp1(ctx: RfqTemplateContext): RenderedTouch {
  const subject = "Re: nitrile sourcing — best number to reach you?";
  const lead = greeting(ctx);
  const opener = ctx.opener?.trim()
    ? ctx.opener.trim()
    : "Following up on the note about a 12-month nitrile glove program (~$50M annual, 100 × 40HQ ctn/month).";
  const close = ctx.closeCta?.trim()
    ? ctx.closeCta.trim()
    : `Just need a phone number and a 15-minute slot${ctx.senderPhone ? ` (I'm at ${ctx.senderPhone}, ET hours)` : ""} — or the right contact to forward to if it isn't you.`;

  const textBody = `${lead}

${opener}

${close}

Best regards,

${SENDER_NAME}
${SENDER_TITLE}`;

  return toRendered(subject, textBody);
}

function renderFollowUp2(ctx: RfqTemplateContext): RenderedTouch {
  const subject = "Last note — closing the loop on glove sourcing";
  const lead = greeting(ctx);
  const opener = ctx.opener?.trim()
    ? ctx.opener.trim()
    : "Last note from me on the 12-month nitrile glove program.";
  const close = ctx.closeCta?.trim()
    ? ctx.closeCta.trim()
    : `A one-line reply — "wrong fit", "try later", or a phone number${ctx.senderPhone ? ` (I'm at ${ctx.senderPhone})` : ""} — closes the loop either way. Thanks for the time.`;

  const textBody = `${lead}

${opener}

${close}

Best regards,

${SENDER_NAME}
${SENDER_TITLE}`;

  return toRendered(subject, textBody);
}

function toRendered(subject: string, textBody: string): RenderedTouch {
  const htmlBody = textBody
    .split("\n\n")
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
  return { subject, textBody, htmlBody };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Day offsets (from initial send) at which the next touch fires.
 */
export const TOUCH_CADENCE_DAYS: Record<TouchKind, number> = {
  first_touch: 0,
  follow_up_1: 3,
  follow_up_2: 7,
};
