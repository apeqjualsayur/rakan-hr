// One place that maps every status to its tag / chip style (ui-system.md §4, §7).
// Status is always shown as text + colour (§1.5): each entry also names the
// message key for its label, under the "Status" namespace in messages/*.json.

export type Tone = "primary" | "info" | "warning" | "danger" | "neutral";

/** Pill colours per tone: tint background + dark text of the same family. */
export const toneClasses: Record<Tone, string> = {
  primary: "bg-primary-tint text-primary-strong",
  info: "bg-info-tint text-info",
  warning: "bg-warning-tint text-warning",
  danger: "bg-danger-tint text-danger",
  neutral: "bg-neutral-tint text-neutral",
};

/** Icon-tile colours per tone (credential rows: status-tinted 48 px tile). */
export const toneTileClasses: Record<Tone, string> = {
  primary: "bg-primary-tint text-primary",
  info: "bg-info-tint text-info",
  warning: "bg-warning-tint text-warning",
  danger: "bg-danger-tint text-danger",
  neutral: "bg-neutral-tint text-neutral",
};

/** Action-link colour per tone (Renew now = danger, Renew = warning, View/Add = primary). */
export const toneLinkClasses: Record<Tone, string> = {
  primary: "text-primary",
  info: "text-info",
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-neutral",
};

// Statuses per domain. Credential uses the derived validity_state plus the
// review states staff see on their own uploads (data-model.md §3.3).
export const statusTones = {
  credential: {
    upcoming: "info",
    valid: "primary",
    expiring_soon: "warning",
    expired: "danger",
    missing: "neutral",
    pending: "info",
    rejected: "danger",
  },
  cpd: {
    pending: "info",
    verified: "primary",
    rejected: "danger",
  },
  leave: {
    pending: "info",
    approved: "primary",
    rejected: "danger",
    cancelled: "neutral",
  },
  claim: {
    pending: "info",
    approved: "primary",
    rejected: "danger",
    paid: "primary",
  },
  ot: {
    pending: "info",
    approved: "primary",
    rejected: "danger",
  },
  payroll: {
    draft: "neutral",
    calculated: "info",
    reviewed: "info",
    approved: "primary",
    locked: "primary",
    paid: "primary",
  },
  policy: {
    awaiting_signature: "warning",
    overdue: "danger",
    signed: "primary",
  },
} as const satisfies Record<string, Record<string, Tone>>;

export type StatusDomain = keyof typeof statusTones;
export type StatusOf<D extends StatusDomain> = keyof (typeof statusTones)[D] &
  string;

/** Order of a payroll run (data-model.md `payroll_status`), used by the stepper. */
export const payrollSteps = [
  "draft",
  "calculated",
  "reviewed",
  "approved",
  "locked",
  "paid",
] as const satisfies readonly StatusOf<"payroll">[];

// Category tags on approval rows and notifications (§4 Category tag).
export const categoryTones = {
  credential: "info",
  leave: "primary",
  claim: "primary",
  overtime: "warning",
  bank_change: "danger",
} as const satisfies Record<string, Tone>;

export type Category = keyof typeof categoryTones;

export function statusTone<D extends StatusDomain>(
  domain: D,
  status: StatusOf<D>,
): Tone {
  return (statusTones[domain] as Record<string, Tone>)[status];
}

/** Message key (in the "Status" namespace) for a status label. */
export function statusLabelKey<D extends StatusDomain>(
  domain: D,
  status: StatusOf<D>,
) {
  return `${domain}.${status}` as const;
}
