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

/**
 * roles_to_hire → job_roles rows (Step 5; Step 6 adds credential requirements).
 * Titles must be unique; the yaml order becomes sort_order.
 */
export function toJobRoles(config) {
  const list = Array.isArray(config.roles_to_hire) ? config.roles_to_hire : [];
  const roles = list
    .map((role, index) => ({
      name: known(role?.title),
      is_clinical: role?.clinical === true,
      sort_order: (index + 1) * 10,
    }))
    .filter((role) => role.name);
  const names = roles.map((r) => r.name.toLowerCase());
  const duplicate = names.find((n, i) => names.indexOf(n) !== i);
  if (duplicate)
    throw new Error(
      `roles_to_hire lists "${duplicate}" twice in company-config.yaml`,
    );
  return roles;
}

export const CREDENTIAL_CODES = [
  "MAHPC_REG",
  "MMC_REG",
  "MNB_REG",
  "APC",
  "BLS",
  "FIRST_AID",
  "INFECTION_CONTROL",
  "FIRE_SAFETY",
  "INDEMNITY",
  "HEPB_VAX",
  "SAFEGUARDING",
];

/**
 * roles_to_hire[].credentials → role_credential_requirements rows (Step 6, CRD-03):
 * [{ role, code, requirement, blocks_roster }]. Mandatory credentials of clinical roles
 * block the roster when hard enforcement is on. Unknown codes are an error, not a guess.
 */
export function toRoleRequirements(config) {
  const rows = [];
  for (const role of Array.isArray(config.roles_to_hire)
    ? config.roles_to_hire
    : []) {
    const name = known(role?.title);
    if (!name) continue;
    for (const requirement of ["mandatory", "optional"]) {
      const list = role?.credentials?.[requirement] ?? [];
      if (!Array.isArray(list))
        throw new Error(`${name}: credentials.${requirement} must be a list`);
      for (const code of list) {
        if (!CREDENTIAL_CODES.includes(code))
          throw new Error(
            `${name}: unknown credential code "${code}" in company-config.yaml`,
          );
        if (rows.some((r) => r.role === name && r.code === code))
          throw new Error(`${name}: ${code} is listed twice`);
        rows.push({
          role: name,
          code,
          requirement,
          blocks_roster: requirement === "mandatory" && role.clinical === true,
        });
      }
    }
  }
  return rows;
}

const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "locum_contractor",
];
const PAY_MODELS = ["monthly", "hourly", "per_session"];

/**
 * roles_to_hire → job_openings rows (Step 8, HIR-01): one open opening per role, with the
 * role's employment type and pay model. Salary ranges are not in the yaml; HR adds them.
 * "hybrid" pay is not a pay model yet, so it is an error rather than a guess.
 */
export function toJobOpenings(config) {
  const list = Array.isArray(config.roles_to_hire) ? config.roles_to_hire : [];
  return list
    .filter((role) => known(role?.title))
    .map((role) => {
      const title = known(role.title);
      const employment_type = role.employment_type ?? "full_time";
      const pay_model = role.pay_model ?? "monthly";
      if (!EMPLOYMENT_TYPES.includes(employment_type))
        throw new Error(
          `${title}: employment_type must be one of ${EMPLOYMENT_TYPES.join(", ")}`,
        );
      if (!PAY_MODELS.includes(pay_model))
        throw new Error(
          `${title}: pay_model "${pay_model}" is not supported for job openings; use ${PAY_MODELS.join(", ")}`,
        );
      const headcount = Number.isInteger(role.headcount)
        ? role.headcount
        : null;
      return { role: title, title, employment_type, pay_model, headcount };
    });
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/**
 * work_pattern → the company's rest day, off days and half days (Step 9, leave days and
 * replacement holidays). 5.5 days: the day before the rest day is a half day; 5 days: it is
 * an off day. Unknown values are an error, not a guess.
 */
export function toWorkPattern(config) {
  const wp = config.work_pattern ?? {};
  const rest = WEEKDAYS.indexOf(
    String(wp.rest_day ?? "")
      .trim()
      .toLowerCase(),
  );
  if (rest < 0)
    throw new Error(`work_pattern.rest_day "${wp.rest_day}" is not a weekday`);
  const before = (rest + 6) % 7;
  const days = Number(wp.work_days_per_week);
  if (![5, 5.5, 6].includes(days))
    throw new Error("work_pattern.work_days_per_week must be 5, 5.5 or 6");
  return {
    rest_day: rest,
    off_days: days === 5 ? [before] : [],
    half_days: days === 5.5 ? [before] : [],
  };
}

const BANDS = [
  ["under_2_years", 0, 24],
  ["two_to_5_years", 24, 60],
  ["over_5_years", 60, null],
];

/**
 * leave_policy → company leave policies (Step 9, LVE-02): annual and sick leave per service
 * band, and annual leave carry-forward. The database refuses anything below the
 * Employment Act; extra_leave_types become leave types without days (HR sets them).
 */
export function toLeavePolicy(config) {
  const lp = config.leave_policy ?? {};
  const rows = [];
  for (const [code, key] of [
    ["ANNUAL", "annual_leave_days"],
    ["SICK", "sick_leave_days"],
  ]) {
    for (const [band, min, max] of BANDS) {
      const days = lp[key]?.[band];
      if (days === undefined || known(String(days)) === null) continue;
      if (typeof days !== "number" || days < 0)
        throw new Error(`leave_policy.${key}.${band} must be a number of days`);
      rows.push({
        code,
        min_service_months: min,
        max_service_months: max,
        days_per_year: days,
        carry_forward_max:
          code === "ANNUAL" ? (lp.carry_forward_max_days ?? 0) : 0,
        carry_forward_expiry_months:
          code === "ANNUAL" && lp.carry_forward_max_days
            ? (lp.carry_forward_expiry_months ?? null)
            : null,
      });
    }
  }
  const names = {
    compassionate: ["Compassionate leave", "Cuti ihsan"],
    marriage: ["Marriage leave", "Cuti perkahwinan"],
    exam: ["Exam leave", "Cuti peperiksaan"],
  };
  const extra = (
    Array.isArray(lp.extra_leave_types) ? lp.extra_leave_types : []
  ).map((key) => {
    const [name_en, name_ms] = names[key] ?? [];
    if (!name_en)
      throw new Error(`leave_policy.extra_leave_types: unknown type "${key}"`);
    return { code: String(key).toUpperCase(), name_en, name_ms };
  });
  return { policies: rows, extraTypes: extra };
}
