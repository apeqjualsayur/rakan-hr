import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { StaffShell } from "@/components/layout/StaffShell";
import { Fab } from "@/components/ui/Fab";
import { MyCredentialsScreen } from "../_screens/MyCredentialsScreen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Design.screens");
  return { title: t("credentials") };
}

export default function MyCredentialsDesignPage() {
  const t = useTranslations("Demo.credentials");
  return (
    <StaffShell active="credentials">
      <MyCredentialsScreen />
      {/* Room so the fixed FAB never covers the last row. */}
      <div aria-hidden className="h-20" />
      <Fab label={t("add")} href="/design/my-credentials" />
    </StaffShell>
  );
}
