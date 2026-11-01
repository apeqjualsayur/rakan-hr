import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

export default async function SettingsPage() {
  redirect({ href: "/admin/settings/company", locale: await getLocale() });
}
