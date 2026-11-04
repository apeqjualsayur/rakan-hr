import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { PersonAvatar } from "@/components/ui/PersonRow";
import { StatusChip } from "@/components/ui/StatusChip";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import { malaysiaToday } from "@/lib/format";
import { CHANGE_COLUMNS, type ChangeRequest } from "@/lib/people/changes";
import {
  defaultEisEligible,
  EMPLOYEE_COLUMNS,
  type Employee,
} from "@/lib/people/employee";
import { loadJobOptions } from "@/lib/people/options";
import {
  BANK_ACCOUNT_COLUMNS,
  DEPENDENT_COLUMNS,
  DOCUMENT_COLUMNS,
  EMPLOYMENT_COLUMNS,
  type Bank,
  type BankAccount,
  type Dependent,
  type EmployeeDocument,
  type EmploymentRecord,
} from "@/lib/people/records";
import { photoUrls } from "@/lib/people/server";
import { CredentialList } from "@/components/credentials/CredentialList";
import { buttonVariants } from "@/components/ui/button";
import { loadStatusRows } from "@/lib/credentials/server";
import { cn } from "@/lib/utils";
import { isUuid } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";
import { BankSection } from "./BankSection";
import { DependentsSection } from "./DependentsSection";
import { DocumentsSection } from "./DocumentsSection";
import { EmployeeTabs } from "./EmployeeTabs";
import { AccountCard, EmploymentSection } from "./EmploymentSection";
import { PersonalForm } from "./PersonalForm";
import { StatutoryForm } from "./StatutoryForm";
import { OnboardingTab } from "./OnboardingTab";
import { ProbationTab } from "./ProbationTab";
import { EMPLOYEE_TABS, type EmployeeTab } from "./tabs";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/people/[employeeId]">) {
  const { employeeId } = await params;
  const t = await getTranslations("People");
  if (!isUuid(employeeId)) return { title: t("title") };
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("full_name")
    .eq("id", employeeId)
    .maybeSingle();
  return { title: (data?.full_name as string | undefined) ?? t("title") };
}

// One employee's record in tabs (EMP-01 → EMP-06). Bank and Documents are for the owner
// and HR admin only; payroll approver and auditor read the other tabs.
export default async function EmployeePage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/people/[employeeId]">) {
  const member = await requireMember(ADMIN_ROLES);
  const { employeeId } = await params;
  const { tab: tabParam, created, converted } = await searchParams;
  if (!isUuid(employeeId)) notFound();

  const t = await getTranslations("People");
  const supabase = await createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select(EMPLOYEE_COLUMNS)
    .eq("id", employeeId)
    .maybeSingle<Employee>();
  if (!employee) notFound();

  const canEdit = can(member.role, "editPeople");
  const sensitive = can(member.role, "viewSensitive");
  const tabs = EMPLOYEE_TABS.filter(
    (tab) =>
      (sensitive || (tab !== "bank" && tab !== "documents")) &&
      // Credential status: owner, HR admin, auditor (v_credential_status).
      (tab !== "credentials" || can(member.role, "viewChanges")) &&
      // Onboarding and probation (Step 8): owner, HR admin, auditor.
      ((tab !== "onboarding" && tab !== "probation") ||
        can(member.role, "viewHiring")),
  );
  const tab: EmployeeTab = tabs.includes(tabParam as EmployeeTab)
    ? (tabParam as EmployeeTab)
    : "personal";

  const [urls, { data: role }, { data: branch }] = await Promise.all([
    photoUrls(supabase, [employee.photo_path]),
    employee.job_role_id
      ? supabase
          .from("job_roles")
          .select("name")
          .eq("id", employee.job_role_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    employee.branch_id
      ? supabase
          .from("branches")
          .select("name")
          .eq("id", employee.branch_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const photoUrl = employee.photo_path
    ? urls.get(employee.photo_path)
    : undefined;
  const title =
    employee.job_title ?? (role?.name as string | undefined) ?? t("noRole");

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/people"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {t("employee.back")}
      </Link>

      <Card className="flex flex-col gap-4 md:flex-row md:items-center">
        <PersonAvatar
          id={employee.id}
          name={employee.full_name}
          photoUrl={photoUrl}
          className="size-16 text-h3"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-h2 text-ink">{employee.full_name}</h2>
          <p className="text-meta text-ink-muted">
            {[
              employee.employee_no,
              title,
              employee.branch_id
                ? ((branch?.name as string | undefined) ?? t("unnamedBranch"))
                : t("noBranch"),
            ].join(" · ")}
          </p>
        </div>
        <StatusChip
          domain="employee"
          status={employee.status}
          className="self-start md:self-center"
        />
      </Card>

      {created === "1" ? (
        <p
          role="status"
          className="rounded-tile bg-primary-tint px-4 py-3 text-meta text-primary-strong"
        >
          {t("employee.created")}
        </p>
      ) : null}
      {converted === "1" ? (
        <p
          role="status"
          className="rounded-tile bg-primary-tint px-4 py-3 text-meta text-primary-strong"
        >
          {t("employee.converted")}
        </p>
      ) : null}
      {canEdit ? null : (
        <p className="rounded-tile bg-neutral-tint px-4 py-3 text-meta text-neutral">
          {t("employee.readOnly")}
        </p>
      )}

      <EmployeeTabs employeeId={employee.id} tabs={tabs} active={tab} />

      <div
        role="tabpanel"
        aria-label={t(`employee.tabs.${tab}`)}
        className="flex flex-col gap-6"
      >
        {tab === "personal" ? (
          <PersonalForm
            employee={employee}
            photoUrl={photoUrl}
            tenantId={member.tenantId!}
            canEdit={canEdit}
            canReveal={sensitive}
          />
        ) : null}
        {tab === "employment" ? (
          <EmploymentTab
            employee={employee}
            canEdit={canEdit}
            showAccount={can(member.role, "viewUsers")}
          />
        ) : null}
        {tab === "credentials" ? (
          <CredentialsTab employee={employee} canEdit={canEdit} />
        ) : null}
        {tab === "statutory" ? (
          <StatutoryForm
            employee={employee}
            eisDefault={defaultEisEligible(employee, malaysiaToday())}
            canEdit={canEdit}
          />
        ) : null}
        {tab === "bank" ? (
          <BankTab employee={employee} canEdit={canEdit} />
        ) : null}
        {tab === "dependents" ? (
          <DependentsTab employeeId={employee.id} canEdit={canEdit} />
        ) : null}
        {tab === "onboarding" ? (
          <OnboardingTab
            employeeId={employee.id}
            canEdit={can(member.role, "manageHiring")}
          />
        ) : null}
        {tab === "probation" ? (
          <ProbationTab employee={employee} member={member} />
        ) : null}
        {tab === "documents" ? (
          <DocumentsTab
            employee={employee}
            tenantId={member.tenantId!}
            canEdit={canEdit}
          />
        ) : null}
      </div>
    </div>
  );
}

async function EmploymentTab({
  employee,
  canEdit,
  showAccount,
}: {
  employee: Employee;
  canEdit: boolean;
  showAccount: boolean;
}) {
  const supabase = await createClient();
  const [options, { data: records }, { data: account }] = await Promise.all([
    loadJobOptions(supabase, employee.id),
    supabase
      .from("employment_records")
      .select(EMPLOYMENT_COLUMNS)
      .eq("employee_id", employee.id)
      .order("start_date", { ascending: false })
      .returns<EmploymentRecord[]>(),
    // Owner, HR admin and auditor can read memberships (memberships_select_tenant).
    showAccount
      ? supabase
          .from("memberships")
          .select("invited_email, user_id, is_active")
          .eq("employee_id", employee.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return (
    <>
      <EmploymentSection
        employee={employee}
        records={records ?? []}
        canEdit={canEdit}
        {...options}
      />
      {showAccount ? (
        <AccountCard
          workEmail={employee.work_email}
          account={
            account
              ? {
                  email: account.invited_email as string | null,
                  signedIn: Boolean(account.user_id),
                  active: Boolean(account.is_active),
                }
              : null
          }
        />
      ) : null}
    </>
  );
}

async function CredentialsTab({
  employee,
  canEdit,
}: {
  employee: Employee;
  canEdit: boolean;
}) {
  const t = await getTranslations("People.credentialsTab");
  const rows = await loadStatusRows(await createClient(), employee.id);
  const addHref = `/admin/people/${employee.id}/credentials/new`;
  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="max-w-3xl text-meta text-ink-muted">
          {employee.job_role_id ? t("intro") : t("noRole")}
        </p>
        {canEdit ? (
          <Link
            href={addHref}
            className={cn(buttonVariants({ variant: "accent" }), "w-fit")}
          >
            {t("add")}
          </Link>
        ) : null}
      </div>
      <CredentialList
        rows={rows}
        viewHref="/admin/compliance/credentials"
        addHref={addHref}
      />
    </>
  );
}

async function BankTab({
  employee,
  canEdit,
}: {
  employee: Employee;
  canEdit: boolean;
}) {
  const supabase = await createClient();
  const [{ data: accounts }, { data: banks }, { data: pending }] =
    await Promise.all([
      supabase
        .from("bank_accounts")
        .select(BANK_ACCOUNT_COLUMNS)
        .eq("employee_id", employee.id)
        .order("created_at", { ascending: false })
        .returns<BankAccount[]>(),
      supabase
        .from("banks")
        .select("code, name")
        .eq("is_active", true)
        .order("name")
        .returns<Bank[]>(),
      supabase
        .from("profile_change_requests")
        .select(CHANGE_COLUMNS)
        .eq("employee_id", employee.id)
        .eq("field", "bank_account")
        .eq("status", "pending")
        .returns<ChangeRequest[]>(),
    ]);
  return (
    <BankSection
      employeeId={employee.id}
      accounts={accounts ?? []}
      banks={banks ?? []}
      hasPendingRequest={(pending ?? []).length > 0}
      canEdit={canEdit}
    />
  );
}

async function DependentsTab({
  employeeId,
  canEdit,
}: {
  employeeId: string;
  canEdit: boolean;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dependents")
    .select(DEPENDENT_COLUMNS)
    .eq("employee_id", employeeId)
    .order("date_of_birth", { ascending: true, nullsFirst: true })
    .returns<Dependent[]>();
  return (
    <DependentsSection
      employeeId={employeeId}
      dependents={data ?? []}
      canEdit={canEdit}
    />
  );
}

async function DocumentsTab({
  employee,
  tenantId,
  canEdit,
}: {
  employee: Employee;
  tenantId: string;
  canEdit: boolean;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select(DOCUMENT_COLUMNS)
    .eq("employee_id", employee.id)
    .order("created_at", { ascending: false })
    .returns<EmployeeDocument[]>();
  return (
    <DocumentsSection
      employeeId={employee.id}
      tenantId={tenantId}
      documents={data ?? []}
      canEdit={canEdit}
    />
  );
}
