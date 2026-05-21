import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { runBuysideRfq } from "@/lib/workflow/buyside-rfq";

async function main() {
  const campaignName = "Nitrile RFQ — 100×40HQ/mo";
  const rows = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.name, campaignName))
    .limit(1);
  if (rows.length === 0) {
    console.error(`Campaign not found: ${campaignName}. Run pnpm seed:buyside first.`);
    process.exit(1);
  }
  const c = rows[0];

  // Ensure campaign is at least in 'active' so cron would process it.
  if (c.status !== "active") {
    await db.update(schema.campaigns).set({ status: "active" }).where(eq(schema.campaigns.id, c.id));
    console.log(`Activated campaign ${c.id}`);
  }

  console.log(`Campaign: ${c.name}  status=${c.status}  sender=${c.senderEmail}  cap=${c.dailyCap}`);
  console.log("\nRunning DRY mode — no emails will be sent...\n");

  const result = await runBuysideRfq({
    campaignId: c.id,
    senderEmail: c.senderEmail,
    senderName: c.senderName,
    replyToEmail: c.replyToEmail,
    dailyCap: c.dailyCap,
    dryRun: true,
  });

  console.log("Summary:");
  console.log(`  totalProspects:   ${result.totalProspects}`);
  console.log(`  firstTouchSent:   ${result.firstTouchSent}`);
  console.log(`  followUp1Sent:    ${result.followUp1Sent}`);
  console.log(`  followUp2Sent:    ${result.followUp2Sent}`);
  console.log(`  skippedNotDue:    ${result.skippedNotDue}`);
  console.log(`  skippedReplied:   ${result.skippedReplied}`);
  console.log(`  skippedBlocked:   ${result.skippedBlocked}`);
  console.log(`  failed:           ${result.failed}`);
  console.log(`  newReplies:       ${result.newReplies}`);
  console.log("  pipeline:        ", result.pipeline);

  console.log("\nWould-be actions:");
  for (const a of result.byTouch) {
    console.log(`  [${a.status}]  ${a.touch.padEnd(13)} → ${a.supplierName.padEnd(35)} <${a.email}>`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
