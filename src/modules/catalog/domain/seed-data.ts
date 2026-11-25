export const SEED_CATALOGS = [
  { name: "LG", description: "LG Electronics air conditioning", sortOrder: 1 },
  { name: "Daikin", description: "Daikin air conditioning and VRV", sortOrder: 2 },
  { name: "Dunham-Bush", description: "Dunham-Bush chillers and air-side equipment", sortOrder: 3 },
  // Default for products created without a brand.
  { name: "Other", description: "Products without a brand, or not yet assigned to one", sortOrder: 99 },
];

export const SEED_CATEGORIES = [
  "Split AC",
  "Cassette AC",
  "Ducted AC",
  "VRF / VRV",
  "Chiller",
  "Fan coil unit",
  "AHU",
  "Accessories",
  "Piping",
  "Electrical",
  "Controls",
  // Default for products created without a category.
  "Other",
];

export const SEED_UNITS = [
  { code: "pcs", name: "Pieces" },
  { code: "set", name: "Set" },
  { code: "m", name: "Metre" },
  { code: "roll", name: "Roll" },
  { code: "kg", name: "Kilogram" },
  { code: "ltr", name: "Litre" },
  { code: "sheet", name: "Sheet" },
  { code: "box", name: "Box" },
];
