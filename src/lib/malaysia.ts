// Malaysian states and federal territories (ISO 3166-2:MY). The seed script keeps its own
// copy in scripts/lib/company-config.mjs; malaysia.test.ts checks the two lists match.
// Official names are used in both languages. public_holidays (Step 9) keys off the code.

export const MALAYSIAN_STATES = [
  { code: "MY-01", name: "Johor" },
  { code: "MY-02", name: "Kedah" },
  { code: "MY-03", name: "Kelantan" },
  { code: "MY-04", name: "Melaka" },
  { code: "MY-05", name: "Negeri Sembilan" },
  { code: "MY-06", name: "Pahang" },
  { code: "MY-07", name: "Pulau Pinang" },
  { code: "MY-08", name: "Perak" },
  { code: "MY-09", name: "Perlis" },
  { code: "MY-10", name: "Selangor" },
  { code: "MY-11", name: "Terengganu" },
  { code: "MY-12", name: "Sabah" },
  { code: "MY-13", name: "Sarawak" },
  { code: "MY-14", name: "Wilayah Persekutuan Kuala Lumpur" },
  { code: "MY-15", name: "Wilayah Persekutuan Labuan" },
  { code: "MY-16", name: "Wilayah Persekutuan Putrajaya" },
] as const;

export type StateCode = (typeof MALAYSIAN_STATES)[number]["code"];

export function isStateCode(value: unknown): value is StateCode {
  return MALAYSIAN_STATES.some((s) => s.code === value);
}

export function stateName(code: string | null | undefined) {
  return MALAYSIAN_STATES.find((s) => s.code === code)?.name ?? null;
}
