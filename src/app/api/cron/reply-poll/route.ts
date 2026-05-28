import { NextResponse } from "next/server";
import { ingestReplies } from "@/lib/email/reply-poller";
import { trackCronRun, inferTrigger } from "@/lib/cron/tracker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await trackCronRun("reply-poll", inferTrigger(request), async () => {
      const since = new Date(Date.now() - 30 * 60 * 1000);
      const r = await ingestReplies(since);
      return { ...r, since: since.toISOString() };
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 200 });
  }
}
