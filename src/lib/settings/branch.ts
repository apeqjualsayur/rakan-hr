// ORG-03: branch name, address, geofence (lat, lng, radius) and operating hours.
// operating_hours jsonb has the shape the seed writes (scripts/lib/company-config.mjs):
// { mon: [{ open: "08:30", close: "17:30" }], … }. The editor keeps one opening per day.
import { isStateCode } from "@/lib/malaysia";
import { done, readText, type FieldErrors, type Parsed } from "./form";

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];
export type Opening = { open: string; close: string };
export type OperatingHours = Partial<Record<Day, Opening[]>>;

/** Geofence radius in metres. 100 m is the company-config.yaml default. */
export const RADIUS = { min: 20, max: 1000, default: 100 } as const;

export const BRANCH_COLUMNS =
  "id, name, address, state_code, geo_lat, geo_lng, geo_radius_m, operating_hours";

export type BranchValues = {
  name: string;
  address: string | null;
  state_code: string | null;
  geo_lat: number | null;
  geo_lng: number | null;
  geo_radius_m: number | null;
  operating_hours: OperatingHours;
};

/** Six decimals ≈ 0.1 m, which is what numeric(9,6) stores. */
export const roundCoordinate = (value: number) => Math.round(value * 1e6) / 1e6;

export function validCoordinates(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/**
 * Coordinates pasted from Google Maps ("3.139003, 101.686855") or typed with a space.
 * Returns null when the text is not a valid pair.
 */
export function parseCoordinates(
  text: string,
): { lat: number; lng: number } | null {
  const match = text
    .trim()
    .match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return validCoordinates(lat, lng)
    ? { lat: roundCoordinate(lat), lng: roundCoordinate(lng) }
    : null;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Valid opening hours (from the form's JSON or the database), or null if malformed. */
export function normaliseHours(value: unknown): OperatingHours | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const hours: OperatingHours = {};
  for (const [day, openings] of Object.entries(value)) {
    if (!(DAYS as readonly string[]).includes(day) || !Array.isArray(openings))
      return null;
    const list: Opening[] = [];
    for (const o of openings) {
      if (
        typeof o?.open !== "string" ||
        typeof o?.close !== "string" ||
        !TIME.test(o.open) ||
        !TIME.test(o.close) ||
        o.close <= o.open
      )
        return null;
      list.push({ open: o.open, close: o.close });
    }
    if (list.length > 0) hours[day as Day] = list;
  }
  return hours;
}

/**
 * Days with the same hours are grouped: "Mon–Fri 8:30 am–5:30 pm · Sat 8:30 am–1:00 pm".
 * `day` and `time` format the parts so the caller controls the language.
 */
export function summariseHours(
  hours: OperatingHours,
  day: (d: Day) => string,
  time: (hhmm: string) => string,
): string {
  const key = (d: Day) =>
    (hours[d] ?? []).map((o) => `${o.open}-${o.close}`).join(",");
  const groups: { from: Day; to: Day }[] = [];
  for (const d of DAYS) {
    if (!key(d)) continue;
    const last = groups.at(-1);
    const prev = DAYS[DAYS.indexOf(d) - 1];
    if (last && last.to === prev && key(prev) === key(d)) last.to = d;
    else groups.push({ from: d, to: d });
  }
  return groups
    .map(({ from, to }) => {
      const days = from === to ? day(from) : `${day(from)}–${day(to)}`;
      const times = (hours[from] ?? [])
        .map((o) => `${time(o.open)}–${time(o.close)}`)
        .join(", ");
      return `${days} ${times}`;
    })
    .join(" · ");
}

function readNumber(formData: FormData, name: string) {
  const text = String(formData.get(name) ?? "").trim();
  return text === "" ? null : Number(text);
}

export function parseBranchForm(formData: FormData): Parsed<BranchValues> {
  const errors: FieldErrors = {};
  const name = readText(formData, "name", 120, errors);
  if (!name) errors.name = "required";

  const state = String(formData.get("state_code") ?? "");
  if (state !== "" && !isStateCode(state)) errors.state_code = "invalidState";

  const lat = readNumber(formData, "geo_lat");
  const lng = readNumber(formData, "geo_lng");
  let radius = readNumber(formData, "geo_radius_m");
  if ((lat === null) !== (lng === null)) {
    errors.geo_lat = "coordinatesPair";
  } else if (lat !== null && lng !== null && !validCoordinates(lat, lng)) {
    errors.geo_lat = "invalidCoordinates";
  }
  if (lat !== null && radius === null) radius = RADIUS.default;
  if (
    radius !== null &&
    (!Number.isInteger(radius) || radius < RADIUS.min || radius > RADIUS.max)
  )
    errors.geo_radius_m = "invalidRadius";

  let operating_hours: OperatingHours = {};
  try {
    const parsed = normaliseHours(
      JSON.parse(String(formData.get("operating_hours") || "{}")),
    );
    if (parsed) operating_hours = parsed;
    else errors.operating_hours = "invalidHours";
  } catch {
    errors.operating_hours = "invalidHours";
  }

  return done(
    {
      name: name ?? "",
      address: readText(formData, "address", 500, errors),
      state_code: state === "" ? null : state,
      geo_lat: lat === null ? null : roundCoordinate(lat),
      geo_lng: lng === null ? null : roundCoordinate(lng),
      geo_radius_m: radius,
      operating_hours,
    },
    errors,
  );
}
