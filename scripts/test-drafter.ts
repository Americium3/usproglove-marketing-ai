/**
 * Local-only drafter smoke test. Bypasses prospect discovery, DB, Apollo,
 * Serper — just hits the AI Gateway with the same prompt + schema that the
 * outbound cron uses, and prints subject / text / html.
 *
 * Required env: AI_GATEWAY_API_KEY (already in .env.local).
 * Usage:
 *   pnpm tsx --env-file=.env.local scripts/test-drafter.ts
 *   pnpm tsx --env-file=.env.local scripts/test-drafter.ts --case medical
 *   pnpm tsx --env-file=.env.local scripts/test-drafter.ts --case automotive --no-kb
 */
import { generateObject } from "ai";
import { z } from "zod";
import { models } from "@/lib/ai/gateway";
import { products, heroSkuByVertical } from "@/../content/catalog/products";
import type { Vertical } from "@/../content/catalog/products";
import { fixtures, type Fixture } from "./fixtures/drafter-samples";

const DraftSchema = z.object({
  subject: z.string().min(6).max(80),
  textBody: z.string().min(40).max(1200),
  htmlBody: z.string().min(40),
});

function draftPrompt(args: {
  company: string;
  vertical: Vertical;
  contactName?: string;
  heroSkuName: string;
  positioning: string[];
  knowledgeSnippets?: string[];
}): string {
  const kbBlock = args.knowledgeSnippets && args.knowledgeSnippets.length > 0
    ? `\nReference language from our internal knowledge base (objection responses, certifications, vertical-specific positioning). You may borrow phrasing or factual claims, but do not copy any snippet verbatim or quote it. Treat it as background, not boilerplate:\n---\n${args.knowledgeSnippets.join("\n---\n")}\n---\n`
    : "";

  return `Draft a short B2B cold outreach email — 3 short paragraphs, plainspoken, no marketing fluff, no emojis.

Company: ${args.company}
Vertical: ${args.vertical}
Contact: ${args.contactName ?? "there"}
Hero product: ${args.heroSkuName}
Product positioning: ${args.positioning.join(", ")}
${kbBlock}
Rules:
- Subject < 55 chars, curiosity over claim
- Open line references something specific to ${args.vertical} work (not "I was looking at your website")
- One concrete value bullet tied to the product positioning
- Close with a single soft CTA (reply to get a sample pack)
- Plaintext + HTML variants. HTML is semantic, no inline styles beyond <b> and <a>.
- No "Dear", no "I hope this finds you well".`;
}

async function runOne(fx: Fixture, opts: { useKb: boolean }) {
  const heroSku =
    products.find((p) => p.id === fx.heroSkuId) ??
    products.find((p) => p.id === heroSkuByVertical[fx.vertical])!;

  const prompt = draftPrompt({
    company: fx.company,
    vertical: fx.vertical,
    contactName: fx.contactFirstName,
    heroSkuName: heroSku.name,
    positioning: heroSku.positioning,
    knowledgeSnippets: opts.useKb ? fx.knowledgeSnippets : undefined,
  });

  const result = await generateObject({
    model: models.primary,
    schema: DraftSchema,
    prompt,
  });

  const banner = `${fx.label} — vertical=${fx.vertical} sku=${heroSku.id} kb=${opts.useKb ? "ON" : "OFF"}`;
  console.log("\n" + "=".repeat(banner.length));
  console.log(banner);
  console.log("=".repeat(banner.length));
  console.log(`SUBJECT: ${result.object.subject}\n`);
  console.log("--- TEXT ---");
  console.log(result.object.textBody);
  console.log("\n--- HTML ---");
  console.log(result.object.htmlBody);
  console.log(`\n[tokens in=${result.usage?.inputTokens ?? "?"} out=${result.usage?.outputTokens ?? "?"}]`);
}

async function main() {
  const args = process.argv.slice(2);
  const caseFlag = args.indexOf("--case");
  const selected = caseFlag >= 0 ? args[caseFlag + 1] : null;
  const noKb = args.includes("--no-kb");
  const withKb = args.includes("--kb-only");

  const cases = selected
    ? fixtures.filter((f) => f.id === selected)
    : fixtures;
  if (cases.length === 0) {
    console.error(`No fixture matches --case ${selected}. Available: ${fixtures.map((f) => f.id).join(", ")}`);
    process.exit(1);
  }

  for (const fx of cases) {
    if (!withKb) await runOne(fx, { useKb: false });
    if (!noKb && fx.knowledgeSnippets && fx.knowledgeSnippets.length > 0) {
      await runOne(fx, { useKb: true });
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
