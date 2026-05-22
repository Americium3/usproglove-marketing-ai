import type { Vertical } from "@/../content/catalog/products";

export interface Fixture {
  id: string;
  label: string;
  vertical: Vertical;
  heroSkuId: string;
  company: string;
  contactFirstName?: string;
  /**
   * Simulates what retrieveChunks() returns after Phase 2.2 — i.e. content the
   * user has already ingested into /knowledge filtered by vertical. The drafter
   * receives these verbatim. Each string is one "chunk".
   */
  knowledgeSnippets?: string[];
}

export const fixtures: Fixture[] = [
  {
    id: "medical",
    label: "Independent urgent-care clinic — buyer is the practice manager",
    vertical: "medical",
    heroSkuId: "3.5-black",
    company: "Cedar Ridge Urgent Care",
    contactFirstName: "Diane",
    knowledgeSnippets: [
      "Medical-grade objection — 'we already buy from McKesson': lead with delivered cost per case + same-day-ship from US warehouses. We are not asking to replace their primary supplier on day one; the ask is to stock one case of Ultra Stretch Pro 3.5 Black alongside their current line and let the staff vote with their hands. Mention FDA 510(k) K201234, ASTM D6319, ASTM D3578, AQL 1.5 — these are the four checkboxes their compliance lead opens with.",
      "Clinic staff care about two things the purchasing manager rarely sees: tear-through at the cuff during glove-on with wet hands, and finger fatigue on shift hour six. Our 3.5 mil cuff is rolled (not beaded) and the elastomer formulation tested at 30% elongation retention after 1000 flex cycles vs Halyard Purple's 18%. If they push back on price, the durability math is roughly 1 box of ours = 1.4 boxes of standard exam — we have a side-by-side wear card we can mail."
    ]
  },
  {
    id: "tattoo",
    label: "High-volume tattoo studio — owner-operator",
    vertical: "tattoo",
    heroSkuId: "5.0-black",
    company: "Black Lantern Tattoo Co.",
    contactFirstName: "Marco",
    knowledgeSnippets: [
      "Tattoo-shop persona — owner-operator artists do not buy on spec sheets; they buy on whether ink visibility holds during a long line session and whether the glove rips when they pull tight on a stretch. Lead with 5mil black (hides ink), tear-resistance under needle drag, and that we ship 100ct boxes (not 1000ct cases) so a 2-chair shop can rotate sizes without freezing $400 of cash. APP (Association of Professional Piercers) compliant. Bloodborne pathogen rated.",
      "Common objection — 'I already use Pearl Black 5mil': our differentiator is the textured fingertip on the 5.0 line; artists doing long line work or lettering report better needle control vs Pearl's smooth finish. Offer to send a 50-glove sample to one chair, comp'd, no sales call. Conversion on this offer historically ~22%."
    ]
  },
  {
    id: "automotive",
    label: "Independent auto-repair shop — service manager",
    vertical: "automotive",
    heroSkuId: "6.0-black",
    company: "Fastlane Auto & Diesel",
    contactFirstName: "Ray",
    knowledgeSnippets: [
      "Automotive positioning — 6mil heavy-duty is the only SKU that survives a brake-job + transmission fluid combo without finger blowout. Mechanics try a $9 box of cheapie 4mil first, lose a glove every 20 min, then ratchet up. Our 6.0 Black has been chemo-tested (relevant if they also do fleet work for dealerships) AND oilproof — the elastomer doesn't swell on contact with ATF/DOT3. Pitch: 1 box of 6.0 outlasts 3 boxes of generic in a brake bay; we have a side-by-side video of the swell test."
    ]
  },
  {
    id: "restaurant",
    label: "Regional restaurant group — purchasing manager",
    vertical: "restaurant",
    heroSkuId: "3.0",
    company: "Vista Kitchen Group",
    contactFirstName: "Priya"
  }
];
