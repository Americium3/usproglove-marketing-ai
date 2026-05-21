/**
 * Seed the buy-side nitrile-glove RFQ campaign:
 *   - Inserts supplier companies (vertical="supplier") from content/buyside/suppliers-enriched.json
 *   - Inserts prospects (sales-side contacts) from content/buyside/suppliers.json
 *   - Creates one campaign in draft status — flip to active to start sending.
 *
 * Idempotent: re-running upserts companies by name and skips existing prospect emails.
 *
 * Run:
 *   pnpm tsx --env-file=.env.local scripts/seed-buyside-rfq.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

interface EnrichedSupplier {
  name: string;
  domain: string;
  country?: string | null;
  city?: string | null;
  state?: string | null;
  employees?: number | null;
  industry?: string | null;
  founded?: number | null;
  phone?: string | null;
  linkedin?: string | null;
  revenue?: string | null;
  keywords?: string | null;
}

interface SupplierContacts {
  supplier: string;
  domain: string;
  country?: string | null;
  contacts: Array<{
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
    title?: string | null;
    email: string;
    emailStatus?: string | null;
    linkedin?: string | null;
  }>;
}

async function main() {
  const root = resolve(__dirname, "..");
  const enriched: EnrichedSupplier[] = JSON.parse(
    readFileSync(resolve(root, "content/buyside/suppliers-enriched.json"), "utf-8"),
  );
  const contactsByDomain: Record<string, SupplierContacts> = JSON.parse(
    readFileSync(resolve(root, "content/buyside/suppliers.json"), "utf-8"),
  );

  const enrichedByDomain = new Map<string, EnrichedSupplier>();
  for (const s of enriched) enrichedByDomain.set(s.domain, s);

  let companyInserts = 0;
  let companyUpdates = 0;
  let prospectInserts = 0;
  let prospectSkips = 0;

  // 1. Upsert supplier companies (we key on website + name since we don't have google_place_id)
  const companyIdByDomain = new Map<string, string>();
  for (const [domain, payload] of Object.entries(contactsByDomain)) {
    const meta = enrichedByDomain.get(domain) ?? ({ name: payload.supplier, domain } as EnrichedSupplier);
    const country = (meta.country ?? payload.country ?? "").toString();
    const countryCode = inferCountryCode(country);

    const existing = await db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(and(eq(schema.companies.vertical, "supplier"), eq(schema.companies.name, payload.supplier)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(schema.companies)
        .set({
          website: `https://${domain}`,
          phone: meta.phone ?? undefined,
          city: meta.city ?? undefined,
          region: meta.state ?? undefined,
          countryCode,
          subVertical: meta.industry ?? undefined,
          metadata: {
            employees: meta.employees,
            founded: meta.founded,
            revenue: meta.revenue,
            linkedin: meta.linkedin,
            keywords: meta.keywords,
            apolloDomain: domain,
          },
          updatedAt: new Date(),
        })
        .where(eq(schema.companies.id, existing[0].id));
      companyIdByDomain.set(domain, existing[0].id);
      companyUpdates += 1;
      continue;
    }

    const inserted = await db
      .insert(schema.companies)
      .values({
        name: payload.supplier,
        website: `https://${domain}`,
        phone: meta.phone ?? undefined,
        city: meta.city ?? undefined,
        region: meta.state ?? undefined,
        countryCode,
        vertical: "supplier",
        subVertical: meta.industry ?? undefined,
        discoverySourceId: "apollo",
        metadata: {
          employees: meta.employees,
          founded: meta.founded,
          revenue: meta.revenue,
          linkedin: meta.linkedin,
          keywords: meta.keywords,
          apolloDomain: domain,
        },
      })
      .returning({ id: schema.companies.id });
    companyIdByDomain.set(domain, inserted[0].id);
    companyInserts += 1;
  }

  // 2. Insert prospects, skip existing emails.
  for (const [domain, payload] of Object.entries(contactsByDomain)) {
    const companyId = companyIdByDomain.get(domain);
    if (!companyId) continue;
    for (const c of payload.contacts) {
      const email = c.email.toLowerCase();
      const existing = await db
        .select({ id: schema.prospects.id })
        .from(schema.prospects)
        .where(eq(schema.prospects.email, email))
        .limit(1);
      if (existing.length > 0) {
        prospectSkips += 1;
        continue;
      }
      await db.insert(schema.prospects).values({
        companyId,
        email,
        firstName: c.firstName ?? undefined,
        lastName: c.lastName ?? undefined,
        role: c.title ?? undefined,
        status: "enriched",
        enrichmentSourceId: "apollo",
        enrichmentConfidence: c.emailStatus === "verified" ? 90 : 50,
        metadata: {
          apolloLinkedin: c.linkedin,
          source: "buyside_rfq_seed",
        },
      });
      prospectInserts += 1;
    }
  }

  // 3. Create or refresh the RFQ campaign (one per name; we don't insert duplicates).
  // Buy-side sender is intentionally NOT derived from SENDER_EMAIL (which the
  // sell-side flow uses for usproglove.us). RFQs go from the .com identity.
  const senderEmail = process.env.BUYSIDE_SENDER_EMAIL ?? "jay.lin@usproglove.com";
  const senderName = process.env.BUYSIDE_SENDER_NAME ?? "Jay Lin";
  const replyToEmail = process.env.BUYSIDE_REPLY_TO ?? senderEmail;
  const dailyCap = Number(process.env.BUYSIDE_DAILY_CAP ?? 30);

  const campaignName = "Nitrile RFQ — 100×40HQ/mo";
  const existingCampaign = await db
    .select({ id: schema.campaigns.id, status: schema.campaigns.status })
    .from(schema.campaigns)
    .where(and(eq(schema.campaigns.vertical, "supplier"), eq(schema.campaigns.name, campaignName)))
    .limit(1);

  let campaignId: string;
  if (existingCampaign.length > 0) {
    campaignId = existingCampaign[0].id;
    await db
      .update(schema.campaigns)
      .set({
        senderEmail,
        senderName,
        replyToEmail,
        dailyCap,
        contactsPerCompany: 2,
        updatedAt: new Date(),
      })
      .where(eq(schema.campaigns.id, campaignId));
    console.log(`Updated existing buyside campaign: ${campaignId} (status=${existingCampaign[0].status})`);
  } else {
    const [row] = await db
      .insert(schema.campaigns)
      .values({
        name: campaignName,
        vertical: "supplier",
        heroSkuId: "3.0", // sentinel — buy-side doesn't sell, but the schema requires it
        status: "draft",
        dailyCap,
        contactsPerCompany: 2,
        promptTemplate: "content/buyside/rfq.ts", // pointer, not used by the runner
        senderEmail,
        senderName,
        replyToEmail,
      })
      .returning({ id: schema.campaigns.id });
    campaignId = row.id;
    console.log(`Created buyside campaign: ${campaignId}`);
  }

  console.log("");
  console.log("Seed summary:");
  console.log(`  companies inserted: ${companyInserts}, updated: ${companyUpdates}`);
  console.log(`  prospects inserted: ${prospectInserts}, skipped (existing email): ${prospectSkips}`);
  console.log(`  campaign id: ${campaignId}`);
  console.log("");
  console.log("Next steps:");
  console.log(`  1. Dry-run (no email sent):  curl -H "Authorization: Bearer $CRON_SECRET" "$APP_BASE_URL/api/cron/buyside-rfq?dry=1"`);
  console.log(`  2. Activate the campaign:    UPDATE campaigns SET status='active' WHERE id='${campaignId}';`);
  console.log(`  3. Trigger live run:         curl -H "Authorization: Bearer $CRON_SECRET" "$APP_BASE_URL/api/cron/buyside-rfq"`);
}

function inferCountryCode(country: string | null | undefined): string {
  if (!country) return "US";
  const map: Record<string, string> = {
    "United States": "US",
    "United Kingdom": "GB",
    Thailand: "TH",
    China: "CN",
    India: "IN",
    Malaysia: "MY",
    Belgium: "BE",
    Canada: "CA",
    Portugal: "PT",
    Australia: "AU",
    Uganda: "UG",
    "Saudi Arabia": "SA",
  };
  return map[country] ?? "US";
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
