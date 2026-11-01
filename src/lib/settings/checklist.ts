// ORG-04 Employer Setup Checklist. Rows are created by the database
// (seed_setup_checklist); this file reads them for the checklist screen and the Owner home card.

export const CHECKLIST_STATUSES = [
  "not_started",
  "in_progress",
  "done",
  "not_applicable",
] as const;
export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number];

/** The seven items, in the order the database seeds them. Labels live in Settings.checklist.items. */
export const CHECKLIST_CODES = [
  "EPF_REGISTRATION",
  "SOCSO_REGISTRATION",
  "LHDN_E_NUMBER",
  "PAYROLL_BANK_ACCOUNT",
  "PDPA_PRIVACY_NOTICE",
  "DPO_APPOINTED",
  "HRDCORP_REGISTRATION",
] as const;
export type ChecklistCode = (typeof CHECKLIST_CODES)[number];

/** Deadlines marked ⚠ VERIFY in payroll-rules.md: the screen says to confirm them. */
export const UNVERIFIED_DEADLINES: readonly ChecklistCode[] = [
  "EPF_REGISTRATION",
  "SOCSO_REGISTRATION",
];

export type ChecklistItem = {
  id: string;
  code: string;
  title: string;
  sort_order: number;
  due_rule: string | null;
  due_date: string | null;
  status: ChecklistStatus;
  evidence_file_path: string | null;
  completed_at: string | null;
};

export const CHECKLIST_COLUMNS =
  "id, code, title, sort_order, due_rule, due_date, status, evidence_file_path, completed_at";

export function isChecklistStatus(value: unknown): value is ChecklistStatus {
  return (CHECKLIST_STATUSES as readonly unknown[]).includes(value);
}

export function isChecklistCode(value: string): value is ChecklistCode {
  return (CHECKLIST_CODES as readonly string[]).includes(value);
}

const isOpen = (item: ChecklistItem) =>
  item.status !== "done" && item.status !== "not_applicable";

/** Progress counts only the items that apply: "3 of 6". */
export function checklistProgress(items: readonly ChecklistItem[]) {
  const applicable = items.filter((i) => i.status !== "not_applicable");
  return {
    done: applicable.filter((i) => i.status === "done").length,
    total: applicable.length,
  };
}

/** `today` is malaysiaToday(): "YYYY-MM-DD", compared as text with the due date. */
export function isOverdue(item: ChecklistItem, today: string) {
  return isOpen(item) && item.due_date !== null && item.due_date < today;
}

/** The status chip to show: the stored status, or "overdue" past the due date. */
export function displayStatus(
  item: ChecklistItem,
  today: string,
): ChecklistStatus | "overdue" {
  return isOverdue(item, today) ? "overdue" : item.status;
}

/** The open item to do next: earliest due date first, undated items last. */
export function nextItem(items: readonly ChecklistItem[]) {
  return (
    items
      .filter(isOpen)
      .toSorted(
        (a, b) =>
          (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
          a.sort_order - b.sort_order,
      )[0] ?? null
  );
}

/** "first_hire+7" → { anchor: "first_hire", days: 7 }. */
export function describeRule(rule: string | null) {
  const match = rule?.match(/^(first_hire|first_payday)([+-]\d+)$/);
  if (!match) return null;
  return {
    anchor: match[1] as "first_hire" | "first_payday",
    days: Number(match[2]),
  };
}

// Evidence files (bucket `company`, data-model.md §6). Storage enforces the same limits.
export const EVIDENCE = {
  maxBytes: 10 * 1024 * 1024,
  mime: ["application/pdf", "image/jpeg", "image/png"],
  accept: ".pdf,.jpg,.jpeg,.png",
} as const;

export function evidenceProblem(file: { size: number; type: string }) {
  if (!(EVIDENCE.mime as readonly string[]).includes(file.type))
    return "fileType" as const;
  if (file.size > EVIDENCE.maxBytes) return "fileTooBig" as const;
  return null;
}

/** {tenant_id}/setup-checklist/{item_id}/{timestamp}-{safe name} */
export function evidencePath(
  tenantId: string,
  itemId: string,
  fileName: string,
  now = Date.now(),
) {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const name = `${now}-${base || "evidence"}${/^[a-z0-9]{1,5}$/.test(ext) ? `.${ext}` : ""}`;
  return `${evidenceFolder(tenantId, itemId)}${name}`;
}

export function evidenceFolder(tenantId: string, itemId: string) {
  return `${tenantId}/setup-checklist/${itemId}/`;
}

/** The original-looking file name, for display ("1730000000000-epf.pdf" → "epf.pdf"). */
export function evidenceFileName(path: string) {
  return (path.split("/").at(-1) ?? path).replace(/^\d+-/, "");
}
