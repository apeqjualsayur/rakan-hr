// EMP-03 contract history, EMP-05 bank accounts, dependents (PCB child relief) and
// EMP-06 documents: row shapes and form parsers.
import { storageFileName } from "@/lib/files";
import {
  done,
  readDate,
  readText,
  type FieldErrors,
  type Parsed,
} from "@/lib/settings/form";
import { readCheckbox, readChoice, readDecimal, readMoney } from "./fields";

export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "locum_contractor",
] as const;
export const PAY_MODELS = ["monthly", "hourly", "per_session"] as const;
export type PayModel = (typeof PAY_MODELS)[number];

export type EmploymentRecord = {
  id: string;
  employment_type: (typeof EMPLOYMENT_TYPES)[number];
  pay_model: PayModel;
  basic_salary: string | null;
  hourly_rate: string | null;
  session_rate: string | null;
  normal_hours_per_day: string | null;
  work_days_per_week: string | null;
  start_date: string;
  end_date: string | null;
  probation_end: string | null;
  confirmed_on: string | null;
  is_current: boolean;
};

export const EMPLOYMENT_COLUMNS =
  "id, employment_type, pay_model, basic_salary, hourly_rate, session_rate, normal_hours_per_day, work_days_per_week, start_date, end_date, probation_end, confirmed_on, is_current";

/** The pay column each pay model needs. */
export const RATE_FIELD = {
  monthly: "basic_salary",
  hourly: "hourly_rate",
  per_session: "session_rate",
} as const satisfies Record<PayModel, keyof EmploymentRecord>;

export type ContractValues = Omit<EmploymentRecord, "id" | "is_current">;

/** One employment record. Only the rate for the chosen pay model is kept. */
export function parseContract(
  formData: FormData,
  errors: FieldErrors = {},
): Parsed<ContractValues> {
  const employment_type =
    readChoice(formData, "employment_type", EMPLOYMENT_TYPES, errors, {
      required: true,
    }) ?? "full_time";
  const pay_model =
    readChoice(formData, "pay_model", PAY_MODELS, errors, {
      required: true,
    }) ?? "monthly";
  const rates = {
    basic_salary: readMoney(formData, "basic_salary", errors),
    hourly_rate: readMoney(formData, "hourly_rate", errors),
    session_rate: readMoney(formData, "session_rate", errors),
  };
  const rateField = RATE_FIELD[pay_model];
  if (rates[rateField] === null && !errors[rateField])
    errors[rateField] = "rateRequired";

  const start_date = readDate(formData, "start_date", errors);
  if (!start_date && !errors.start_date) errors.start_date = "required";
  const end_date = readDate(formData, "end_date", errors);
  const probation_end = readDate(formData, "probation_end", errors);
  const confirmed_on = readDate(formData, "confirmed_on", errors);
  for (const [name, value] of [
    ["end_date", end_date],
    ["probation_end", probation_end],
    ["confirmed_on", confirmed_on],
  ] as const) {
    if (start_date && value && value < start_date) errors[name] = "beforeStart";
  }

  return done(
    {
      employment_type,
      pay_model,
      basic_salary: rateField === "basic_salary" ? rates.basic_salary : null,
      hourly_rate: rateField === "hourly_rate" ? rates.hourly_rate : null,
      session_rate: rateField === "session_rate" ? rates.session_rate : null,
      normal_hours_per_day: readDecimal(
        formData,
        "normal_hours_per_day",
        errors,
        { min: 0.5, max: 24 },
      ),
      work_days_per_week: readDecimal(formData, "work_days_per_week", errors, {
        min: 0.5,
        max: 7,
        places: 1,
      }),
      start_date: start_date ?? "",
      end_date,
      probation_end,
      confirmed_on,
    },
    errors,
  );
}

// ── Bank accounts (EMP-05) ──

export type BankAccountStatus = "pending" | "active" | "retired" | "rejected";

export type BankAccount = {
  id: string;
  bank_code: string;
  account_no_last4: string;
  holder_name: string;
  is_primary: boolean;
  status: BankAccountStatus;
  verified_at: string | null;
  created_at: string;
};

export const BANK_ACCOUNT_COLUMNS =
  "id, bank_code, account_no_last4, holder_name, is_primary, status, verified_at, created_at";

export type Bank = { code: string; name: string };

export type BankAccountValues = {
  bank_code: string;
  account_no: string;
  holder_name: string;
};

/** Digits only, 6–20 long (the database checks the same). */
export function parseBankAccount(
  formData: FormData,
  bankCodes: readonly string[],
): Parsed<BankAccountValues> {
  const errors: FieldErrors = {};
  const bank_code = readChoice(formData, "bank_code", bankCodes, errors, {
    required: true,
  });
  const account_no = String(formData.get("account_no") ?? "").replace(
    /[\s-]/g,
    "",
  );
  if (account_no === "") errors.account_no = "required";
  else if (!/^\d{6,20}$/.test(account_no))
    errors.account_no = "invalidAccountNo";
  const holder_name = readText(formData, "holder_name", 200, errors);
  if (!holder_name) errors.holder_name = "required";
  return done(
    {
      bank_code: bank_code ?? "",
      account_no,
      holder_name: holder_name?.toUpperCase() ?? "",
    },
    errors,
  );
}

export function bankName(banks: readonly Bank[], code: string) {
  return banks.find((b) => b.code === code)?.name ?? code;
}

// ── Dependents ──

export const RELATIONSHIPS = ["spouse", "child"] as const;

export type Dependent = {
  id: string;
  name: string;
  relationship: (typeof RELATIONSHIPS)[number];
  date_of_birth: string | null;
  is_disabled: boolean;
  in_tertiary_education: boolean;
};

export const DEPENDENT_COLUMNS =
  "id, name, relationship, date_of_birth, is_disabled, in_tertiary_education";

export function parseDependent(
  formData: FormData,
  today: string,
): Parsed<Omit<Dependent, "id">> {
  const errors: FieldErrors = {};
  const name = readText(formData, "name", 200, errors);
  if (!name) errors.name = "required";
  const date_of_birth = readDate(formData, "date_of_birth", errors);
  if (date_of_birth && date_of_birth > today)
    errors.date_of_birth = "invalidDate";
  return done(
    {
      name: name ?? "",
      relationship:
        readChoice(formData, "relationship", RELATIONSHIPS, errors, {
          required: true,
        }) ?? "child",
      date_of_birth,
      is_disabled: readCheckbox(formData, "is_disabled"),
      in_tertiary_education: readCheckbox(formData, "in_tertiary_education"),
    },
    errors,
  );
}

// ── Documents (EMP-06), bucket `documents` ──

export const DOC_TYPES = [
  "ic_copy",
  "passport",
  "work_permit",
  "contract",
  "offer_letter",
  "probation_letter",
  "certificate",
  "other",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export type EmployeeDocument = {
  id: string;
  doc_type: DocType;
  title: string | null;
  file_path: string;
  expiry_date: string | null;
  created_at: string;
};

export const DOCUMENT_COLUMNS =
  "id, doc_type, title, file_path, expiry_date, created_at";

/** Storage enforces the same limits (bucket settings). */
export const DOCUMENT_FILES = {
  maxBytes: 10 * 1024 * 1024,
  mime: ["application/pdf", "image/jpeg", "image/png"],
  accept: ".pdf,.jpg,.jpeg,.png",
} as const;

export function documentFileProblem(file: { size: number; type: string }) {
  if (!(DOCUMENT_FILES.mime as readonly string[]).includes(file.type))
    return "fileType" as const;
  if (file.size > DOCUMENT_FILES.maxBytes) return "fileTooBig" as const;
  return null;
}

export function documentFolder(
  tenantId: string,
  employeeId: string,
  docType: DocType,
) {
  return `${tenantId}/${employeeId}/${docType}/`;
}

/** {tenant_id}/{employee_id}/{doc_type}/{timestamp}-{safe name} (data-model.md §6). */
export function documentPath(
  tenantId: string,
  employeeId: string,
  docType: DocType,
  fileName: string,
  now = Date.now(),
) {
  return `${documentFolder(tenantId, employeeId, docType)}${storageFileName(fileName, "document", now)}`;
}

export type DocumentValues = {
  doc_type: DocType;
  title: string | null;
  expiry_date: string | null;
};

export function parseDocument(formData: FormData): Parsed<DocumentValues> {
  const errors: FieldErrors = {};
  return done(
    {
      doc_type:
        readChoice(formData, "doc_type", DOC_TYPES, errors, {
          required: true,
        }) ?? "other",
      title: readText(formData, "title", 120, errors),
      expiry_date: readDate(formData, "expiry_date", errors),
    },
    errors,
  );
}

// ── Profile photo, bucket `avatars`: {tenant_id}/{employee_id}.{ext} ──

export const PHOTO_FILES = {
  maxBytes: 5 * 1024 * 1024,
  mime: ["image/jpeg", "image/png", "image/webp"],
  accept: ".jpg,.jpeg,.png,.webp",
} as const;

export function photoFileProblem(file: { size: number; type: string }) {
  if (!(PHOTO_FILES.mime as readonly string[]).includes(file.type))
    return "fileType" as const;
  if (file.size > PHOTO_FILES.maxBytes) return "fileTooBig" as const;
  return null;
}

export function photoPath(tenantId: string, employeeId: string, mime: string) {
  const ext =
    mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return `${tenantId}/${employeeId}.${ext}`;
}
