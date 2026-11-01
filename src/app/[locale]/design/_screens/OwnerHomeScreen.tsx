import { BriefcaseBusiness, ShieldCheck, UserPlus, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ActionList, ActionRow } from "@/components/ui/ActionRow";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { CategoryTag } from "@/components/ui/CategoryTag";
import { DateTile } from "@/components/ui/DateTile";
import { HeroCard } from "@/components/ui/HeroCard";
import { PersonRow } from "@/components/ui/PersonRow";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { StatusChip } from "@/components/ui/StatusChip";
import { StatusStepper } from "@/components/ui/StatusStepper";
import { Link } from "@/i18n/navigation";
import {
  formatDate,
  formatMoney,
  greetingPeriod,
  maskNumber,
} from "@/lib/format";
import { DEMO_BANK, DEMO_NOW, DEMO_PAY_DATE, demoPeople } from "./demo-data";

// Recreation of ui-reference/desktop-owner-home.png.
// Single accent on this screen: "Continue review" (fix §6.4).
export function OwnerHomeScreen() {
  const locale = useLocale();
  const t = useTranslations("Demo");
  const tg = useTranslations("Greeting");

  return (
    <div className="flex flex-col gap-6">
      <HeroCard
        meta={`${formatDate(DEMO_NOW, locale, "long")} · ${t("branch")}`}
        greeting={tg(greetingPeriod(DEMO_NOW), { name: t("owner.name") })}
        summary={t("owner.summary", { count: 5 })}
        actions={
          <>
            <Button variant="on-hero">
              <Wallet aria-hidden />
              {t("owner.runPayroll")}
            </Button>
            <Button variant="on-hero">
              <UserPlus aria-hidden />
              {t("owner.addEmployee")}
            </Button>
            <Button variant="on-hero">
              <BriefcaseBusiness aria-hidden />
              {t("owner.postJob")}
            </Button>
            <Button variant="on-hero">
              <ShieldCheck aria-hidden />
              {t("owner.verifyCredentials")}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader
              title={t("owner.attentionTitle")}
              action={
                <Link
                  href="/design/owner-home"
                  className="text-label text-primary underline-offset-4 hover:underline"
                >
                  {t("owner.allApprovals")}
                </Link>
              }
            />
            <ActionList className="mt-4">
              <ActionRow
                lead={<CategoryTag category="credential" className="md:w-38" />}
                title={t("owner.rows.credentialTitle")}
                meta={t("owner.rows.credentialMeta")}
                action={
                  <Button variant="outline" size="row">
                    {t("owner.review")}
                  </Button>
                }
              />
              <ActionRow
                lead={<CategoryTag category="leave" className="md:w-38" />}
                title={t("owner.rows.leaveTitle")}
                meta={t("owner.rows.leaveMeta")}
                action={<Button size="row">{t("owner.approve")}</Button>}
              />
              <ActionRow
                lead={<CategoryTag category="overtime" className="md:w-38" />}
                title={t("owner.rows.overtimeTitle")}
                meta={t("owner.rows.overtimeMeta")}
                action={<Button size="row">{t("owner.approve")}</Button>}
              />
              <ActionRow
                lead={<CategoryTag category="claim" className="md:w-38" />}
                title={t("owner.rows.claimTitle", {
                  amount: formatMoney(86.4),
                })}
                meta={t("owner.rows.claimMeta")}
                action={<Button size="row">{t("owner.approve")}</Button>}
              />
              <ActionRow
                lead={
                  <CategoryTag category="bank_change" className="md:w-38" />
                }
                title={t("owner.rows.bankTitle")}
                meta={t("owner.rows.bankMeta")}
                action={
                  <Button variant="danger-outline" size="row">
                    {t("owner.review")}
                  </Button>
                }
              />
            </ActionList>
          </Card>

          <Card className="flex flex-col gap-6">
            <StatusStepper
              current="calculated"
              title={t("owner.payrollTitle")}
              context={t("owner.payrollContext", {
                date: formatDate(DEMO_PAY_DATE, locale, "weekdayShort"),
                account: `${DEMO_BANK.name} ${maskNumber(DEMO_BANK.number)}`,
              })}
            />
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-8">
              <p className="text-body text-ink-muted">
                {t("owner.payrollBody")}
              </p>
              <Button variant="accent" className="shrink-0">
                {t("owner.continueReview")}
              </Button>
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title={t("owner.whosOut")} />
            <div className="mt-5 flex flex-col gap-5">
              <PersonRow {...demoPeople.farah} meta={t("owner.out.farah")} />
              <PersonRow {...demoPeople.daniel} meta={t("owner.out.daniel")} />
              <PersonRow {...demoPeople.amir} meta={t("owner.out.amir")} />
            </div>
          </Card>

          <Card>
            <CardHeader title={t("owner.credentialHealth")} />
            <ProgressRing
              percent={86}
              body={t("owner.healthBody")}
              className="mt-5"
            />
            <ul className="mt-5 divide-y divide-border border-t border-border">
              {(
                [
                  ["amir", "expired"],
                  ["nurul", "expiring_soon"],
                  ["daniel", "missing"],
                ] as const
              ).map(([who, status]) => (
                <li
                  key={who}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-body font-medium text-ink">
                      {t(`owner.health.${who}Title`)}
                    </p>
                    <p className="text-meta text-ink-muted">
                      {t(`owner.health.${who}Meta`)}
                    </p>
                  </div>
                  <StatusChip domain="credential" status={status} short />
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title={t("owner.comingUp")} />
            <div className="mt-5 flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <DateTile date={new Date("2026-11-07T01:00:00Z")} />
                <div className="min-w-0">
                  <p className="text-h3 font-medium text-ink">
                    {t("owner.salariesTitle")}
                  </p>
                  <p className="text-meta text-ink-muted">
                    {t("owner.salariesMeta")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <DateTile date={new Date("2026-11-15T01:00:00Z")} />
                <div className="min-w-0">
                  <p className="text-h3 font-medium text-ink">
                    {t("owner.statutoryTitle")}
                  </p>
                  <p className="text-meta text-ink-muted">
                    {t("owner.statutoryMeta")}
                  </p>
                </div>
              </div>
            </div>
            <ProgressBar
              value={5}
              max={7}
              label={t("owner.checklist")}
              valueLabel={t("owner.checklistValue", { done: 5, total: 7 })}
              className="mt-5 border-t border-border pt-5"
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
