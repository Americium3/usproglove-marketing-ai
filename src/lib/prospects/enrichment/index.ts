import { apolloProvider } from "./apollo";
import { hunterProvider } from "./hunter";
import { snovProvider } from "./snov";
import type { EnrichedContact, EnrichmentProvider, EnrichmentQuery } from "../types";

// Hunter first: it returns emails in one call (cheaper), so Apollo — which now
// costs a people/match enrich credit per email — only runs when Hunter comes up empty.
const FIND_CHAIN: EnrichmentProvider[] = [hunterProvider, apolloProvider, snovProvider];
const VERIFY_CHAIN: EnrichmentProvider[] = [hunterProvider, apolloProvider, snovProvider];

export interface FindContactsResult {
  providerId: string;
  contacts: EnrichedContact[];
}

export async function findContacts(query: EnrichmentQuery): Promise<FindContactsResult> {
  for (const provider of FIND_CHAIN) {
    try {
      const contacts = await provider.find(query);
      if (contacts.length > 0) return { providerId: provider.id, contacts };
    } catch {
      // try next
    }
  }
  return { providerId: "none", contacts: [] };
}

export async function verifyEmail(
  email: string,
): Promise<{ deliverable: boolean; score: number; verifierId: string }> {
  for (const provider of VERIFY_CHAIN) {
    try {
      const result = await provider.verify(email);
      if (result.score > 0 || result.deliverable) {
        return { ...result, verifierId: provider.id };
      }
    } catch {
      // try next
    }
  }
  return { deliverable: false, score: 0, verifierId: "none" };
}

export { apolloProvider, hunterProvider, snovProvider };
export type { EnrichmentProvider };
