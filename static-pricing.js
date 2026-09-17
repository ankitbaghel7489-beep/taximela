// STATIC PRICING CONSTANTS — intentionally NOT read from Firestore.
// These mirror the current Flutter app's non-admin-editable values.
window.TAXIMELA_STATIC = {
  localPackages: {
    Hatchback: { 20: 1200, 40: 1400, 80: 2000, 120: 2600 },
    Sedan: { 20: 1500, 40: 1800, 80: 2200, 120: 2800 },
    Ertiga: { 20: 1800, 40: 2000, 80: 2500, 120: 3400 },
    Innova: { 20: 2200, 40: 2600, 80: 2600, 120: 4800 },
    "Innova Crysta": {}
  },
  localFixed: { Hatchback: 800, Sedan: 1200, Ertiga: 1600, Innova: 2500, "Innova Crysta": null },
  nightFirst: 500,
  nightAdditional: 300,
  petCharge: 750,
  extraHours: 300
};
