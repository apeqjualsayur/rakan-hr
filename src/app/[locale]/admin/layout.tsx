import { AdminShell } from "@/components/layout/AdminShell";

// Placeholder shell for admin roles. Role-based access is added in build step 3.
export default function AdminLayout({
  children,
}: LayoutProps<"/[locale]/admin">) {
  return <AdminShell>{children}</AdminShell>;
}
