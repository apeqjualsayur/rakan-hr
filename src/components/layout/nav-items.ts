import {
  CalendarDays,
  ChartColumn,
  Clock,
  House,
  ShieldCheck,
  User,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

// ui-system.md §3. `href` is left out until the screen exists;
// those items render as disabled placeholders.
export type NavItem<Key extends string> = {
  key: Key;
  icon: LucideIcon;
  href?: string;
};

export const adminNavItems: NavItem<
  | "home"
  | "people"
  | "hiring"
  | "timeOff"
  | "payroll"
  | "compliance"
  | "reports"
>[] = [
  { key: "home", icon: House, href: "/admin" },
  { key: "people", icon: Users },
  { key: "hiring", icon: UserPlus },
  { key: "timeOff", icon: CalendarDays },
  { key: "payroll", icon: Wallet },
  { key: "compliance", icon: ShieldCheck },
  { key: "reports", icon: ChartColumn },
];

export const staffNavItems: NavItem<
  "home" | "time" | "credentials" | "pay" | "me"
>[] = [
  { key: "home", icon: House, href: "/staff" },
  { key: "time", icon: Clock },
  { key: "credentials", icon: ShieldCheck },
  { key: "pay", icon: Wallet },
  { key: "me", icon: User },
];
