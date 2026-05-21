import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

// Lazy init: build-time module evaluation (e.g. Next.js 16 "collect page data")
// must not crash if DATABASE_URL is absent in that sandbox. The throw fires on
// first actual query, so any runtime call still fails loudly when the env is
// genuinely missing.
let cached: Db | null = null;
function getDb(): Db {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  cached = drizzle(neon(url), { schema });
  return cached;
}

export const db = new Proxy({} as Db, {
  get(_target, prop) {
    return Reflect.get(getDb() as object, prop);
  },
}) as Db;

export { schema };
