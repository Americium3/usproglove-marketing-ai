import type { EnrichedContact, EnrichmentProvider, EnrichmentQuery } from "../types";

const APOLLO_BASE = "https://api.apollo.io/api/v1";
// People Search no longer returns emails — each must be unlocked via people/match,
// which costs one enrich credit. Cap matches per domain to bound credit spend.
const MAX_MATCH_PER_DOMAIN = 5;

interface ApolloPerson {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  email?: string;
  email_status?: "verified" | "unverified" | "likely to engage" | "unavailable" | string;
  has_email?: boolean;
  organization?: { primary_domain?: string; website_url?: string };
}

function confidenceFor(status?: string): number {
  if (status === "verified") return 90;
  if (status === "likely to engage") return 70;
  if (status === "unverified") return 40;
  return 20;
}

function isUsableEmail(email: string | undefined): email is string {
  if (!email) return false;
  if (email.includes("email_not_unlocked")) return false;
  return email.includes("@");
}

const HEADERS = (key: string) => ({
  "Content-Type": "application/json",
  "Cache-Control": "no-cache",
  "x-api-key": key,
});

export const apolloProvider: EnrichmentProvider = {
  id: "a3",

  async find(query: EnrichmentQuery): Promise<EnrichedContact[]> {
    const key = process.env.APOLLO_API_KEY;
    if (!key) return [];
    if (!query.domain) return [];

    // 1) Search people at the domain. The legacy /v1/mixed_people/search is
    // deprecated (HTTP 422); the current endpoint is /api/v1/mixed_people/api_search
    // and takes its filters in the query string. It returns people with `has_email`
    // but NOT the address itself.
    const qs = new URLSearchParams();
    qs.append("q_organization_domains_list[]", query.domain);
    qs.append("page", "1");
    qs.append("per_page", "10");
    const sres = await fetch(`${APOLLO_BASE}/mixed_people/api_search?${qs}`, {
      method: "POST",
      headers: HEADERS(key),
    });
    if (!sres.ok) return [];

    const sdata = (await sres.json()) as { people?: ApolloPerson[] };
    let candidates = (sdata.people ?? []).filter((p) => p.has_email && p.id);
    if (candidates.length === 0) return [];

    // Soft role preference (same rationale as Hunter): prefer matching titles but
    // fall back to all, so a domain with real contacts is never dropped to zero.
    const roles = query.rolesOfInterest;
    if (roles?.length) {
      const matched = candidates.filter((p) =>
        roles.some((r) => p.title?.toLowerCase().includes(r.toLowerCase())),
      );
      if (matched.length > 0) candidates = matched;
    }
    candidates = candidates.slice(0, MAX_MATCH_PER_DOMAIN);

    // 2) Unlock each email via people/match (one credit each).
    const contacts: EnrichedContact[] = [];
    for (const c of candidates) {
      const mres = await fetch(`${APOLLO_BASE}/people/match`, {
        method: "POST",
        headers: HEADERS(key),
        body: JSON.stringify({ id: c.id, reveal_personal_emails: false }),
      });
      if (!mres.ok) continue;
      const mdata = (await mres.json()) as { person?: ApolloPerson };
      const p = mdata.person;
      if (!p || !isUsableEmail(p.email)) continue;
      contacts.push({
        email: p.email.toLowerCase(),
        firstName: p.first_name,
        lastName: p.last_name,
        role: p.title,
        confidence: confidenceFor(p.email_status),
      });
    }
    return contacts;
  },

  async verify(email: string) {
    const key = process.env.APOLLO_API_KEY;
    if (!key) return { deliverable: false, score: 0 };

    const res = await fetch(`${APOLLO_BASE}/people/match`, {
      method: "POST",
      headers: HEADERS(key),
      body: JSON.stringify({ email, reveal_personal_emails: false }),
    });
    if (!res.ok) return { deliverable: false, score: 0 };

    const data = (await res.json()) as { person?: ApolloPerson };
    const status = data.person?.email_status;
    return {
      deliverable: status === "verified",
      score: confidenceFor(status),
    };
  },
};
