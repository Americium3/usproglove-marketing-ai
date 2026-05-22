import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export function slugify(input: string, maxLen = 80): string {
  const base = input
    .toLowerCase()
    .replace(/['"’]/g, "")
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
    .replace(/-+$/g, "");
  return base || `post-${Date.now().toString(36)}`;
}

export async function uniqueSlug(
  title: string,
  locale: string,
  options: { excludeId?: string } = {},
): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  let n = 1;
  while (true) {
    const rows = await db
      .select({ id: schema.contentPieces.id })
      .from(schema.contentPieces)
      .where(and(eq(schema.contentPieces.slug, candidate), eq(schema.contentPieces.locale, locale)))
      .limit(1);
    const conflict = rows[0];
    if (!conflict || conflict.id === options.excludeId) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}
