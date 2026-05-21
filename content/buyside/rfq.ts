/**
 * Buy-side RFQ — sourcing nitrile gloves at 100×40HQ containers / month.
 * Templates are intentionally static (not AI-drafted) so suppliers see a
 * consistent spec across the touch sequence.
 */

export interface RfqTemplateContext {
  supplierName: string;
  recipientFirstName?: string | null;
}

export type TouchKind = "first_touch" | "follow_up_1" | "follow_up_2";

const SENDER_NAME = "Jay Lin";
const SENDER_TITLE = "Procurement, US Pro Glove";
const QUOTE_DUE = "June 5, 2026";

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
  const subject = "RFQ — Nitrile Exam Gloves, 100×40HQ/month, Long-Term Supply";
  const lead = greeting(ctx);
  const textBody = `${lead}

I'm reaching out on behalf of US Pro Glove to open a sourcing conversation for a long-term nitrile examination glove supply. We are evaluating qualified manufacturers for a recurring program starting Q3 2026.

Volume & Cadence
- 100 × 40' HQ containers / month, rolling 12-month PO commitment
- Initial trial: 5 containers, balance ramping over 60 days post-approval
- Destination: Long Beach, CA (CFS); additional consignees on award

Product Requirements (mixed across SKUs; finalized at PO)
- Nitrile exam, powder-free, latex-free
- Thickness: 3.0 / 3.5 / 5.0 mil (split TBD)
- Length: ≥ 240 mm
- Colors: Ice Blue, Black, Cobalt Blue, White, Pink
- Sizes: XS / S / M / L / XL — full size run per shipment
- Pack: 100 or 200 per box; 10 boxes/case; master carton
- Tensile strength: ≥ 16 MPa, before and after aging
- Certifications: FDA 510(k), ASTM D6319, EN 455, CE; chemo-rated preferred; ASTM D6978 for 5.0 mil
- Branding: private label — US Pro Glove artwork & SKUs

Please quote
1. FOB unit price by SKU/thickness, USD, current quarter
2. CIF Long Beach unit price for benchmarking
3. MOQ per SKU and per container
4. Lead time from PO confirmation and from artwork approval
5. Payment terms (we will entertain 30% T/T deposit / 70% against B/L copy, or LC at sight)
6. Capacity confirmation — can you reliably commit 100 containers / month? If not, firm monthly ceiling?
7. Sample policy — 1 box per thickness/color; freight account on request

Documents with quote
- Latest FDA 510(k) clearance letter
- Independent ASTM D6319 / EN 455 test reports (within 12 months)
- Factory audit report (ISO 13485 / FDA EIR / SMETA if available)
- Production capacity letter on letterhead
- Two reference customers in North America (NDA acceptable)

Timeline
- Quote due: ${QUOTE_DUE}
- Sample evaluation: mid-June to early July
- PO issuance: July 15, 2026

Award favors manufacturers (not traders) with verifiable monthly output, FDA-cleared lines, and a track record of consistent QC on chemo-rated nitrile. Reply on this thread and I'll respond within one business day.

Best regards,

${SENDER_NAME}
${SENDER_TITLE}`;

  const htmlBody = textBody
    .split("\n\n")
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");

  return { subject, textBody, htmlBody };
}

function renderFollowUp1(ctx: RfqTemplateContext): RenderedTouch {
  const subject = "Re: RFQ — Nitrile Exam Gloves, 100×40HQ/month";
  const lead = greeting(ctx);
  const textBody = `${lead}

Following up on the RFQ I sent earlier for 100 × 40HQ containers of nitrile exam gloves per month.

A quick read on your interest is enough at this stage. If the volume fits your capacity, the next step is just FOB unit prices by thickness plus your latest FDA 510(k) clearance letter and a recent ASTM D6319 / EN 455 report.

If you cannot commit to 100 containers / month, please share the firm ceiling you can support — we are willing to allocate across more than one manufacturer.

Quote window closes ${QUOTE_DUE}. Happy to set up a 20-minute call if it's faster than email.

Best regards,

${SENDER_NAME}
${SENDER_TITLE}`;

  const htmlBody = textBody
    .split("\n\n")
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");

  return { subject, textBody, htmlBody };
}

function renderFollowUp2(ctx: RfqTemplateContext): RenderedTouch {
  const subject = "Last note — Nitrile RFQ closes soon";
  const lead = greeting(ctx);
  const textBody = `${lead}

Final note from me on the 100 × 40HQ / month nitrile exam glove RFQ.

If quoting isn't the right fit right now, a one-line reply ("not at this volume" / "wrong fit" / "try again next quarter") helps us close the loop. Otherwise we'll assume capacity is the constraint and move on.

If interest is there but timing is tight, even a partial quote (price + capacity ceiling only) by ${QUOTE_DUE} keeps you in consideration.

Thanks either way,

${SENDER_NAME}
${SENDER_TITLE}`;

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
 * Day offsets (from initial send) at which the next touch should fire.
 * Designed so the full sequence wraps before the quote deadline.
 */
export const TOUCH_CADENCE_DAYS: Record<TouchKind, number> = {
  first_touch: 0,
  follow_up_1: 3,
  follow_up_2: 7,
};
