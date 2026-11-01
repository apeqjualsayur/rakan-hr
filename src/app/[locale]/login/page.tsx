import { getTranslations } from "next-intl/server";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { LoginForm } from "./LoginForm";

export async function generateMetadata() {
  const t = await getTranslations("Auth");
  return { title: t("loginTitle") };
}

export default async function LoginPage() {
  const t = await getTranslations("Auth");
  return (
    <AuthLayout title={t("loginTitle")} intro={t("loginIntro")}>
      <LoginForm />
    </AuthLayout>
  );
}
