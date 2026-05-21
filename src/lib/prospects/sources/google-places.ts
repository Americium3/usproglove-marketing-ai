import type { DiscoveredCompany, DiscoveryQuery, DiscoverySource } from "../types";
import type { Vertical } from "@/../content/catalog/products";

const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

const verticalToQuery: Record<Vertical, { text: string; types?: string[] }> = {
  tattoo: { text: "tattoo studio", types: ["establishment"] },
  beauty: { text: "nail salon OR beauty salon", types: ["beauty_salon", "nail_salon"] },
  restaurant: { text: "restaurant", types: ["restaurant"] },
  medical: { text: "medical clinic", types: ["doctor", "health"] },
  industrial: { text: "industrial supply", types: ["store"] },
  automotive: { text: "auto repair shop", types: ["car_repair"] },
  agriculture: { text: "farm supply", types: ["store"] },
  janitorial: { text: "cleaning service", types: ["establishment"] },
  cannabis: { text: "cannabis dispensary", types: ["store"] },
  veterinary: { text: "veterinary clinic", types: ["veterinary_care"] },
  // Buy-side suppliers are sourced via Apollo, not Google Places — this entry
  // exists only to satisfy the exhaustive Record<Vertical> type. Discovery for
  // vertical="supplier" must be filtered out before reaching this source.
  supplier: { text: "" },
};

export const googlePlacesSource: DiscoverySource = {
  id: "gpl",
  async discover(query: DiscoveryQuery): Promise<DiscoveredCompany[]> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY not set");

    const config = verticalToQuery[query.vertical];
    const textQuery = [config.text, query.city, query.region].filter(Boolean).join(" ");

    const res = await fetch(PLACES_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.types,places.addressComponents",
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: Math.min(query.limit ?? 20, 20),
        ...(query.latitude && query.longitude
          ? {
              locationBias: {
                circle: {
                  center: { latitude: query.latitude, longitude: query.longitude },
                  radius: query.radiusMeters ?? 50000,
                },
              },
            }
          : {}),
      }),
    });

    if (!res.ok) {
      throw new Error(`Places API error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { places?: GooglePlace[] };
    return (data.places ?? []).map((p) => mapPlace(p, query.vertical));
  },
};

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  addressComponents?: Array<{ types: string[]; shortText?: string; longText?: string }>;
}

function mapPlace(p: GooglePlace, vertical: Vertical): DiscoveredCompany {
  const findComponent = (type: string) =>
    p.addressComponents?.find((c) => Array.isArray(c.types) && c.types.includes(type))?.shortText;
  return {
    externalId: p.id,
    name: p.displayName?.text ?? "Unknown",
    website: p.websiteUri,
    phone: p.internationalPhoneNumber,
    address: p.formattedAddress,
    city: findComponent("locality"),
    region: findComponent("administrative_area_level_1"),
    countryCode: findComponent("country"),
    vertical,
    subVertical: p.types?.[0],
    rating: p.rating ? Math.round(p.rating * 10) : undefined,
    reviewCount: p.userRatingCount,
    metadata: { types: p.types },
  };
}
