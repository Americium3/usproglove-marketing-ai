/**
 * Idempotently (re)creates QStash schedules pointing at /api/cron/* endpoints.
 *
 * Required env:
 *   QSTASH_TOKEN   — from Upstash console (Vercel Marketplace or upstash.com)
 *   APP_BASE_URL   — PUBLIC https URL of the Vercel deployment (not localhost)
 *   CRON_SECRET    — same value set in Vercel env; sent as Bearer to /api/cron/*
 *
 * Run:
 *   APP_BASE_URL=https://<your-vercel-url> pnpm qstash:setup
 */
import { Client } from "@upstash/qstash";

const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
const APP_BASE_URL = process.env.APP_BASE_URL;
const CRON_SECRET = process.env.CRON_SECRET;

if (!QSTASH_TOKEN) throw new Error("QSTASH_TOKEN not set");
if (!APP_BASE_URL) throw new Error("APP_BASE_URL not set");
if (!CRON_SECRET) throw new Error("CRON_SECRET not set");
if (!APP_BASE_URL.startsWith("https://")) {
  throw new Error(`APP_BASE_URL must be https://... (got ${APP_BASE_URL}) — QStash cannot hit localhost`);
}

const schedules = [
  { name: "outbound", cron: "0 */4 * * *", path: "/api/cron/outbound" },
  { name: "follow-up", cron: "0 16 * * *", path: "/api/cron/follow-up" },
  { name: "reply-poll", cron: "*/15 * * * *", path: "/api/cron/reply-poll" },
  { name: "content-publish", cron: "0 9 * * *", path: "/api/cron/content-publish" },
  { name: "usage-snapshot", cron: "0 0 * * *", path: "/api/cron/usage-snapshot" },
  // buyside-rfq is intentionally NOT here — it runs from GitHub Actions
  // (.github/workflows/buyside-rfq-daily.yml). Keep this list as the single
  // source of truth for QStash; do not re-add buyside-rfq unless you also
  // disable the GitHub workflow, otherwise both will fire daily.
];

async function main() {
  const client = new Client({ token: QSTASH_TOKEN! });

  const existing = await client.schedules.list();
  for (const s of existing) {
    if (s.destination?.startsWith(APP_BASE_URL!)) {
      await client.schedules.delete(s.scheduleId);
      console.log(`× deleted ${s.scheduleId} → ${s.destination}`);
    }
  }

  for (const s of schedules) {
    const destination = `${APP_BASE_URL}${s.path}`;
    const result = await client.schedules.create({
      destination,
      cron: s.cron,
      method: "GET",
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    });
    console.log(`+ ${s.name.padEnd(18)} ${s.cron.padEnd(14)} ${destination}  [${result.scheduleId}]`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
