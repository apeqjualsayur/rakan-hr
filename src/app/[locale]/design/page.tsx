import type { Metadata } from "next";
import {
  CalendarDays,
  Clock,
  FileText,
  ReceiptText,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { Logo } from "@/components/layout/Logo";
import {
  ActionList,
  ActionRow,
  ActionRowSkeleton,
} from "@/components/ui/ActionRow";
import { AttentionBanner } from "@/components/ui/AttentionBanner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { CategoryTag } from "@/components/ui/CategoryTag";
import {
  CredentialRow,
  CredentialRowSkeleton,
} from "@/components/ui/CredentialRow";
import { DateTile } from "@/components/ui/DateTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { Fab } from "@/components/ui/Fab";
import { HeroCard } from "@/components/ui/HeroCard";
import { LocationPill } from "@/components/ui/LocationPill";
import { MaskedValue } from "@/components/ui/MaskedValue";
import { PersonRow } from "@/components/ui/PersonRow";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { QuickActionTile } from "@/components/ui/QuickActionTile";
import { ShiftHeroCard } from "@/components/ui/ShiftHeroCard";
import { StatCard, StatCardSkeleton } from "@/components/ui/StatCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { StatusStepper } from "@/components/ui/StatusStepper";
import { TextField } from "@/components/ui/TextField";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import {
  categoryTones,
  payrollSteps,
  statusTones,
  type Category,
  type StatusDomain,
} from "@/lib/status-styles";
import {
  DEMO_BANK,
  DEMO_NOW,
  DEMO_SHIFT,
  demoPeople,
} from "./_screens/demo-data";
import { FilterChipsDemo } from "./_screens/FilterChipsDemo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Design");
  return { title: t("title") };
}

const sectionIds = [
  "colours",
  "type",
  "buttons",
  "tags",
  "rows",
  "heroes",
  "tiles",
  "stats",
  "stepper",
  "people",
  "credentials",
  "fields",
  "screens",
] as const;

const colourTokens = [
  ["canvas", "bg-canvas", "#F6F3EA"],
  ["surface", "bg-surface", "#FFFFFF"],
  ["border", "bg-border", "#E4DFD0"],
  ["track", "bg-track", "#EFEBDD"],
  ["ink", "bg-ink", "#1E2A24"],
  ["ink-muted", "bg-ink-muted", "#5B6B62"],
  ["ink-soft", "bg-ink-soft", "#3C4A42"],
  ["primary", "bg-primary", "#1E6B52"],
  ["primary-strong", "bg-primary-strong", "#14503D"],
  ["primary-tint", "bg-primary-tint", "#DDEEE5"],
  ["primary-on-hero", "bg-primary-on-hero", "#478671"],
  ["accent", "bg-accent", "#C4461F"],
  ["info", "bg-info", "#2D4F9C"],
  ["info-tint", "bg-info-tint", "#E1E9FB"],
  ["warning", "bg-warning", "#7A4F00"],
  ["warning-tint", "bg-warning-tint", "#FBEBC5"],
  ["danger", "bg-danger", "#A12A17"],
  ["danger-tint", "bg-danger-tint", "#FADDD6"],
  ["neutral", "bg-neutral", "#4B5750"],
  ["neutral-tint", "bg-neutral-tint", "#E8E5DA"],
  ["avatar-amber", "bg-avatar-amber", "#F2C879"],
  ["avatar-mint", "bg-avatar-mint", "#BFE0D0"],
  ["avatar-rose", "bg-avatar-rose", "#F4B9A6"],
] as const;

const typeStyles = [
  ["display", "text-display", "40/48 · 700"],
  ["display (mobile)", "text-display-sm", "30/38 · 700"],
  ["h2", "text-h2", "24/32 · 600"],
  ["h3", "text-h3", "17/24 · 600"],
  ["body", "text-body", "16/24 · 400"],
  ["meta", "text-meta text-ink-muted", "14/20 · 400"],
  ["label", "text-label", "14/20 · 600"],
  ["stat", "text-stat tabular-nums", "36/40 · 700"],
] as const;

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6">
      <h2 id={`${id}-title`} className="mb-4 text-h2 text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

function StateLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-label text-ink-muted uppercase">{children}</p>;
}

export default function DesignPage() {
  const locale = useLocale();
  const t = useTranslations("Design");
  const td = useTranslations("Demo");
  const ts = useTranslations("Shift");
  const tg = useTranslations("Greeting");
  const shiftRange = `${formatTime(DEMO_SHIFT.start, locale)} – ${formatTime(DEMO_SHIFT.end, locale)}`;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-12 px-4 py-6 md:px-8 md:py-10 xl:px-16">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <Logo href="/" />
          <LanguageToggle />
        </div>
        <h1 className="text-display-sm md:text-display">{t("title")}</h1>
        <p className="max-w-3xl text-body text-ink-muted">{t("intro")}</p>
        <p className="max-w-3xl text-meta text-ink-muted">
          {t("interactiveNote")}
        </p>
        <nav aria-label={t("jumpTo")}>
          <ul className="flex flex-wrap gap-2">
            {sectionIds.map((id) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-4 text-label text-ink hover:border-ink-muted"
                >
                  {t(`sections.${id}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <Section id="colours" title={t("sections.colours")}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {colourTokens.map(([name, className, hex]) => (
            <li
              key={name}
              className="overflow-hidden rounded-control border border-border bg-surface"
            >
              <div className={`h-14 ${className}`} />
              <div className="px-3 py-2">
                <p className="text-label text-ink">{name}</p>
                <p className="text-meta text-ink-muted">{hex}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="type" title={t("sections.type")}>
        <Card className="flex flex-col gap-4">
          {typeStyles.map(([name, className, spec]) => (
            <div
              key={name}
              className="flex flex-col gap-1 border-b border-border pb-4 last:border-0 last:pb-0 md:flex-row md:items-baseline md:gap-6"
            >
              <p className="w-40 shrink-0 text-meta text-ink-muted">
                {name} · {spec}
              </p>
              <p className={`min-w-0 ${className}`}>{t("typeSample")}</p>
            </div>
          ))}
        </Card>
      </Section>

      <Section id="buttons" title={t("sections.buttons")}>
        <Card className="flex flex-col gap-6">
          {(
            [
              ["primary", td("owner.approve")],
              ["accent", ts("clockIn")],
              ["outline", td("owner.review")],
              ["danger-outline", td("owner.review")],
              ["link", td("owner.allApprovals")],
            ] as const
          ).map(([variant, label]) => (
            <div key={variant}>
              <StateLabel>{variant}</StateLabel>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant={variant}>{label}</Button>
                <Button variant={variant} disabled>
                  {label} · {t("states.disabled")}
                </Button>
                <Button variant={variant} loading>
                  {t("states.loading")}
                </Button>
              </div>
            </div>
          ))}
          <div className="rounded-tile bg-primary p-5">
            <StateLabel>
              <span className="text-white/80">on-hero</span>
            </StateLabel>
            <div className="flex flex-wrap gap-3">
              <Button variant="on-hero">
                <UserPlus aria-hidden />
                {td("owner.addEmployee")}
              </Button>
              <Button variant="on-hero" disabled>
                <ShieldCheck aria-hidden />
                {t("states.disabled")}
              </Button>
            </div>
          </div>
        </Card>
      </Section>

      <Section id="tags" title={t("sections.tags")}>
        <Card className="flex flex-col gap-5">
          <div>
            <StateLabel>category</StateLabel>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(categoryTones) as Category[]).map((category) => (
                <CategoryTag key={category} category={category} />
              ))}
            </div>
          </div>
          {(Object.keys(statusTones) as StatusDomain[]).map((domain) => (
            <div key={domain}>
              <StateLabel>{domain}</StateLabel>
              <div className="flex flex-wrap gap-2">
                {Object.keys(statusTones[domain]).map((status) => (
                  <StatusChip
                    key={status}
                    domain={domain}
                    status={status as never}
                  />
                ))}
              </div>
            </div>
          ))}
        </Card>
      </Section>

      <Section id="rows" title={t("sections.rows")}>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title={td("owner.attentionTitle")} />
            <ActionList className="mt-4">
              <ActionRow
                lead={<CategoryTag category="leave" className="md:w-38" />}
                title={td("owner.rows.leaveTitle")}
                meta={td("owner.rows.leaveMeta")}
                action={<Button size="row">{td("owner.approve")}</Button>}
              />
              <ActionRow
                lead={
                  <CategoryTag category="bank_change" className="md:w-38" />
                }
                title={td("owner.rows.bankTitle")}
                meta={td("owner.rows.bankMeta")}
                action={
                  <Button variant="danger-outline" size="row">
                    {td("owner.review")}
                  </Button>
                }
              />
            </ActionList>
          </Card>
          <div className="flex flex-col gap-6">
            <Card>
              <StateLabel>{t("states.loading")}</StateLabel>
              <Skeleton className="h-8 w-56" />
              <ActionList className="mt-4" aria-busy>
                <ActionRowSkeleton />
                <ActionRowSkeleton />
              </ActionList>
            </Card>
            <Card>
              <StateLabel>{t("states.empty")}</StateLabel>
              <CardHeader title={td("owner.attentionTitle")} />
              <EmptyState
                message={t("emptyApprovals")}
                action={<Button variant="outline">{t("emptyAction")}</Button>}
              />
            </Card>
          </div>
        </div>
      </Section>

      <Section id="heroes" title={t("sections.heroes")}>
        <div className="flex flex-col gap-6">
          <HeroCard
            meta={`${formatDate(DEMO_NOW, locale, "long")} · ${td("branch")}`}
            greeting={tg("morning", { name: td("owner.name") })}
            summary={td("owner.summary", { count: 5 })}
            actions={
              <Button variant="on-hero">
                <UserPlus aria-hidden />
                {td("owner.addEmployee")}
              </Button>
            }
          />
          <div className="grid gap-6 md:grid-cols-2 lg:max-w-[52rem]">
            <div>
              <StateLabel>{t("states.inside")}</StateLabel>
              <ShiftHeroCard
                timeRange={shiftRange}
                detail={td("staff.detail")}
                geofence="inside"
              />
            </div>
            <div>
              <StateLabel>{t("states.outside")}</StateLabel>
              <ShiftHeroCard
                timeRange={shiftRange}
                detail={td("staff.detail")}
                geofence="outside"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3 rounded-tile bg-primary p-5">
            <LocationPill state="inside" />
            <LocationPill state="outside" />
          </div>
        </div>
      </Section>

      <Section id="tiles" title={t("sections.tiles")}>
        <div className="flex max-w-lg flex-col gap-4">
          <div className="grid grid-cols-4 gap-3">
            <QuickActionTile
              icon={CalendarDays}
              label={td("staff.leave")}
              href="/design"
            />
            <QuickActionTile
              icon={ReceiptText}
              label={td("staff.claim")}
              href="/design"
            />
            <QuickActionTile
              icon={Clock}
              label={td("staff.overtime")}
              href="/design"
            />
            <QuickActionTile
              icon={FileText}
              label={td("staff.payslips")}
              disabled
            />
          </div>
          <AttentionBanner
            href="/design"
            title={td("staff.bannerTitle", { count: 2 })}
            meta={td("staff.bannerMeta")}
          />
        </div>
      </Section>

      <Section id="stats" title={t("sections.stats")}>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label={td("staff.annualLeave")}
              value="5"
              unit={td("staff.ofDays", { total: 8 })}
              footer={
                <ProgressBar value={5} max={8} valueLabel="5 / 8" hideLabels />
              }
            />
            <StatCard
              label={td("staff.latestPayslip")}
              value={formatMoney(3354.65)}
              footer={td("staff.payslipMeta")}
            />
            <StatCardSkeleton />
          </div>
          <Card className="flex flex-col gap-6">
            <ProgressBar
              value={5}
              max={7}
              label={td("owner.checklist")}
              valueLabel={td("owner.checklistValue", { done: 5, total: 7 })}
            />
            <ProgressRing percent={86} body={td("owner.healthBody")} />
            <ProgressRing
              percent={50}
              size={88}
              headline={td("credentials.headline", { valid: 2, total: 4 })}
              body={td("credentials.advice")}
            />
          </Card>
        </div>
      </Section>

      <Section id="stepper" title={t("sections.stepper")}>
        <Card className="flex flex-col gap-8">
          {payrollSteps.map((step) => (
            <StatusStepper key={step} current={step} />
          ))}
        </Card>
      </Section>

      <Section id="people" title={t("sections.people")}>
        <Card className="grid gap-6 md:grid-cols-3">
          <div className="flex flex-col gap-5">
            <PersonRow {...demoPeople.farah} meta={td("owner.out.farah")} />
            <PersonRow {...demoPeople.daniel} meta={td("owner.out.daniel")} />
            <PersonRow {...demoPeople.amir} meta={td("owner.out.amir")} />
          </div>
          <div className="flex gap-4">
            <DateTile date={new Date("2026-11-07T01:00:00Z")} />
            <DateTile date={new Date("2026-11-15T01:00:00Z")} />
          </div>
          <p className="text-body text-ink">
            <MaskedValue prefix={DEMO_BANK.name} value={DEMO_BANK.number} />
            <br />
            <span className="text-meta text-ink-muted">
              IC <MaskedValue value="900101-14-5678" />
            </span>
          </p>
        </Card>
      </Section>

      <Section id="credentials" title={t("sections.credentials")}>
        <div className="flex max-w-lg flex-col gap-3">
          <FilterChipsDemo />
          <CredentialRow
            title={td("credentials.items.bls")}
            meta={td("credentials.items.blsMeta")}
            status="expired"
            actionLabel={td("credentials.actions.renewNow")}
            actionHref="/design"
          />
          <CredentialRow
            title={td("credentials.items.practising")}
            meta={td("credentials.items.practisingMeta")}
            status="expiring_soon"
            actionLabel={td("credentials.actions.renew")}
            actionHref="/design"
          />
          <CredentialRow
            title={td("credentials.items.safeguarding")}
            meta={td("credentials.items.safeguardingMeta")}
            status="pending"
            actionLabel={td("credentials.actions.view")}
            actionHref="/design"
          />
          <CredentialRow
            title={td("credentials.items.mahpc")}
            meta={td("credentials.items.mahpcMeta")}
            status="valid"
            actionLabel={td("credentials.actions.view")}
            actionHref="/design"
          />
          <CredentialRow
            title={td("credentials.items.firstAid")}
            meta={td("credentials.items.firstAidMeta")}
            status="missing"
            actionLabel={td("credentials.actions.add")}
            actionHref="/design"
          />
          <CredentialRowSkeleton />
          <p className="mt-2 text-meta text-ink-muted">{t("fabNote")}</p>
          <div>
            <Fab
              label={td("credentials.add")}
              href="/design"
              className="static"
            />
          </div>
        </div>
      </Section>

      <Section id="fields" title={t("sections.fields")}>
        <Card className="grid gap-6 md:grid-cols-3">
          <TextField
            label={t("fieldLabel")}
            hint={t("fieldHint")}
            inputMode="numeric"
          />
          <TextField
            label={t("fieldLabel")}
            hint={t("fieldHint")}
            disabled
            defaultValue="514012344821"
          />
          <TextField
            label={t("fieldLabel")}
            error={t("fieldError")}
            defaultValue="51401"
            inputMode="numeric"
          />
        </Card>
      </Section>

      <Section id="screens" title={t("sections.screens")}>
        <div className="flex flex-col gap-10">
          <ScreenCompare
            title={t("screens.owner")}
            image="desktop-owner-home.png"
            href={`/${locale}/design/owner-home`}
            width={1280}
            height={1210}
            labels={{
              reference: t("reference"),
              rebuilt: t("rebuilt"),
              open: t("openFull"),
            }}
          />
          <div className="flex flex-col gap-10">
            <ScreenCompare
              title={t("screens.staff")}
              image="mobile-staff-home.png"
              href={`/${locale}/design/staff-home`}
              width={390}
              height={844}
              labels={{
                reference: t("reference"),
                rebuilt: t("rebuilt"),
                open: t("openFull"),
              }}
            />
            <ScreenCompare
              title={t("screens.credentials")}
              image="mobile-my-credentials.png"
              href={`/${locale}/design/my-credentials`}
              width={390}
              height={844}
              labels={{
                reference: t("reference"),
                rebuilt: t("rebuilt"),
                open: t("openFull"),
              }}
            />
          </div>
        </div>
      </Section>
    </div>
  );
}

// Reference PNG next to the live recreation (in an iframe at the reference's width).
function ScreenCompare({
  title,
  image,
  href,
  width,
  height,
  labels,
}: {
  title: string;
  image: string;
  href: string;
  width: number;
  height: number;
  labels: { reference: string; rebuilt: string; open: string };
}) {
  const mobile = width < 600;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-h3 text-ink">{title}</h3>
        <a
          href={href}
          className="text-label text-primary underline-offset-4 hover:underline"
        >
          {labels.open}
        </a>
      </div>
      <div className={mobile ? "flex flex-wrap gap-4" : "flex flex-col gap-4"}>
        <figure className="flex max-w-full min-w-0 flex-col gap-2">
          <figcaption className="text-meta text-ink-muted">
            {labels.reference}
          </figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element -- dev-only reference image */}
          <img
            src={`/design-reference/${image}`}
            alt={`${labels.reference}: ${title}`}
            width={width}
            className="h-auto max-w-full rounded-control border border-border"
            style={{ width: mobile ? width : "100%" }}
          />
        </figure>
        <figure className="flex max-w-full min-w-0 flex-col gap-2">
          <figcaption className="text-meta text-ink-muted">
            {labels.rebuilt}
          </figcaption>
          <div className="max-w-full overflow-x-auto rounded-control border border-border">
            <iframe
              src={href}
              title={`${labels.rebuilt}: ${title}`}
              width={width}
              height={height}
              className="block bg-canvas"
              style={mobile ? undefined : { width: "100%", minWidth: 1024 }}
            />
          </div>
        </figure>
      </div>
    </div>
  );
}
