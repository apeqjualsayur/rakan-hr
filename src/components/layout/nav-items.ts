import {
  Clock,
  House,
  ShieldCheck,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react";

// ui-system.md §3. `href` is left out until the screen exists;
// those items render as disabled placeholders.
export type NavItem<Key extends string> = {
  key: Key;
  href?: string;
};

export type AdminNavKey =
  | "home"
  | "people"
  | "hiring"
  | "timeOff"
  | "payroll"
  | "compliance"
  | "reports";

export type StaffNavKey = "home" | "time" | "credentials" | "pay" | "me";

// The desktop top nav is text-only (reference screen); the bottom nav has icons.
export const adminNavItems: NavItem<AdminNavKey>[] = [
  { key: "home", href: "/admin" },
  { key: "people", href: "/admin/people" },
  { key: "hiring" },
  { key: "timeOff" },
  { key: "payroll" },
  { key: "compliance", href: "/admin/compliance" },
  { key: "reports" },
];

/** Active when on the item's page or below it; Home only on its own page. */
export function isNavActive(href: string | undefined, pathname: string) {
  if (!href) return false;
  if (href === "/admin" || href === "/staff") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const staffNavItems: (NavItem<StaffNavKey> & { icon: LucideIcon })[] = [
  { key: "home", icon: House, href: "/staff" },
  { key: "time", icon: Clock },
  { key: "credentials", icon: ShieldCheck, href: "/staff/credentials" },
  { key: "pay", icon: Wallet },
  { key: "me", icon: User, href: "/staff/me" },
];
