export interface SenderIdentity {
  name: string;
  email: string;
  replyTo: string;
  title?: string;
  phone?: string;
  companyName?: string;
  companyWebsite?: string;
}

export interface Recipient {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface DraftedBody {
  subject: string;
  textBody: string;
  htmlBody: string;
}

export interface ComposedEmail {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  textContent: string;
  htmlContent: string;
  signatureText: string;
  signatureHtml: string;
}

export function getSenderFromEnv(): SenderIdentity {
  const email = process.env.SENDER_EMAIL;
  const name = process.env.SENDER_NAME ?? "Sender";
  if (!email) throw new Error("SENDER_EMAIL not set");
  return {
    name,
    email,
    replyTo: process.env.SENDER_REPLY_TO ?? email,
    title: process.env.SENDER_TITLE || undefined,
    phone: process.env.SENDER_PHONE || undefined,
    companyName: process.env.SENDER_COMPANY_NAME || undefined,
    companyWebsite: process.env.SENDER_COMPANY_WEBSITE || undefined,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function buildDefaultSignatureText(sender: SenderIdentity): string {
  const lines = ["—", sender.name];
  if (sender.title) lines.push(sender.title);
  if (sender.companyName && !sender.title?.includes(sender.companyName)) {
    lines.push(sender.companyName);
  }
  if (sender.phone) lines.push(sender.phone);
  lines.push(sender.email);
  if (sender.companyWebsite) lines.push(sender.companyWebsite);
  return lines.join("\n");
}

function buildDefaultSignatureHtml(sender: SenderIdentity): string {
  const parts: string[] = ["—<br>", `<b>${escapeHtml(sender.name)}</b><br>`];
  if (sender.title) parts.push(`${escapeHtml(sender.title)}<br>`);
  if (sender.companyName && !sender.title?.includes(sender.companyName)) {
    parts.push(`${escapeHtml(sender.companyName)}<br>`);
  }
  if (sender.phone) parts.push(`${escapeHtml(sender.phone)}<br>`);
  parts.push(`<a href="mailto:${escapeHtml(sender.email)}">${escapeHtml(sender.email)}</a><br>`);
  if (sender.companyWebsite) {
    const label = sender.companyWebsite.replace(/^https?:\/\//, "");
    parts.push(`<a href="${escapeHtml(sender.companyWebsite)}">${escapeHtml(label)}</a>`);
  }
  return `<p style="color:#555;font-size:13px;line-height:1.5;">${parts.join("")}</p>`;
}

function textToSimpleSignatureHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+|[\w.+-]+@[\w.-]+)/g,
    (m) => (m.includes("@") ? `<a href="mailto:${m}">${m}</a>` : `<a href="${m}">${m}</a>`),
  );
  const withBreaks = linked.replace(/\n/g, "<br>");
  return `<p style="color:#555;font-size:13px;line-height:1.5;">${withBreaks}</p>`;
}

export function getSignature(
  sender: SenderIdentity,
  override?: { text?: string | null },
): { text: string; html: string } {
  const perCampaign = override?.text?.trim();
  if (perCampaign) {
    return { text: perCampaign, html: textToSimpleSignatureHtml(perCampaign) };
  }
  const envText = process.env.SENDER_SIGNATURE_TEXT?.trim();
  const envHtml = process.env.SENDER_SIGNATURE_HTML?.trim();
  return {
    text: envText || buildDefaultSignatureText(sender),
    html: envHtml || buildDefaultSignatureHtml(sender),
  };
}

export function formatAddress(nameOrNull: string | undefined | null, email: string): string {
  const name = nameOrNull?.trim();
  return name ? `${name} <${email}>` : email;
}

export function composeEmail(args: {
  draft: DraftedBody;
  sender: SenderIdentity;
  recipient: Recipient;
  signatureOverride?: { text?: string | null };
}): ComposedEmail {
  const { draft, sender, recipient } = args;
  const sig = getSignature(sender, args.signatureOverride);
  const recipientName = [recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || null;

  const textContent = `${draft.textBody.trimEnd()}\n\n${sig.text}\n`;
  const htmlContent = `${draft.htmlBody}\n${sig.html}`;

  return {
    from: formatAddress(sender.name, sender.email),
    to: formatAddress(recipientName, recipient.email),
    replyTo: sender.replyTo,
    subject: draft.subject,
    textContent,
    htmlContent,
    signatureText: sig.text,
    signatureHtml: sig.html,
  };
}
