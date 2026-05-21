export type Vertical =
  | "tattoo"
  | "beauty"
  | "restaurant"
  | "medical"
  | "industrial"
  | "automotive"
  | "agriculture"
  | "janitorial"
  | "cannabis"
  | "veterinary"
  | "supplier";

export type GloveColor = "IB" | "CB" | "BK" | "WT" | "PK";
export type Size = "XS" | "S" | "M" | "L" | "XL";

export interface ProductSeries {
  id: string;
  name: string;
  colorCodes: GloveColor[];
  thicknessMil: number;
  lengthMm: number;
  fingerThicknessMm: number;
  palmThicknessMm: number;
  cuffThicknessMm: number;
  tensileStrengthMpa: number;
  packSize: 50 | 100 | 200;
  certifications: string[];
  positioning: string[];
  heroVerticals: Vertical[];
  skuPrefix: string;
  skus: Record<Size, string>;
}

const size = (prefix: string, pack: number): Record<Size, string> => {
  const packDigit = pack === 100 ? "1" : pack === 200 ? "2" : "5";
  return {
    XS: `${prefix}${packDigit}01`,
    S: `${prefix}${packDigit}02`,
    M: `${prefix}${packDigit}03`,
    L: `${prefix}${packDigit}04`,
    XL: `${prefix}${packDigit}05`,
  };
};

export const products: ProductSeries[] = [
  {
    id: "3.5-ice-blue",
    name: "Ultra Stretch Pro 3.5 Ice Blue",
    colorCodes: ["IB"],
    thicknessMil: 3.5,
    lengthMm: 240,
    fingerThicknessMm: 0.09,
    palmThicknessMm: 0.07,
    cuffThicknessMm: 0.05,
    tensileStrengthMpa: 16,
    packSize: 200,
    certifications: ["ASTM D6319", "Chemo Rated", "Powder-Free", "Latex-Free"],
    positioning: ["Pet-Friendly", "Ultra Soft Gentle Touch", "Non-Toxic", "Fragrance Free", "Medical Grade"],
    heroVerticals: ["medical", "veterinary", "restaurant"],
    skuPrefix: "USIB35",
    skus: size("USIB35", 200),
  },
  {
    id: "3.5-black",
    name: "Ultra Stretch Pro 3.5 Black",
    colorCodes: ["BK"],
    thicknessMil: 3.5,
    lengthMm: 240,
    fingerThicknessMm: 0.09,
    palmThicknessMm: 0.07,
    cuffThicknessMm: 0.05,
    tensileStrengthMpa: 16,
    packSize: 100,
    certifications: ["FDA", "510k", "ASTM D6319", "Chemo Rated", "Powder-Free", "CE"],
    positioning: ["Medical Grade", "Food Safe", "Waterproof", "Touchscreen Compatible", "Tear-Resistant"],
    heroVerticals: ["beauty", "restaurant", "medical"],
    skuPrefix: "USBK35",
    skus: size("USBK35", 100),
  },
  {
    id: "3.0",
    name: "Ultra Stretch Pro 3.0",
    colorCodes: ["CB", "BK", "PK", "WT"],
    thicknessMil: 3.0,
    lengthMm: 240,
    fingerThicknessMm: 0.07,
    palmThicknessMm: 0.06,
    cuffThicknessMm: 0.05,
    tensileStrengthMpa: 16,
    packSize: 200,
    certifications: ["ASTM D6319", "Chemo Rated", "Powder-Free", "Latex-Free"],
    positioning: ["Touchscreen", "Food Safe", "Janitorial Cleaning", "Salon/Nail/Beauty", "Healthcare"],
    heroVerticals: ["beauty", "janitorial", "restaurant", "medical"],
    skuPrefix: "USCB30",
    skus: size("USCB30", 200),
  },
  {
    id: "5.0-black",
    name: "Ultra Stretch Pro 5.0 Black — Fentanyl Protection",
    colorCodes: ["BK"],
    thicknessMil: 5.0,
    lengthMm: 240,
    fingerThicknessMm: 0.14,
    palmThicknessMm: 0.09,
    cuffThicknessMm: 0.07,
    tensileStrengthMpa: 18,
    packSize: 100,
    certifications: ["ASTM D6319", "ASTM D6978", "Fentanyl Resistant", "Powder-Free", "Latex-Free"],
    positioning: ["5mil Puncture Resistant", "Multi-Purpose", "Waterproof & Oilproof", "Ultra Elastic", "Tear Resistant"],
    heroVerticals: ["tattoo", "automotive", "agriculture", "industrial"],
    skuPrefix: "USBK50",
    skus: size("USBK50", 100),
  },
  {
    id: "6.0-black",
    name: "Ultra Stretch Pro 6.0 Black — Heavy-Duty",
    colorCodes: ["BK"],
    thicknessMil: 6.0,
    lengthMm: 240,
    fingerThicknessMm: 0.16,
    palmThicknessMm: 0.12,
    cuffThicknessMm: 0.08,
    tensileStrengthMpa: 18,
    packSize: 100,
    certifications: ["ASTM D6319", "ASTM D6978", "Fentanyl Resistant", "Powder-Free", "Latex-Free"],
    positioning: ["6mil Heavy-Duty Protection", "Ultra Strength", "Chemo Tested", "Tactile Control"],
    heroVerticals: ["industrial", "automotive", "tattoo"],
    skuPrefix: "USBK60",
    skus: size("USBK60", 100),
  },
  {
    id: "12-inch-white",
    name: 'Ultra Stretch Pro 12" White Long-Cuff',
    colorCodes: ["WT"],
    thicknessMil: 6.0,
    lengthMm: 300,
    fingerThicknessMm: 0.16,
    palmThicknessMm: 0.1,
    cuffThicknessMm: 0.08,
    tensileStrengthMpa: 18,
    packSize: 50,
    certifications: ["ASTM D6319", "Powder-Free", "Latex-Free"],
    positioning: ["12-inch Long Cuff", "Textured Fingertips", "High Elasticity"],
    heroVerticals: ["restaurant", "agriculture", "janitorial"],
    skuPrefix: "USWT12",
    skus: size("USWT12", 50),
  },
];

export const heroSkuByVertical: Record<Vertical, string> = {
  tattoo: "5.0-black",
  beauty: "3.0",
  restaurant: "3.5-ice-blue",
  medical: "3.5-black",
  industrial: "6.0-black",
  automotive: "5.0-black",
  agriculture: "12-inch-white",
  janitorial: "3.0",
  cannabis: "3.5-black",
  veterinary: "3.5-ice-blue",
  // "supplier" is a buy-side pseudo-vertical (sourcing nitrile from manufacturers);
  // the hero-SKU concept doesn't apply, but the schema requires a value.
  supplier: "3.0",
};

export const skuPattern = /^US(IB|CB|BK|WT|PK)(\d{2})(\d)(\d{2})$/;

export function parseSku(sku: string) {
  const match = skuPattern.exec(sku);
  if (!match) return null;
  const [, color, series, packDigit, sizeDigit] = match;
  const packSize = packDigit === "1" ? 100 : packDigit === "2" ? 200 : 50;
  const sizeMap: Record<string, Size> = { "01": "XS", "02": "S", "03": "M", "04": "L", "05": "XL" };
  return {
    color: color as GloveColor,
    series,
    packSize,
    size: sizeMap[sizeDigit],
  };
}
