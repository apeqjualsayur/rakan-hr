// Display formats from ui-system.md §5. All dates and times are shown in
// Malaysia time regardless of the device's time zone.

const TIME_ZONE = "Asia/Kuala_Lumpur";

// "en" → en-GB gives day-first dates ("Fri 30 Oct") and "8:30 am".
const intlLocale = (locale: string) => (locale === "ms" ? "ms-MY" : "en-GB");

type DateStyle =
  | "short" // 29 Oct
  | "weekdayShort" // Fri 30 Oct
  | "long" // Thursday, 29 October 2026
  | "longNoYear" // Thursday, 29 October
  | "full"; // 12 Oct 2026

const dateOptions: Record<
  Exclude<DateStyle, "longNoYear">,
  Intl.DateTimeFormatOptions
> = {
  short: { day: "numeric", month: "short" },
  weekdayShort: { weekday: "short", day: "numeric", month: "short" },
  long: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  full: { day: "numeric", month: "short", year: "numeric" },
};

export function formatDate(date: Date, locale: string, style: DateStyle) {
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      ...options,
      timeZone: TIME_ZONE,
    }).format(date);
  // en-GB drops the comma without a year ("Thursday 29 October"); the spec keeps it.
  if (style === "longNoYear") {
    return `${format({ weekday: "long" })}, ${format({ day: "numeric", month: "long" })}`;
  }
  return format(dateOptions[style]);
}

/** Month as a short caps label and the day number, for date tiles. */
export function dateTileParts(date: Date, locale: string) {
  const parts = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    timeZone: TIME_ZONE,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    month: get("month").replace(".", "").toUpperCase(),
    day: get("day"),
  };
}

/** 8:30 am */
export function formatTime(date: Date, locale: string) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TIME_ZONE,
  }).format(date);
}

/** RM 3,354.65 — space after RM, always 2 decimals. Takes the amount as a string or number from numeric(12,2). */
export function formatMoney(amount: number | string) {
  const value = typeof amount === "string" ? Number(amount) : amount;
  const formatted = new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  return `${value < 0 ? "−" : ""}RM ${formatted}`;
}

/** Maybank ••4821 — never show a full bank or IC number in lists (§5). */
export function maskNumber(value: string, visible = 4) {
  const digits = value.replace(/\D/g, "");
  return `••${digits.slice(-visible)}`;
}

/** Initials for avatars: "Farah Hanis" → "FH". */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Time-of-day greeting key (§5): morning before 12, afternoon before 6 pm, then evening. */
export function greetingPeriod(
  date: Date,
): "morning" | "afternoon" | "evening" {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: TIME_ZONE,
    }).format(date),
  );
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
