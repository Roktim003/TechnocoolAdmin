/** Sample masters for a fresh install (seeded when SEED_SAMPLE_DATA is not "false"). */
export const SAMPLE_SUPPLIERS = [
  { name: "LG Electronics Bangladesh", type: "LOCAL", defaultCurrency: "BDT", contactPerson: "Sales desk", phone: "+880 2 5505 0000", email: "b2b@lg.example.com", address: "Gulshan Avenue, Dhaka", brandsSupplied: "LG", paymentTermsNote: "30 days after delivery" },
  { name: "Daikin Airconditioning (Thailand)", type: "FOREIGN", defaultCurrency: "USD", contactPerson: "Export team", phone: "+66 2 000 0000", email: "export@daikin.example.com", address: "Bangkok, Thailand", brandsSupplied: "Daikin", paymentTermsNote: "LC at sight" },
  { name: "Dunham-Bush (Malaysia)", type: "FOREIGN", defaultCurrency: "MYR", contactPerson: "Regional sales", phone: "+60 3 0000 0000", email: "sales@dunham-bush.example.com", address: "Kajang, Selangor, Malaysia", brandsSupplied: "Dunham-Bush", paymentTermsNote: "30% advance, 70% against shipping documents" },
  { name: "Nawabpur Pipe & Fittings", type: "LOCAL", defaultCurrency: "BDT", contactPerson: "Mr. Karim", phone: "+880 1711 000000", email: null, address: "Nawabpur Road, Dhaka", brandsSupplied: "Copper pipe, insulation, fittings", paymentTermsNote: "Cash on delivery" },
] as const;

export const SAMPLE_CUSTOMERS = [
  { name: "Walk-in customer", contactPerson: null, phone: null, email: null, address: null },
  { name: "Green Tower Developers Ltd.", contactPerson: "Procurement", phone: "+880 1811 000000", email: "procurement@greentower.example.com", address: "Banani, Dhaka" },
];
