import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StaffShell } from "@/components/layout/StaffShell";
import { StaffHomeScreen } from "../_screens/StaffHomeScreen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Design.screens");
  return { title: t("staff") };
}

export default function StaffHomeDesignPage() {
  return (
    <StaffShell active="home">
      <StaffHomeScreen />
    </StaffShell>
  );
}
