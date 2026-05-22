import { NextResponse } from "next/server";
import { trackCronRun, inferTrigger } from "@/lib/cron/tracker";
import { publishDuePieces } from "@/lib/content/publish";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await trackCronRun("content-publish", inferTrigger(request), async () => {
    const { published } = await publishDuePieces();
    return { published: published.length, items: published };
  });
  return NextResponse.json({ ok: true, ...summary });
}
