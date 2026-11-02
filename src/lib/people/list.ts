// Admin People list filters (status, branch, job role, employment type, search).
import type { EmployeeStatus } from "./employee";
import type { EMPLOYMENT_TYPES } from "./records";

export type ListPerson = {
  employee_no: string;
  full_name: string;
  status: EmployeeStatus;
  branch_id: string | null;
  job_role_id: string | null;
  job_title: string | null;
  employment_type: (typeof EMPLOYMENT_TYPES)[number] | null;
};

export type ListFilters = {
  status: EmployeeStatus | "all";
  branch: string; // "" = all, "none" = no branch
  role: string; // "" = all, "none" = no job role
  type: string; // "" = all
  query: string;
};

export const NO_FILTERS: ListFilters = {
  status: "all",
  branch: "",
  role: "",
  type: "",
  query: "",
};

/** Filters everything except status, so the status chips can show counts. */
export function filterPeople<P extends ListPerson>(
  people: readonly P[],
  f: Omit<ListFilters, "status">,
  roleName: (id: string | null) => string | null = () => null,
): P[] {
  const q = f.query.trim().toLowerCase();
  return people.filter(
    (p) =>
      (f.branch === "" || (p.branch_id ?? "none") === f.branch) &&
      (f.role === "" || (p.job_role_id ?? "none") === f.role) &&
      (f.type === "" || p.employment_type === f.type) &&
      (q === "" ||
        [p.full_name, p.employee_no, p.job_title, roleName(p.job_role_id)].some(
          (v) => v?.toLowerCase().includes(q),
        )),
  );
}
