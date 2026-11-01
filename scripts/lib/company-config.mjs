// Maps _specs/hr-system/company-config.yaml to database rows for `npm run db:seed`.
// Pure functions (no I/O) so they are unit-tested in company-config.test.mjs.
// Values marked TBC are unknown: they become null, never an invented value (CLAUDE.md).

// ISO 3166-2:MY codes. public_holidays (Step 9) keys off these.
export const STATE_CODES = {
  johor: "MY-01",
  kedah: "MY-02",
  kelantan: "MY-03",
  melaka: "MY-04",
  "negeri sembilan": "MY-05",
  pahang: "MY-06",
  "pulau pinang": "MY-07",
  perak: "MY-08",
  perlis: "MY-09",
  selangor: "MY-10",
  terengganu: "MY-11",
  sabah: "MY-12",
  sarawak: "MY-13",
  "wilayah persekutuan kuala lumpur": "MY-14",
  "wilayah persekutuan labuan": "MY-15",
  "wilayah persekutuan putrajaya": "MY-16",
};

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** null for missing, "TBC" and "not_applicable"; otherwise the trimmed value. */
export function known(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text === "" || /^(tbc|not_applicable)$/i.test(text)) return null;
  return text;
}

export function stateCode(stateName) {
  const name = known(stateName);
  if (!name) return null;
  const code = STATE_CODES[name.toLowerCase()];
  if (!code)
    throw new Error(
      `Unknown Malaysian state in company-config.yaml: "${name}"`,
    );
  return code;
}

/**
 * "Mon-Fri 08:30-17:30, Sat 08:30-13:00" →
 * { mon: [{ open: "08:30", close: "17:30" }], …, sat: [{ open: "08:30", close: "13:00" }] }
 */
export function parseOperatingHours(text) {
  const value = known(text);
  if (!value) return {};
  const hours = {};
  for (const part of value.split(",")) {
    const match = part
      .trim()
      .match(/^([a-z]{3})(?:-([a-z]{3}))?\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/i);
    if (!match) throw new Error(`Cannot read operating hours "${part.trim()}"`);
    const [, from, to = from, open, close] = match;
    const start = DAYS.indexOf(from.toLowerCase());
    const end = DAYS.indexOf(to.toLowerCase());
    if (start < 0 || end < start)
      throw new Error(`Cannot read days "${part.trim()}"`);
    for (const day of DAYS.slice(start, end + 1)) {
      (hours[day] ??= []).push({ open, close });
    }
  }
  return hours;
}

function number(value) {
  const text = known(value);
  if (text === null) return null;
  const n = Number(text);
  if (!Number.isFinite(n))
    throw new Error(`Not a number in company-config.yaml: "${text}"`);
  return n;
}

/** "YYYY-MM-DD" (or a YAML date) → "YYYY-MM-DD"; TBC → null. */
export function isoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = known(value);
  if (text === null) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match ? new Date(`${text}T00:00:00Z`) : null;
  if (!date || date.toISOString().slice(0, 10) !== text)
    throw new Error(`Not a YYYY-MM-DD date in company-config.yaml: "${text}"`);
  return text;
}

export function toTenant(config) {
  const company = config.company ?? {};
  const employer = config.employer_numbers ?? {};
  return {
    legal_name: known(company.legal_name),
    trading_name: known(company.trading_name),
    ssm_no: known(company.ssm_no),
    address: known(company.address),
    state_code: stateCode(company.state),
    is_msme: company.is_msme !== false,
    epf_employer_no: known(employer.epf_employer_no),
    socso_employer_code: known(employer.socso_employer_code),
    lhdn_e_no: known(employer.lhdn_e_no),
    hrdcorp_no: known(employer.hrdcorp_no),
    first_hire_date: isoDate(company.first_hire_target_date),
    first_payday_date: isoDate(company.first_payday_target_date),
    credential_enforcement:
      config.credential_enforcement === "hard" ? "hard" : "soft",
  };
}

export function toBranch(config) {
  const branch = config.branch ?? {};
  return {
    name: known(branch.name),
    address: known(branch.address),
    geo_lat: number(branch.geofence_lat),
    geo_lng: number(branch.geofence_lng),
    geo_radius_m: number(branch.geofence_radius_m),
    operating_hours: parseOperatingHours(branch.operating_hours),
    state_code: stateCode(config.company?.state),
  };
}

/** Lower-cased, de-duplicated owner emails; at least one is required. */
export function ownerEmails(config) {
  const list = config.people?.owner_emails;
  const emails = [
    ...new Set(
      (Array.isArray(list) ? list : [])
        .map(known)
        .filter(Boolean)
        .map((e) => e.toLowerCase()),
    ),
  ];
  for (const email of emails) {
    if (!EMAIL.test(email))
      throw new Error(
        `Not an email address in people.owner_emails: "${email}"`,
      );
  }
  if (emails.length === 0) {
    throw new Error(
      "people.owner_emails in company-config.yaml needs at least one email.",
    );
  }
  return emails;
}
