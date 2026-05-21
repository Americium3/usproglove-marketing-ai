/**
 * Render 3 sample personalized emails (research + AI opener/close/PS) for
 * representative recipient types. Runs against the actual DB / Apollo /
 * Serper / AI stack — useful to eyeball wording before flipping the cron live.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { gatherProspectResearch, renderResearchForPrompt } from "@/lib/buyside/research";
import { personalizeForRecipient } from "@/lib/buyside/personalize";
import { renderRfqTouch, type TouchKind } from "@/../content/buyside/rfq";

const TARGETS = [
  { email: "kgold@ammex.com", label: "US Executive (CEO)" },
  { email: "stevea@eagleprotect.com", label: "US Executive (small co.)" },
  { email: "jasmine.chu@3aglove.com", label: "Asia Sales (factory direct)" },
];

const COUNTRY_BY_CODE: Record<string, string> = {
  US: "United States", GB: "United Kingdom", TH: "Thailand", CN: "China",
  IN: "India", MY: "Malaysia", BE: "Belgium", CA: "Canada", PT: "Portugal",
  AU: "Australia", UG: "Uganda", SA: "Saudi Arabia",
};

async function main() {
  const campaign = (
    await db.select().from(schema.campaigns).where(eq(schema.campaigns.vertical, "supplier")).limit(1)
  )[0];
  if (!campaign) throw new Error("Buyside campaign not found");

  for (const t of TARGETS) {
    const rows = await db
      .select({
        id: schema.prospects.id,
        firstName: schema.prospects.firstName,
        lastName: schema.prospects.lastName,
        role: schema.prospects.role,
        email: schema.prospects.email,
        companyName: schema.companies.name,
        companyCity: schema.companies.city,
        companyRegion: schema.companies.region,
        companyCountryCode: schema.companies.countryCode,
        companyMetadata: schema.companies.metadata,
        companySubVertical: schema.companies.subVertical,
      })
      .from(schema.prospects)
      .innerJoin(schema.companies, eq(schema.prospects.companyId, schema.companies.id))
      .where(eq(schema.prospects.email, t.email))
      .limit(1);
    if (rows.length === 0) {
      console.log(`SKIP: ${t.email} — not in DB`);
      continue;
    }
    const p = rows[0];
    const meta = (p.companyMetadata ?? {}) as Record<string, unknown>;

    console.log("\n" + "=".repeat(78));
    console.log(`${t.label} → ${p.firstName} ${p.lastName} (${p.role}) @ ${p.companyName}`);
    console.log("=".repeat(78));

    const research = await gatherProspectResearch({
      prospectId: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      title: p.role,
      supplierName: p.companyName,
      supplierDomain: typeof meta.apolloDomain === "string" ? meta.apolloDomain : null,
    });

    console.log("\n--- research ---");
    console.log(`linkedin hits: ${research.linkedin.length} | web hits: ${research.web.length}`);
    for (const s of research.linkedin.slice(0, 1)) console.log(`  LI: ${s.title.slice(0, 90)}`);
    for (const s of research.web.slice(0, 2)) console.log(`  WEB: ${s.title.slice(0, 90)}`);

    const personalized = await personalizeForRecipient({
      campaignId: campaign.id,
      prospectId: p.id,
      touch: "first_touch" as TouchKind,
      recipient: { firstName: p.firstName, title: p.role },
      supplier: {
        name: p.companyName,
        country: COUNTRY_BY_CODE[p.companyCountryCode ?? ""] ?? p.companyRegion,
        city: p.companyCity,
        employees: typeof meta.employees === "number" ? meta.employees : null,
        founded: typeof meta.founded === "number" ? meta.founded : null,
        industry: p.companySubVertical,
        keywords: typeof meta.keywords === "string" ? meta.keywords : null,
      },
      researchContext: renderResearchForPrompt(research),
    });

    console.log(`\n--- personalization meta ---`);
    console.log(`  role: ${personalized.meta.roleBucket} | region: ${personalized.meta.region}`);

    // Mirror runner-side fallback: non-NA region on first_touch always gets a PS.
    let psLine = personalized.psLine;
    if (!psLine && personalized.meta.region !== "north_america" && personalized.meta.region !== "other") {
      const fallback: Record<string, string> = {
        asia: "P.S. — happy to take your morning calls; ET evenings (= your mornings) are convenient on my side.",
        europe: "P.S. — early AM ET overlaps with your afternoon; I'll arrange around your hours.",
        mena: "P.S. — happy to take a call in your morning; ET mornings line up well with your afternoons.",
        africa: "P.S. — flexible with hours on my side; happy to take a call during your business day.",
        oceania: "P.S. — happy to take a late-evening ET call; that's your business morning.",
      };
      psLine = fallback[personalized.meta.region];
    }

    const rendered = renderRfqTouch("first_touch", {
      supplierName: p.companyName,
      recipientFirstName: p.firstName,
      opener: personalized.opener,
      closeCta: personalized.closeCta,
      psLine,
      senderPhone: process.env.SENDER_PHONE || null,
    });

    console.log(`\n--- rendered email ---`);
    console.log(`Subject: ${rendered.subject}`);
    console.log("");
    console.log(rendered.textBody);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
