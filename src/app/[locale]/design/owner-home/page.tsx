import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminShell } from "@/components/layout/AdminShell";
import { OwnerHomeScreen } from "../_screens/OwnerHomeScreen";
import { demoPeople } from "../_screens/demo-data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Design.screens");
  return { title: t("owner") };
}

export default function OwnerHomeDesignPage() {
  return (
    <AdminShell active="home" unread user={demoPeople.owner}>
      <OwnerHomeScreen />
    </AdminShell>
  );
}
