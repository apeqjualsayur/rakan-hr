// Fixed dummy data for the design recreations. Fake people only (CLAUDE.md test-data rule).

/** "Now" in the reference screens: Thursday 29 Oct 2026, 7:00 pm in Kuala Lumpur. */
export const DEMO_NOW = new Date("2026-10-29T11:00:00Z");
export const DEMO_PAY_DATE = new Date("2026-10-30T01:00:00Z");
export const DEMO_SHIFT = {
  start: new Date("2026-10-29T00:30:00Z"),
  end: new Date("2026-10-29T09:30:00Z"),
};

export const demoPeople = {
  owner: { id: "demo-owner", name: "Owner Wong" },
  aina: { id: "demo-nurul-aina", name: "Nurul Aina" },
  farah: { id: "demo-farah", name: "Farah Hanis" },
  daniel: { id: "demo-daniel", name: "Daniel Tan" },
  amir: { id: "demo-amir", name: "Amir Hakim" },
};

/** Fake account number; only the last 4 digits are ever rendered. */
export const DEMO_BANK = { name: "Maybank", number: "514012344821" };
