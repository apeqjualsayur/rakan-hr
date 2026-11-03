// Step 6: pure rules for the credential screens, unit-tested in logic.test.ts.
// The database decides each status (credential_status_rows_all); this file only turns a
// status into words, actions, summaries and form values.
import {
  done,
  readDate,
  readText,
  type FieldErrors,
  type Parsed,
} from "@/lib/settings/form";
import { readChoice, readDecimal } from "@/lib/people/fields";
import {
  CPD_CATEGORIES,
  type CredentialStatusRow,
  type CredentialType,
  type DisplayStatus,
} from "./types";

/** The credential type's name in the viewer's language. */
export function typeName(
  t: { name_en: string; name_ms: string },
  locale: string,
) {
  return locale === "ms" ? t.name_ms : t.name_en;
}

/** Rows that need the person to act (CRD-04 "Action needed" chip). */
export function needsAction(
  row: Pick<CredentialStatusRow, "display_status" | "requirement">,
) {
  return (
    row.display_status === "expired" ||
    row.display_status === "expiring_soon" ||
    row.display_status === "rejected" ||
    (row.display_status === "missing" && row.requirement === "mandatory")
  );
}

export type RowAction = "renewNow" | "renew" | "view" | "add" | "resubmit";

/**
 * The action link on a credential row (ui-system.md §4: Renew now = danger, Renew = warning,
 * View / Add = primary) and the record it opens.
 */
export function rowAction(row: CredentialStatusRow): {
  action: RowAction;
  /** Path below the credentials home: "new?type=…" or "<record id>". */
  target: string;
} {
  const add = (renew?: string | null) =>
    `new?type=${row.credential_type_id}${renew ? `&renew=${renew}` : ""}`;
  switch (row.display_status) {
    case "expired":
      return { action: "renewNow", target: add(row.verified_id) };
    case "expiring_soon":
      return { action: "renew", target: add(row.verified_id) };
    case "pending":
      return { action: "view", target: row.pending_id! };
    case "rejected":
      return { action: "resubmit", target: add(row.verified_id) };
    case "missing":
      return { action: "add", target: add() };
    default:
      return { action: "view", target: row.verified_id! };
  }
}

/** Whole days from today ("YYYY-MM-DD") to a date; negative when past. */
export function daysBetween(fromIso: string, toIso: string) {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) /
      86_400_000,
  );
}

export type CredentialSummary = {
  mandatoryTotal: number;
  mandatoryValid: number;
  percent: number;
  /** The most urgent mandatory credential, for the action-led line under the ring. */
  focus: {
    row: CredentialStatusRow;
    kind: "expired" | "missing" | "rejected" | "expiring";
  } | null;
};

/** CRD-13: valid mandatory ÷ mandatory. Expiring soon still counts as valid. */
export function summarise(
  rows: readonly CredentialStatusRow[],
): CredentialSummary {
  const mandatory = rows.filter((r) => r.requirement === "mandatory");
  const valid = mandatory.filter(
    (r) => r.validity === "valid" || r.validity === "expiring_soon",
  );
  const pick = (status: DisplayStatus) =>
    mandatory
      .filter((r) => r.display_status === status)
      .sort(
        (a, b) =>
          (a.days_left ?? 0) - (b.days_left ?? 0) ||
          a.sort_order - b.sort_order,
      )[0];
  const expired = pick("expired");
  const missing = pick("missing");
  const rejected = pick("rejected");
  const expiring = pick("expiring_soon");
  return {
    mandatoryTotal: mandatory.length,
    mandatoryValid: valid.length,
    percent: mandatory.length
      ? Math.round((100 * valid.length) / mandatory.length)
      : 100,
    focus: expired
      ? { row: expired, kind: "expired" }
      : missing
        ? { row: missing, kind: "missing" }
        : rejected
          ? { row: rejected, kind: "rejected" }
          : expiring
            ? { row: expiring, kind: "expiring" }
            : null,
  };
}

/** Required ones first (mandatory, then optional), most urgent first, then catalogue order. */
export function sortRows(rows: readonly CredentialStatusRow[]) {
  const urgency: Record<DisplayStatus, number> = {
    expired: 0,
    rejected: 1,
    missing: 2,
    expiring_soon: 3,
    pending: 4,
    upcoming: 5,
    valid: 6,
  };
  const req = (r: CredentialStatusRow) =>
    r.requirement === "mandatory" ? 0 : r.requirement === "optional" ? 1 : 2;
  return rows.toSorted(
    (a, b) =>
      urgency[a.display_status] - urgency[b.display_status] ||
      req(a) - req(b) ||
      a.sort_order - b.sort_order,
  );
}

/** Default expiry from the effective date and the type's usual validity (a form hint only). */
export function suggestExpiry(effective: string, months: number | null) {
  if (!months || !/^\d{4}-\d{2}-\d{2}$/.test(effective)) return "";
  const [y, m, d] = effective.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  // Valid through the day before the anniversary.
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export type CredentialValues = {
  credential_type_id: string;
  reference_no: string | null;
  issuing_body: string | null;
  effective_date: string;
  expiry_date: string | null;
  cpd_points: string | null;
  notes: string | null;
};

/** CRD-05 / CRD-06: the add / renew form. Future effective dates are allowed (Upcoming). */
export function parseCredential(
  formData: FormData,
  types: readonly Pick<CredentialType, "id" | "has_expiry" | "tracks_cpd">[],
): Parsed<CredentialValues> {
  const errors: FieldErrors = {};
  const type = types.find((t) => t.id === formData.get("credential_type_id"));
  if (!type) errors.credential_type_id = "invalidChoice";
  const effective_date = readDate(formData, "effective_date", errors);
  if (!effective_date && !errors.effective_date)
    errors.effective_date = "required";
  let expiry_date = readDate(formData, "expiry_date", errors);
  if (type?.has_expiry && !expiry_date && !errors.expiry_date)
    errors.expiry_date = "required";
  if (type && !type.has_expiry) expiry_date = null;
  if (effective_date && expiry_date && expiry_date <= effective_date)
    errors.expiry_date = "expiryBeforeEffective";
  return done(
    {
      credential_type_id: type?.id ?? "",
      reference_no: readText(formData, "reference_no", 100, errors),
      issuing_body: readText(formData, "issuing_body", 200, errors),
      effective_date: effective_date ?? "",
      expiry_date,
      cpd_points: type?.tracks_cpd
        ? readDecimal(formData, "cpd_points", errors, {
            min: 0,
            max: 9999,
            places: 1,
          })
        : null,
      notes: readText(formData, "notes", 1000, errors),
    },
    errors,
  );
}

export type CpdValues = {
  credential_type_id: string;
  title: string;
  provider: string | null;
  activity_date: string;
  points: string;
  hours: string | null;
  category: (typeof CPD_CATEGORIES)[number];
};

/** CRD-18: one CPD activity. */
export function parseCpd(
  formData: FormData,
  cpdTypeIds: readonly string[],
  today: string,
): Parsed<CpdValues> {
  const errors: FieldErrors = {};
  const credential_type_id = readChoice(
    formData,
    "credential_type_id",
    cpdTypeIds,
    errors,
    {
      required: true,
    },
  );
  const title = readText(formData, "title", 200, errors);
  if (!title) errors.title = "required";
  const activity_date = readDate(formData, "activity_date", errors);
  if (!activity_date && !errors.activity_date)
    errors.activity_date = "required";
  if (activity_date && activity_date > today)
    errors.activity_date = "invalidDate";
  const points = readDecimal(formData, "points", errors, {
    min: 0,
    max: 999,
    places: 1,
  });
  if (points === null && !errors.points) errors.points = "required";
  return done(
    {
      credential_type_id: credential_type_id ?? "",
      title: title ?? "",
      provider: readText(formData, "provider", 200, errors),
      activity_date: activity_date ?? "",
      points: points ?? "0",
      hours: readDecimal(formData, "hours", errors, {
        min: 0,
        max: 999,
        places: 1,
      }),
      category:
        readChoice(formData, "category", CPD_CATEGORIES, errors) ?? "course",
    },
    errors,
  );
}

export type MatrixColumn = {
  id: string;
  code: string;
  name_en: string;
  name_ms: string;
};
export type MatrixCell = Pick<
  CredentialStatusRow,
  | "display_status"
  | "requirement"
  | "expiry_date"
  | "verified_id"
  | "pending_id"
> | null;

/**
 * CRD-15 compliance matrix: one column per credential type any role requires (catalogue
 * order), one row per employee; a cell is null where their role does not require it.
 */
export function buildMatrix(rows: readonly CredentialStatusRow[]) {
  const required = rows.filter((r) => r.requirement !== null);
  const columns = [
    ...new Map(
      required
        .toSorted((a, b) => a.sort_order - b.sort_order)
        .map((r) => [
          r.credential_type_id,
          {
            id: r.credential_type_id,
            code: r.type_code,
            name_en: r.name_en,
            name_ms: r.name_ms,
          },
        ]),
    ).values(),
  ];
  const cells = new Map<string, Map<string, MatrixCell>>();
  for (const r of required) {
    const row = cells.get(r.employee_id) ?? new Map<string, MatrixCell>();
    row.set(r.credential_type_id, {
      display_status: r.display_status,
      requirement: r.requirement,
      expiry_date: r.expiry_date,
      verified_id: r.verified_id,
      pending_id: r.pending_id,
    });
    cells.set(r.employee_id, row);
  }
  return {
    columns,
    cell: (employeeId: string, typeId: string): MatrixCell =>
      cells.get(employeeId)?.get(typeId) ?? null,
  };
}
