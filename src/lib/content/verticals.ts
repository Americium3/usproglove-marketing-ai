import { products, heroSkuByVertical, type Vertical } from "@/../content/catalog/products";
import { schema } from "@/lib/db";

export type ContentVertical = Exclude<Vertical, "supplier">;

// Verticals that produce public marketing content. Supplier is a buy-side
// pseudo-vertical and never gets a hub or articles.
export const CONTENT_VERTICALS: readonly ContentVertical[] = (
  schema.verticalEnum.enumValues as readonly Vertical[]
).filter((v): v is ContentVertical => v !== "supplier");

interface VerticalProfile {
  slug: ContentVertical;
  label: string;
  shortLabel: string;
  tagline: string;
  audience: string;
  seoFocus: string[];
}

const PROFILES: Record<ContentVertical, VerticalProfile> = {
  tattoo: {
    slug: "tattoo",
    label: "Tattoo & Piercing Studios",
    shortLabel: "Tattoo",
    tagline: "Thick, tear-resistant nitrile gloves built for long sessions and ink-heavy work.",
    audience: "tattoo artists, piercers, studio owners",
    seoFocus: ["tattoo gloves", "5 mil black nitrile", "tattoo artist supplies"],
  },
  beauty: {
    slug: "beauty",
    label: "Salons, Spas & Nail Studios",
    shortLabel: "Beauty",
    tagline: "Soft-touch nitrile gloves that protect without sacrificing tactile control.",
    audience: "estheticians, nail techs, hair colorists, salon owners",
    seoFocus: ["nitrile gloves for salons", "hair color gloves", "nail tech gloves"],
  },
  restaurant: {
    slug: "restaurant",
    label: "Restaurants & Food Service",
    shortLabel: "Restaurant",
    tagline: "Food-safe, FDA-compliant nitrile gloves for back-of-house and prep lines.",
    audience: "restaurant operators, kitchen managers, food-service distributors",
    seoFocus: ["food-safe nitrile gloves", "FDA nitrile kitchen", "restaurant disposable gloves"],
  },
  medical: {
    slug: "medical",
    label: "Clinics, Dental & Medical",
    shortLabel: "Medical",
    tagline: "510(k)-cleared, chemo-rated nitrile exam gloves for clinical environments.",
    audience: "clinic purchasers, dental offices, urgent care, group practices",
    seoFocus: ["medical exam nitrile gloves", "510k nitrile", "chemo rated gloves"],
  },
  industrial: {
    slug: "industrial",
    label: "Industrial & Manufacturing",
    shortLabel: "Industrial",
    tagline: "Heavy-duty 6 mil nitrile for industrial workshops, assembly lines, and PPE programs.",
    audience: "industrial safety managers, MRO buyers, plant supervisors",
    seoFocus: ["6 mil nitrile gloves", "industrial nitrile PPE", "heavy duty disposable gloves"],
  },
  automotive: {
    slug: "automotive",
    label: "Automotive Shops & Detailing",
    shortLabel: "Automotive",
    tagline: "Oil- and chemical-resistant nitrile for auto repair, detailing, and parts handling.",
    audience: "auto repair owners, detailers, parts counter buyers",
    seoFocus: ["nitrile gloves for mechanics", "automotive disposable gloves", "oil resistant gloves"],
  },
  agriculture: {
    slug: "agriculture",
    label: "Agriculture & Cultivation",
    shortLabel: "Agriculture",
    tagline: "Long-cuff, tear-resistant nitrile for ag operations, packing, and harvest crews.",
    audience: "farm managers, ag co-op buyers, packing line supervisors",
    seoFocus: ["agricultural nitrile gloves", "12 inch nitrile", "long cuff disposable gloves"],
  },
  janitorial: {
    slug: "janitorial",
    label: "Janitorial & Cleaning Services",
    shortLabel: "Janitorial",
    tagline: "Touchscreen-compatible nitrile gloves for cleaning crews and sanitation contractors.",
    audience: "janitorial contractors, building services, distributor reps",
    seoFocus: ["janitorial nitrile gloves", "cleaning service gloves", "disposable gloves for cleaners"],
  },
  cannabis: {
    slug: "cannabis",
    label: "Cannabis Cultivation & Dispensary",
    shortLabel: "Cannabis",
    tagline: "Compliant, food-safe nitrile gloves for cultivation, trimming, and dispensary counters.",
    audience: "cultivation managers, dispensary operators, processing facilities",
    seoFocus: ["cannabis nitrile gloves", "dispensary gloves", "trimming gloves"],
  },
  veterinary: {
    slug: "veterinary",
    label: "Veterinary & Pet Care",
    shortLabel: "Veterinary",
    tagline: "Gentle, fragrance-free nitrile gloves for veterinary clinics and pet care.",
    audience: "vet practice owners, vet techs, grooming salons",
    seoFocus: ["veterinary nitrile gloves", "pet safe gloves", "vet clinic gloves"],
  },
};

export function verticalProfile(v: ContentVertical): VerticalProfile {
  return PROFILES[v];
}

export function heroProductFor(v: ContentVertical) {
  const skuId = heroSkuByVertical[v];
  return products.find((p) => p.id === skuId);
}

export function isContentVertical(v: string): v is ContentVertical {
  return (CONTENT_VERTICALS as readonly string[]).includes(v);
}
