// Employee record tabs. Kept out of the client component so the server page can use them.
export const EMPLOYEE_TABS = [
  "personal",
  "employment",
  "statutory",
  "bank",
  "dependents",
  "documents",
] as const;
export type EmployeeTab = (typeof EMPLOYEE_TABS)[number];
