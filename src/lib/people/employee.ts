// EMP-01 → EMP-04: the employee record (data-model.md §3.2) and the parsers for the
// Personal, Employment and Statutory tabs. Parsers are pure so they are unit-tested;
// error values are message keys under Settings.errors.
import {
  done,
  isUuid,
  readDate,
  readText,
  type FieldErrors,
  type Parsed,
} from "@/lib/settings/form";
import {
  readCheckbox,
  readChoice,
  readEmail,
  readInteger,
  readMoney,
  readPhone,
} from "./fields";
import { parseMyKad } from "./mykad";

export const EMPLOYEE_STATUSES = [
  "preboarding",
  "active",
  "on_notice",
  "left",
] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const ID_TYPES = ["mykad", "passport"] as const;
export const GENDERS = ["male", "female"] as const;
export const MARITAL_STATUSES = [
  "single",
  "married",
  "divorced",
  "widowed",
] as const;
export const RELIGIONS = [
  "islam",
  "buddhism",
  "christianity",
  "hinduism",
  "sikhism",
  "other",
] as const;
export const PCB_CATEGORIES = [
  "single",
  "married_spouse_not_working",
  "married_spouse_working",
] as const;

export type EmergencyContact = {
  name?: string;
  relationship?: string;
  phone?: string;
};

export type Employee = {
  id: string;
  employee_no: string;
  full_name: string;
  id_type: (typeof ID_TYPES)[number];
  id_no_last4: string | null;
  nationality: string;
  is_permanent_resident: boolean;
  date_of_birth: string | null;
  gender: (typeof GENDERS)[number] | null;
  marital_status: (typeof MARITAL_STATUSES)[number] | null;
  religion: (typeof RELIGIONS)[number] | null;
  pcb_category: (typeof PCB_CATEGORIES)[number] | null;
  spouse_working: boolean | null;
  children_count_eligible: number;
  email: string | null;
  phone: string | null;
  address: string | null;
  work_email: string | null;
  work_phone: string | null;
  emergency_contact: EmergencyContact;
  epf_no: string | null;
  socso_no: string | null;
  tax_no: string | null;
  eis_eligible: boolean | null;
  zakat_monthly: string | null;
  status: EmployeeStatus;
  branch_id: string | null;
  manager_id: string | null;
  job_role_id: string | null;
  job_title: string | null;
  photo_path: string | null;
  user_id: string | null;
};

// Listed explicitly: the encrypted IC columns are not readable through the API, so `*` fails.
export const EMPLOYEE_COLUMNS =
  "id, employee_no, full_name, id_type, id_no_last4, nationality, is_permanent_resident, date_of_birth, gender, marital_status, religion, pcb_category, spouse_working, children_count_eligible, email, phone, address, work_email, work_phone, emergency_contact, epf_no, socso_no, tax_no, eis_eligible, zakat_monthly, status, branch_id, manager_id, job_role_id, job_title, photo_path, user_id";

export const MALAYSIA = "MY";

export function isMalaysian(e: Pick<Employee, "nationality">) {
  return e.nationality === MALAYSIA;
}

/** Whole years between a "YYYY-MM-DD" birth date and `today`. */
export function ageOn(dateOfBirth: string, today: string) {
  const years = Number(today.slice(0, 4)) - Number(dateOfBirth.slice(0, 4));
  return today.slice(5) >= dateOfBirth.slice(5) ? years : years - 1;
}

/**
 * EIS default (payroll-rules.md §4): Malaysians and PRs aged 18 to under 60; never foreign
 * workers. null when the date of birth is unknown. HR can override per employee.
 * ⚠ VERIFY: first-time joiners aged 57+ may be excluded — the screen says so.
 */
export function defaultEisEligible(
  e: Pick<Employee, "nationality" | "is_permanent_resident" | "date_of_birth">,
  today: string,
): boolean | null {
  if (!isMalaysian(e) && !e.is_permanent_resident) return false;
  if (!e.date_of_birth) return null;
  const age = ageOn(e.date_of_birth, today);
  return age >= 18 && age < 60;
}

export type PersonalValues = {
  full_name: string;
  id_type: (typeof ID_TYPES)[number];
  /** Only present when a new number was typed; blank keeps the stored one. */
  id_no?: string;
  nationality: string;
  is_permanent_resident: boolean;
  date_of_birth: string | null;
  gender: Employee["gender"];
  marital_status: Employee["marital_status"];
  religion: Employee["religion"];
  email: string | null;
  phone: string | null;
  address: string | null;
  work_email: string | null;
  work_phone: string | null;
  emergency_contact: EmergencyContact;
};

/**
 * Personal tab (EMP-01). A new MyKad number sets date of birth and gender (EMP-02),
 * whatever was typed in those fields.
 */
export function parsePersonal(
  formData: FormData,
  today: string,
  errors: FieldErrors = {},
): Parsed<PersonalValues> {
  const full_name = readText(formData, "full_name", 200, errors);
  if (!full_name) errors.full_name = "required";
  const id_type = readChoice(formData, "id_type", ID_TYPES, errors) ?? "mykad";

  let date_of_birth = readDate(formData, "date_of_birth", errors);
  let gender = readChoice(formData, "gender", GENDERS, errors);
  let id_no: string | undefined;
  const typedId = String(formData.get("id_no") ?? "").trim();
  if (typedId !== "") {
    if (id_type === "mykad") {
      const ic = parseMyKad(typedId, today);
      if (ic.ok) {
        id_no = ic.value.digits;
        date_of_birth = ic.value.dateOfBirth;
        gender = ic.value.gender;
        delete errors.date_of_birth;
        delete errors.gender;
      } else {
        errors.id_no =
          ic.problem === "date"
            ? "invalidMykadDate"
            : ic.problem === "placeOfBirth"
              ? "invalidMykadPlace"
              : "invalidMykad";
      }
    } else {
      const passport = typedId.replace(/[\s-]/g, "").toUpperCase();
      if (/^[A-Z0-9]{5,20}$/.test(passport)) id_no = passport;
      else errors.id_no = "invalidPassport";
    }
  }
  if (date_of_birth && date_of_birth > today)
    errors.date_of_birth = "invalidDate";

  const malaysian = formData.get("nationality_kind") !== "other";
  const otherCountry = readText(formData, "nationality_other", 60, errors);
  if (!malaysian && !otherCountry) errors.nationality_other = "required";

  const emergencyPhone = readPhone(formData, "emergency_phone", errors);
  const emergency_contact: EmergencyContact = {};
  const emergencyName = readText(formData, "emergency_name", 200, errors);
  const emergencyRelationship = readText(
    formData,
    "emergency_relationship",
    60,
    errors,
  );
  if (emergencyName) emergency_contact.name = emergencyName;
  if (emergencyRelationship)
    emergency_contact.relationship = emergencyRelationship;
  if (emergencyPhone) emergency_contact.phone = emergencyPhone;

  return done(
    {
      full_name: full_name ?? "",
      id_type,
      ...(id_no ? { id_no } : {}),
      nationality: malaysian ? MALAYSIA : (otherCountry ?? ""),
      is_permanent_resident: !malaysian && readCheckbox(formData, "is_pr"),
      date_of_birth,
      gender,
      marital_status: readChoice(
        formData,
        "marital_status",
        MARITAL_STATUSES,
        errors,
      ),
      religion: readChoice(formData, "religion", RELIGIONS, errors),
      email: readEmail(formData, "email", errors),
      phone: readPhone(formData, "phone", errors),
      address: readText(formData, "address", 500, errors),
      work_email: readEmail(formData, "work_email", errors),
      work_phone: readPhone(formData, "work_phone", errors),
      emergency_contact,
    },
    errors,
  );
}

export type PlacementValues = {
  job_role_id: string | null;
  job_title: string | null;
  branch_id: string | null;
  manager_id: string | null;
  status: EmployeeStatus;
};

/** Employment tab, the "where they sit" part (EMP-03): role, title, branch, manager, status. */
export function parsePlacement(
  formData: FormData,
  errors: FieldErrors = {},
  selfId?: string,
): Parsed<PlacementValues> {
  const uuid = (name: string) => {
    const value = String(formData.get(name) ?? "");
    if (value === "") return null;
    if (!isUuid(value)) {
      errors[name] = "invalidChoice";
      return null;
    }
    return value;
  };
  const manager_id = uuid("manager_id");
  if (manager_id && manager_id === selfId) errors.manager_id = "managerLoop";
  return done(
    {
      job_role_id: uuid("job_role_id"),
      job_title: readText(formData, "job_title", 120, errors),
      branch_id: uuid("branch_id"),
      manager_id,
      status:
        readChoice(formData, "status", EMPLOYEE_STATUSES, errors, {
          required: true,
        }) ?? "active",
    },
    errors,
  );
}

export type StatutoryValues = {
  epf_no: string | null;
  socso_no: string | null;
  tax_no: string | null;
  eis_eligible: boolean | null;
  pcb_category: Employee["pcb_category"];
  spouse_working: boolean | null;
  children_count_eligible: number;
  zakat_monthly: string | null;
};

/** Statutory tab (EMP-04). EIS "auto" stores null so the default follows age and nationality. */
export function parseStatutory(formData: FormData): Parsed<StatutoryValues> {
  const errors: FieldErrors = {};
  const eis = readChoice(
    formData,
    "eis_eligible",
    ["auto", "yes", "no"],
    errors,
  );
  const pcb_category = readChoice(
    formData,
    "pcb_category",
    PCB_CATEGORIES,
    errors,
  );
  return done(
    {
      epf_no: readText(formData, "epf_no", 40, errors),
      socso_no: readText(formData, "socso_no", 40, errors),
      tax_no: readText(formData, "tax_no", 40, errors),
      eis_eligible: eis === "yes" ? true : eis === "no" ? false : null,
      pcb_category,
      // The PCB category already says whether the spouse works; keep the two in step.
      spouse_working:
        pcb_category === "married_spouse_working"
          ? true
          : pcb_category === "married_spouse_not_working"
            ? false
            : null,
      children_count_eligible:
        readInteger(formData, "children_count_eligible", errors, {
          min: 0,
          max: 99,
        }) ?? 0,
      zakat_monthly: readMoney(formData, "zakat_monthly", errors),
    },
    errors,
  );
}
