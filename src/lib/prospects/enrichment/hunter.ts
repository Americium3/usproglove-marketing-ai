import type { EnrichedContact, EnrichmentProvider, EnrichmentQuery } from "../types";

const HUNTER_BASE = "https://api.hunter.io/v2";

export const hunterProvider: EnrichmentProvider = {
  id: "h1",
  async find(query: EnrichmentQuery): Promise<EnrichedContact[]> {
    const key = process.env.HUNTER_API_KEY;
    if (!key) throw new Error("HUNTER_API_KEY not set");
    if (!query.domain) return [];

    const params = new URLSearchParams({ domain: query.domain, api_key: key, limit: "10" });
    const res = await fetch(`${HUNTER_BASE}/domain-search?${params}`);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: {
        emails?: Array<{
          value: string;
          first_name?: string;
          last_name?: string;
          position?: string;
          confidence?: number;
        }>;
      };
    };

    const emails = data.data?.emails ?? [];
    // Soft role preference, not a hard filter: small clinics list buyers under
    // titles like "Director of Nursing" / "Office Admin" that rarely contain our
    // role keywords. Prefer role matches, but fall back to all emails so a domain
    // with real contacts is never dropped to zero — AI scoring picks fit later.
    const roles = query.rolesOfInterest;
    let picked = emails;
    if (roles?.length) {
      const matched = emails.filter((e) =>
        roles.some((r) => e.position?.toLowerCase().includes(r.toLowerCase())),
      );
      if (matched.length > 0) picked = matched;
    }
    picked = [...picked].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

    return picked.map((e) => ({
      email: e.value,
      firstName: e.first_name,
      lastName: e.last_name,
      role: e.position,
      confidence: e.confidence ?? 0,
    }));
  },

  async verify(email: string) {
    const key = process.env.HUNTER_API_KEY;
    if (!key) throw new Error("HUNTER_API_KEY not set");
    const params = new URLSearchParams({ email, api_key: key });
    const res = await fetch(`${HUNTER_BASE}/email-verifier?${params}`);
    if (!res.ok) return { deliverable: false, score: 0 };
    const data = (await res.json()) as { data?: { status?: string; score?: number } };
    return {
      deliverable: data.data?.status === "valid",
      score: data.data?.score ?? 0,
    };
  },
};
