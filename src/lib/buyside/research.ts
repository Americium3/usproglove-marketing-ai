/**
 * Per-prospect research — runs 2–3 targeted web searches to surface public
 * content about the target (LinkedIn profile signal, recent interviews,
 * conference talks, press mentions). Output is fed into the personalization
 * prompt so the AI opener can reference something real, not a hallucination.
 *
 * Idempotent: results are cached in prospects.metadata.research so we don't
 * burn search credits on retries / dry-runs.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { webSearch, type WebSearchResult } from "@/lib/search/serper";

export interface ResearchSnippet {
  title: string;
  url: string;
  snippet: string;
  source: "linkedin" | "web";
}

export interface ProspectResearch {
  /** ISO timestamp when this was gathered. */
  gatheredAt: string;
  /** LinkedIn-specific findings, up to 3. */
  linkedin: ResearchSnippet[];
  /** Other public content (articles, interviews, conference talks), up to 4. */
  web: ResearchSnippet[];
  /** Short queries we ran, for audit. */
  queries: string[];
}

const RESEARCH_TTL_DAYS = 14;

export interface ResearchInput {
  prospectId: string;
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  supplierName: string;
  supplierDomain?: string | null;
  /** Pre-populated LinkedIn URL from Apollo, if available. */
  knownLinkedinUrl?: string | null;
}

/**
 * Fetch research for a prospect, using cached metadata if fresh.
 * On any failure (network, API limits), returns an empty research bundle
 * rather than throwing — research is value-add, not load-bearing.
 */
export async function gatherProspectResearch(
  input: ResearchInput,
): Promise<ProspectResearch> {
  const cached = await loadCachedResearch(input.prospectId);
  if (cached) return cached;

  const queries: string[] = [];
  const linkedin: ResearchSnippet[] = [];
  const web: ResearchSnippet[] = [];

  const fullName = [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
  if (!fullName) {
    // Without a name we can only do company-level research, which we already have
    // via Apollo enrichment. Skip the search burn.
    return persist(input.prospectId, { gatheredAt: new Date().toISOString(), linkedin, web, queries });
  }

  // Query 1 — LinkedIn profile + activity. Use site: filter for high precision.
  const linkedinQuery = `site:linkedin.com "${fullName}" "${input.supplierName}"`;
  queries.push(linkedinQuery);
  try {
    const r = await webSearch(linkedinQuery, { num: 5 });
    for (const item of r.results.slice(0, 3)) {
      linkedin.push(toSnippet(item, "linkedin"));
    }
  } catch (err) {
    console.warn(`[buyside/research] linkedin search failed for ${fullName}: ${(err as Error).message}`);
  }

  // Query 2 — Public content (interviews, conference talks, press). Exclude LinkedIn
  // so we get a different content surface than query 1.
  const titleHint = input.title ? `"${shortTitle(input.title)}"` : "";
  const webQuery = `"${fullName}" "${input.supplierName}" ${titleHint} -site:linkedin.com`.trim();
  queries.push(webQuery);
  try {
    const r = await webSearch(webQuery, { num: 8 });
    for (const item of r.results.slice(0, 4)) {
      web.push(toSnippet(item, "web"));
    }
  } catch (err) {
    console.warn(`[buyside/research] web search failed for ${fullName}: ${(err as Error).message}`);
  }

  const research: ProspectResearch = {
    gatheredAt: new Date().toISOString(),
    linkedin,
    web,
    queries,
  };
  return persist(input.prospectId, research);
}

function toSnippet(item: WebSearchResult, source: "linkedin" | "web"): ResearchSnippet {
  return {
    title: item.title.slice(0, 200),
    url: item.link,
    snippet: (item.snippet ?? "").slice(0, 320),
    source,
  };
}

function shortTitle(title: string): string {
  // Trim noise: "Vice President of Sales — Americas, Healthcare Channel" → "Vice President of Sales"
  return title.split(/[,—–\-(]/)[0].trim().slice(0, 60);
}

async function loadCachedResearch(prospectId: string): Promise<ProspectResearch | null> {
  const rows = await db
    .select({ metadata: schema.prospects.metadata })
    .from(schema.prospects)
    .where(eq(schema.prospects.id, prospectId))
    .limit(1);
  const meta = (rows[0]?.metadata ?? {}) as Record<string, unknown>;
  const research = meta.research as ProspectResearch | undefined;
  if (!research?.gatheredAt) return null;
  const ageMs = Date.now() - new Date(research.gatheredAt).getTime();
  if (ageMs > RESEARCH_TTL_DAYS * 24 * 60 * 60 * 1000) return null;
  return research;
}

async function persist(prospectId: string, research: ProspectResearch): Promise<ProspectResearch> {
  try {
    const rows = await db
      .select({ metadata: schema.prospects.metadata })
      .from(schema.prospects)
      .where(eq(schema.prospects.id, prospectId))
      .limit(1);
    const current = (rows[0]?.metadata ?? {}) as Record<string, unknown>;
    await db
      .update(schema.prospects)
      .set({ metadata: { ...current, research }, updatedAt: new Date() })
      .where(eq(schema.prospects.id, prospectId));
  } catch (err) {
    console.warn(`[buyside/research] failed to persist research: ${(err as Error).message}`);
  }
  return research;
}

/**
 * Render research as a compact bullet list for an AI prompt.
 * Caps total length so we don't blow the context window.
 */
export function renderResearchForPrompt(research: ProspectResearch): string {
  const lines: string[] = [];
  if (research.linkedin.length > 0) {
    lines.push("LinkedIn signals:");
    for (const s of research.linkedin) {
      lines.push(`- ${s.title} — ${s.snippet}`);
    }
  }
  if (research.web.length > 0) {
    lines.push("");
    lines.push("Other public content:");
    for (const s of research.web) {
      lines.push(`- ${s.title} — ${s.snippet}`);
    }
  }
  if (lines.length === 0) return "(no public signals found via web search)";
  // Cap at ~2000 chars to keep the AI prompt bounded.
  const joined = lines.join("\n");
  return joined.length > 2000 ? `${joined.slice(0, 2000)}…` : joined;
}
