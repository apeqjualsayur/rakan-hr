// Letter templates (HIR-03): merge fields, the small text format and the values each
// letter fills in. Pure TypeScript with no imports, so the `hiring` Edge Function (Deno)
// and the app (Settings > Letter templates, unit tests) share one copy.
//
// Format, one block per line: "# " title, "## " heading, "- " bullet, anything else is a
// paragraph line; a blank line ends a paragraph. {{field}} is replaced by its value; a
// line left empty by a blank value disappears.

export type LetterLocale = "en" | "ms";
export type LetterKind = "offer" | "contract" | "confirmation" | "extension";
export const LETTER_KINDS: readonly LetterKind[] = [
  "offer",
  "contract",
  "confirmation",
  "extension",
];

const COMMON = ["today", "name", "job_title", "company_name"] as const;
const COMPANY = ["company_reg_no", "company_address"] as const;
const OFFER = [
  "branch_name",
  "manager_name",
  "employment_type",
  "start_date",
  "contract_end",
  "probation_months",
  "probation_end",
  "pay",
  "normal_hours_per_day",
  "work_days_per_week",
  "offer_expiry_date",
  "extra_terms",
] as const;

/** Fields each kind of letter can use (shown in the template editor). */
export const MERGE_FIELDS: Record<LetterKind, readonly string[]> = {
  offer: [...COMMON, ...COMPANY, ...OFFER],
  contract: [...COMMON, ...COMPANY, ...OFFER],
  confirmation: [...COMMON, ...COMPANY, "confirmation_date"],
  extension: [...COMMON, ...COMPANY, "extension_months", "new_probation_end"],
};

const FIELD = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

/** {{fields}} in a template that its kind does not know (typos). */
export function unknownFields(body: string, kind: LetterKind): string[] {
  const known = new Set(MERGE_FIELDS[kind]);
  const found = new Set<string>();
  for (const match of body.matchAll(FIELD)) {
    if (!known.has(match[1]!)) found.add(match[1]!);
  }
  return [...found];
}

export function fillTemplate(
  body: string,
  values: Readonly<Record<string, string | null | undefined>>,
): string {
  return body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .flatMap((line) => {
      if (!FIELD.test(line)) return [line];
      FIELD.lastIndex = 0;
      const filled = line.replace(FIELD, (_, key: string) => values[key] ?? "");
      // A line that held only blank fields goes away instead of leaving a gap.
      return filled.trim() === "" ? [] : filled.split("\n");
    })
    .join("\n");
}

export type Block = {
  type: "title" | "heading" | "paragraph" | "bullet";
  text: string;
};

/** Splits filled text into blocks. Consecutive plain lines stay separate lines of one paragraph. */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length)
      blocks.push({ type: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flush();
    } else if (line.startsWith("# ")) {
      flush();
      blocks.push({ type: "title", text: line.slice(2).trim() });
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ type: "heading", text: line.slice(3).trim() });
    } else if (/^[-*] /.test(line)) {
      flush();
      blocks.push({ type: "bullet", text: line.slice(2).trim() });
    } else {
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

// ── Formatting (no Intl: the same output in Deno, Node and every browser) ───────────────

const MONTHS: Record<LetterLocale, readonly string[]> = {
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  ms: [
    "Januari",
    "Februari",
    "Mac",
    "April",
    "Mei",
    "Jun",
    "Julai",
    "Ogos",
    "September",
    "Oktober",
    "November",
    "Disember",
  ],
};

/** "2026-11-04" → "4 November 2026" (or "4 Mac 2026" in Malay). */
export function letterDate(
  iso: string | null | undefined,
  locale: LetterLocale,
) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return "";
  return `${Number(m[3])} ${MONTHS[locale][Number(m[2]) - 1]} ${m[1]}`;
}

/** Malaysia date (UTC+8) of an instant, as YYYY-MM-DD. */
export function malaysiaDate(instant: Date) {
  return new Date(instant.getTime() + 8 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
}

/** Adds whole months to a YYYY-MM-DD date, then days (day overflow rolls on, as in Postgres it clamps). */
export function addMonths(iso: string, months: number, days = 0) {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  const date = new Date(
    Date.UTC(y, m - 1 + months, Math.min(d, lastDay) + days),
  );
  return date.toISOString().slice(0, 10);
}

/** "4500" / "4500.5" / 4500 → "RM 4,500.00", without floating-point arithmetic. */
export function ringgit(amount: string | number | null | undefined) {
  if (amount === null || amount === undefined || amount === "") return "";
  const [whole = "0", fraction = ""] = String(amount).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `RM ${grouped}.${(fraction + "00").slice(0, 2)}`;
}

/** 8.00 → "8", 5.5 → "5.5". */
export function plainNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const text = String(value);
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

const WORDS = {
  en: {
    employmentType: {
      full_time: "full-time",
      part_time: "part-time",
      contract: "fixed-term contract",
      locum_contractor: "locum",
    } as Record<string, string>,
    pay: {
      monthly: (rm: string) => `${rm} a month (basic salary)`,
      hourly: (rm: string) => `${rm} an hour`,
      per_session: (rm: string) => `${rm} a session`,
    } as Record<string, (rm: string) => string>,
    contractEnd: (date: string) =>
      `The employment ends on ${date} unless it is renewed in writing.`,
    manager: "your manager",
    regNo: "[company registration no.]",
    address: "[company address]",
    company: "[company name]",
  },
  ms: {
    employmentType: {
      full_time: "sepenuh masa",
      part_time: "separuh masa",
      contract: "kontrak tempoh tetap",
      locum_contractor: "lokum",
    } as Record<string, string>,
    pay: {
      monthly: (rm: string) => `${rm} sebulan (gaji pokok)`,
      hourly: (rm: string) => `${rm} sejam`,
      per_session: (rm: string) => `${rm} setiap sesi`,
    } as Record<string, (rm: string) => string>,
    contractEnd: (date: string) =>
      `Pekerjaan ini tamat pada ${date} melainkan diperbaharui secara bertulis.`,
    manager: "pengurus anda",
    regNo: "[no. pendaftaran syarikat]",
    address: "[alamat syarikat]",
    company: "[nama syarikat]",
  },
};

export type LetterCompany = {
  name: string | null;
  legal_name?: string | null;
  reg_no?: string | null;
  address?: string | null;
};

function companyValues(company: LetterCompany, locale: LetterLocale) {
  const w = WORDS[locale];
  return {
    company_name: company.legal_name || company.name || w.company,
    company_reg_no: company.reg_no || w.regNo,
    company_address: company.address || w.address,
  };
}

export type OfferTerms = {
  job_title: string;
  employment_type: string;
  pay_model: string;
  basic_salary: string | number | null;
  hourly_rate: string | number | null;
  session_rate: string | number | null;
  normal_hours_per_day: string | number;
  work_days_per_week: string | number;
  start_date: string;
  contract_end_date: string | null;
  probation_months: number;
  extra_terms: string | null;
  expires_at?: string | null;
};

/** Last day of probation: start + months − 1 day (as convert_candidate() stores it). */
export function probationEnd(start: string, months: number) {
  return months > 0 ? addMonths(start, months, -1) : null;
}

export function offerValues(
  offer: OfferTerms,
  extra: {
    name: string;
    company: LetterCompany;
    branch_name: string | null;
    manager_name: string | null;
    today: string;
    /** When the candidate must accept by (sent offers); defaults to today + 14 days. */
    expires_on?: string;
  },
  locale: LetterLocale,
): Record<string, string> {
  const w = WORDS[locale];
  const rate =
    offer.pay_model === "monthly"
      ? offer.basic_salary
      : offer.pay_model === "hourly"
        ? offer.hourly_rate
        : offer.session_rate;
  const company = companyValues(extra.company, locale);
  return {
    today: letterDate(extra.today, locale),
    name: extra.name,
    job_title: offer.job_title,
    ...company,
    branch_name:
      extra.branch_name || extra.company.name || company.company_name,
    manager_name: extra.manager_name || w.manager,
    employment_type:
      w.employmentType[offer.employment_type] ?? offer.employment_type,
    start_date: letterDate(offer.start_date, locale),
    contract_end: offer.contract_end_date
      ? w.contractEnd(letterDate(offer.contract_end_date, locale))
      : "",
    probation_months: String(offer.probation_months),
    probation_end: letterDate(
      probationEnd(offer.start_date, offer.probation_months),
      locale,
    ),
    pay: (w.pay[offer.pay_model] ?? ((rm: string) => rm))(ringgit(rate)),
    normal_hours_per_day: plainNumber(offer.normal_hours_per_day),
    work_days_per_week: plainNumber(offer.work_days_per_week),
    offer_expiry_date: letterDate(
      extra.expires_on ?? addMonths(extra.today, 0, 14),
      locale,
    ),
    extra_terms: offer.extra_terms?.trim() ?? "",
  };
}

export function probationValues(
  data: {
    name: string;
    job_title: string | null;
    company: LetterCompany;
    today: string;
    confirmed_on: string | null;
    extend_months: number | null;
    new_probation_end: string | null;
  },
  locale: LetterLocale,
): Record<string, string> {
  return {
    today: letterDate(data.today, locale),
    name: data.name,
    job_title: data.job_title ?? "",
    ...companyValues(data.company, locale),
    confirmation_date: letterDate(data.confirmed_on, locale),
    extension_months: data.extend_months ? String(data.extend_months) : "",
    new_probation_end: letterDate(data.new_probation_end, locale),
  };
}

/** Example values for the template preview. */
export function sampleValues(
  company: LetterCompany,
  today: string,
  locale: LetterLocale,
): Record<string, string> {
  return {
    ...offerValues(
      {
        job_title:
          locale === "ms"
            ? "Ahli Terapi Pertuturan"
            : "Speech-Language Therapist",
        employment_type: "full_time",
        pay_model: "monthly",
        basic_salary: "4500.00",
        hourly_rate: null,
        session_rate: null,
        normal_hours_per_day: "8",
        work_days_per_week: "5.5",
        start_date: addMonths(today, 1),
        contract_end_date: null,
        probation_months: 3,
        extra_terms: null,
      },
      {
        name: "Nur Aisyah binti Ahmad",
        company,
        branch_name: null,
        manager_name: null,
        today,
      },
      locale,
    ),
    confirmation_date: letterDate(addMonths(today, 3, -1), locale),
    extension_months: "3",
    new_probation_end: letterDate(addMonths(today, 6, -1), locale),
  };
}
