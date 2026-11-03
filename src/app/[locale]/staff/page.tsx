import { getTranslations } from "next-intl/server";
import {
  AnnouncementsCard,
  PoliciesBanner,
} from "@/components/policies/HomeCards";

// Staff home. Step 16 builds the full reference screen; until then it shows what needs
// the person now (policies to sign) and the latest announcements (POL-01, POL-02).
export default async function StaffHomePage() {
  const t = await getTranslations("Placeholder");
  return (
    <div className="flex flex-col gap-3">
      <PoliciesBanner area="/staff" />
      <section className="mt-2 rounded-card border border-border bg-surface p-5">
        <h1 className="text-[30px] leading-[38px] font-bold tracking-tight">
          {t("staffTitle")}
        </h1>
        <p className="mt-2 text-ink-muted">{t("body")}</p>
      </section>
      <AnnouncementsCard area="/staff" />
    </div>
  );
}
