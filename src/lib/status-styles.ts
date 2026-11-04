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
    withdrawn: "neutral",
  },
  // A single credential record (staff_credentials.status), on its detail page and history.
  credentialRecord: {
    draft: "neutral",
    pending: "info",
    verified: "primary",
    rejected: "danger",
    superseded: "neutral",
    withdrawn: "neutral",
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
    cancelled: "neutral",
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
  // Employer Setup Checklist (ORG-04): checklist_status plus the derived "overdue".
  checklist: {
    not_started: "neutral",
    in_progress: "info",
    done: "primary",
    not_applicable: "neutral",
    overdue: "danger",
  },
  // Settings > Users.
  membership: {
    invited: "info",
    active: "primary",
    deactivated: "neutral",
  },
  // People (Step 5): employees.status, profile change requests, bank accounts.
  employee: {
    preboarding: "info",
    active: "primary",
    on_notice: "warning",
    left: "neutral",
  },
  changeRequest: {
    pending: "info",
    approved: "primary",
    rejected: "danger",
    cancelled: "neutral",
  },
  bankAccount: {
    pending: "info",
    active: "primary",
    retired: "neutral",
    rejected: "danger",
  },
  // Hiring (Step 8): candidate stage, offer, job opening, probation.
  candidate: {
    applied: "neutral",
    interview: "info",
    offer: "warning",
    hired: "primary",
    rejected: "danger",
  },
  offer: {
    draft: "neutral",
    sent: "info",
    expired: "danger",
    accepted: "primary",
    withdrawn: "neutral",
  },
  opening: {
    open: "primary",
    on_hold: "warning",
    closed: "neutral",
  },
  probation: {
    none: "neutral",
    on_probation: "info",
    due: "warning",
    overdue: "danger",
    review_submitted: "info",
    confirmed: "primary",
  },
  probationReview: {
    submitted: "info",
    approved: "primary",
    rejected: "danger",
    cancelled: "neutral",
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
  profile_change: "info",
  probation_review: "warning",
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
