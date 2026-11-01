import { StaffShell } from "@/components/layout/StaffShell";

// Placeholder mobile shell for staff. Role-based access is added in build step 3.
export default function StaffLayout({
  children,
}: LayoutProps<"/[locale]/staff">) {
  return <StaffShell>{children}</StaffShell>;
}
