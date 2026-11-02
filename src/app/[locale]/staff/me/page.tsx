import type { ReactNode } from "react";
import { ChevronRight, Network, Users } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { MaskedValue } from "@/components/ui/MaskedValue";
import { PersonAvatar } from "@/components/ui/PersonRow";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { displayFileName } from "@/lib/files";
import { dateFromIso, formatDate } from "@/lib/format";
import {
  CHANGE_COLUMNS,
  type ChangeField,
  type ChangeRequest,
} from "@/lib/people/changes";
import {
  EMPLOYEE_COLUMNS,
  MALAYSIA,
  type Employee,
} from "@/lib/people/employee";
import {
  BANK_ACCOUNT_COLUMNS,
  bankName,
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
import { createClient } from "@/lib/supabase/server";
import {
  ChangeRequestButton,
  MyRequests,
  ViewDocumentButton,
  type MyRequest,
} from "./ChangeRequestForm";

export async function generateMetadata() {
  const t = await getTranslations("People.me");
  return { title: t("title") };
}

const CONTACT_FIELDS = [
  "phone",
  "email",
  "address",
  "emergency_contact",
] as const;

// EMP-07 My Profile: read-only, as HR keeps it. Contact and bank details change through
// "Request change" (an HR approval); everything else is changed by HR.
export default async function MyProfilePage() {
  const member = await requireMember(STAFF_ROLES);
  const t = await getTranslations("People");
  const locale = await getLocale();
  const supabase = await createClient();

  const { data: me } = member.employeeId
    ? await supabase
        .from("employees")
        .select(EMPLOYEE_COLUMNS)
        .eq("id", member.employeeId)
        .maybeSingle<Employee>()
    : { data: null };

  if (!me) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-display-sm text-ink">{t("me.title")}</h1>
        <Card>
          <EmptyState message={t("me.notLinked")} />
        </Card>
        <ColleagueLinks />
      </div>
    );
  }

  const [
    { data: contract },
    { data: accounts },
    { data: dependents },
    { data: documents },
    { data: requests },
    { data: banks },
    { data: placement },
    urls,
  ] = await Promise.all([
    supabase
      .from("employment_records")
      .select(EMPLOYMENT_COLUMNS)
      .eq("employee_id", me.id)
      .eq("is_current", true)
      .maybeSingle<EmploymentRecord>(),
    supabase
      .from("bank_accounts")
      .select(BANK_ACCOUNT_COLUMNS)
      .eq("employee_id", me.id)
      .in("status", ["active", "pending"])
      .returns<BankAccount[]>(),
    supabase
      .from("dependents")
      .select(DEPENDENT_COLUMNS)
      .eq("employee_id", me.id)
      .returns<Dependent[]>(),
    supabase
      .from("documents")
      .select(DOCUMENT_COLUMNS)
      .eq("employee_id", me.id)
      .order("created_at", { ascending: false })
      .returns<EmployeeDocument[]>(),
    supabase
      .from("profile_change_requests")
      .select(CHANGE_COLUMNS)
      .eq("employee_id", me.id)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<ChangeRequest[]>(),
    supabase
      .from("banks")
      .select("code, name")
      .eq("is_active", true)
      .order("name")
      .returns<Bank[]>(),
    // Title, branch and manager as colleagues see them.
    supabase
      .from("v_directory")
      .select("job_title, job_role_name, branch_name, manager_id")
      .eq("id", me.id)
      .maybeSingle(),
    photoUrls(supabase, [me.photo_path]),
  ]);

  const approvalIds = (requests ?? [])
    .map((r) => r.approval_id)
    .filter((id): id is string => Boolean(id));
  const [{ data: steps }, { data: manager }] = await Promise.all([
    approvalIds.length
      ? supabase
          .from("approval_steps")
          .select("approval_id, comment")
          .in("approval_id", approvalIds)
          .not("comment", "is", null)
      : Promise.resolve({
          data: [] as { approval_id: string; comment: string }[],
        }),
    placement?.manager_id
      ? supabase
          .from("v_directory")
          .select("full_name")
          .eq("id", placement.manager_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const commentOf = new Map(
    (steps ?? []).map((s) => [s.approval_id as string, s.comment as string]),
  );
  const myRequests: MyRequest[] = (requests ?? []).map((r) => ({
    ...r,
    comment: r.approval_id ? (commentOf.get(r.approval_id) ?? null) : null,
  }));
  const pendingFields = myRequests
    .filter((r) => r.status === "pending")
    .map((r) => r.field as ChangeField);

  const day = (iso: string | null) =>
    iso ? formatDate(dateFromIso(iso), locale, "full") : null;
  const notSet = t("notSet");
  const primary = (accounts ?? []).find((a) => a.is_primary) ?? null;
  const title = placement?.job_title ?? placement?.job_role_name ?? null;
  const emergency = me.emergency_contact;

  return (
    <div className="flex flex-col gap-3 md:gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-display-sm text-ink">{t("me.title")}</h1>
        <p className="text-meta text-ink-muted">{t("me.intro")}</p>
      </div>

      <Card className="flex items-center gap-4">
        <PersonAvatar
          id={me.id}
          name={me.full_name}
          photoUrl={me.photo_path ? urls.get(me.photo_path) : undefined}
          className="size-16 text-h3"
        />
        <div className="min-w-0">
          <p className="text-h3 text-ink">{me.full_name}</p>
          <p className="text-meta text-ink-muted">
            {[me.employee_no, title, placement?.branch_name]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </Card>

      <Section title={t("me.personal")}>
        <Facts
          rows={[
            [
              me.id_type === "mykad"
                ? t("personal.idTypes.mykad")
                : t("personal.idTypes.passport"),
              me.id_no_last4 ? <MaskedValue value={me.id_no_last4} /> : notSet,
            ],
            [t("personal.date_of_birth"), day(me.date_of_birth) ?? notSet],
            [
              t("personal.gender"),
              me.gender ? t(`personal.genders.${me.gender}`) : notSet,
            ],
            [
              t("personal.nationality"),
              me.nationality === MALAYSIA
                ? t("personal.nationalityMy")
                : me.nationality,
            ],
            [
              t("personal.marital_status"),
              me.marital_status
                ? t(`personal.maritalStatuses.${me.marital_status}`)
                : notSet,
            ],
          ]}
        />
      </Section>

      <Section title={t("me.contacts")}>
        <Facts
          rows={[
            [t("personal.phone"), me.phone ?? notSet],
            [t("personal.email"), me.email ?? notSet],
            [t("personal.address"), me.address ?? notSet],
            [
              t("personal.emergency"),
              [
                emergency.name &&
                  (emergency.relationship
                    ? `${emergency.name} (${emergency.relationship})`
                    : emergency.name),
                emergency.phone,
              ]
                .filter(Boolean)
                .join(" · ") || notSet,
            ],
            [t("personal.work_email"), me.work_email ?? notSet],
            [t("personal.work_phone"), me.work_phone ?? notSet],
          ]}
        />
        <ChangeRequestButton
          fields={CONTACT_FIELDS}
          pendingFields={pendingFields}
          current={{
            phone: me.phone,
            email: me.email,
            address: me.address,
            emergency_contact: emergency,
          }}
        />
      </Section>

      <Section title={t("me.job")}>
        <Facts
          rows={[
            [t("employment.job_title"), title ?? notSet],
            [
              t("employment.branch_id"),
              placement?.branch_name ??
                (me.branch_id ? t("unnamedBranch") : t("noBranch")),
            ],
            [
              t("me.reportsTo"),
              (manager?.full_name as string | undefined) ?? notSet,
            ],
            [
              t("employment.employment_type"),
              contract
                ? t(`employment.employmentTypes.${contract.employment_type}`)
                : notSet,
            ],
            [
              t("employment.start_date"),
              day(contract?.start_date ?? null) ?? notSet,
            ],
            ...(contract?.probation_end
              ? ([[t("me.probationEnds"), day(contract.probation_end)!]] as [
                  string,
                  string,
                ][])
              : []),
          ]}
        />
      </Section>

      <Section title={t("me.statutory")}>
        <Facts
          rows={[
            [t("statutory.epf_no"), me.epf_no ?? notSet],
            [t("statutory.socso_no"), me.socso_no ?? notSet],
            [t("statutory.tax_no"), me.tax_no ?? notSet],
            [
              t("statutory.pcb_category"),
              me.pcb_category
                ? t(`statutory.pcbCategories.${me.pcb_category}`)
                : notSet,
            ],
          ]}
        />
      </Section>

      <Section title={t("me.bank")}>
        <Facts
          rows={[
            [
              t("bank.title"),
              primary ? (
                <MaskedValue
                  prefix={bankName(banks ?? [], primary.bank_code)}
                  value={primary.account_no_last4}
                />
              ) : (
                t("bank.none")
              ),
            ],
            ...(primary
              ? ([[t("bank.holder_name"), primary.holder_name]] as [
                  string,
                  string,
                ][])
              : []),
          ]}
        />
        <p className="text-meta text-ink-muted">{t("me.bankNote")}</p>
        <ChangeRequestButton
          fields={["bank_account"]}
          pendingFields={pendingFields}
          banks={banks ?? []}
        />
      </Section>

      {myRequests.length ? (
        <Section title={t("me.requests")}>
          <MyRequests requests={myRequests} banks={banks ?? []} />
        </Section>
      ) : null}

      <Section title={t("me.dependents")}>
        {dependents?.length ? (
          <ul className="divide-y divide-border">
            {dependents.map((d) => (
              <li key={d.id} className="py-3">
                <p className="text-body font-semibold text-ink">{d.name}</p>
                <p className="text-meta text-ink-muted">
                  {[
                    t(`dependents.relationships.${d.relationship}`),
                    d.date_of_birth
                      ? t("dependents.born", { date: day(d.date_of_birth)! })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-meta text-ink-muted">{t("me.noDependents")}</p>
        )}
      </Section>

      <Section title={t("me.documents")}>
        {documents?.length ? (
          <ul className="divide-y divide-border">
            {documents.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-body font-semibold text-ink">
                    {d.title ?? t(`documents.docTypes.${d.doc_type}`)}
                  </p>
                  <p className="truncate text-meta text-ink-muted">
                    {[
                      displayFileName(d.file_path),
                      d.expiry_date
                        ? t("documents.expires", { date: day(d.expiry_date)! })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <ViewDocumentButton documentId={d.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-meta text-ink-muted">{t("me.noDocuments")}</p>
        )}
      </Section>

      <ColleagueLinks />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <CardHeader title={title} />
      {children}
    </Card>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="flex flex-col divide-y divide-border">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-0.5 py-2.5">
          <dt className="text-meta text-ink-muted">{label}</dt>
          <dd className="text-body break-words text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

async function ColleagueLinks() {
  const t = await getTranslations("People.me");
  const link =
    "flex min-h-14 items-center gap-3 px-1 text-body font-medium text-ink transition-colors hover:text-primary";
  return (
    <Card className="flex flex-col">
      <CardHeader title={t("colleagues")} />
      <Link href="/staff/directory" className={link}>
        <Users
          aria-hidden
          size={24}
          strokeWidth={1.75}
          className="text-primary"
        />
        <span className="flex-1">{t("directory")}</span>
        <ChevronRight
          aria-hidden
          size={20}
          strokeWidth={1.75}
          className="text-ink-muted"
        />
      </Link>
      <Link
        href="/staff/org-chart"
        className={`${link} border-t border-border`}
      >
        <Network
          aria-hidden
          size={24}
          strokeWidth={1.75}
          className="text-primary"
        />
        <span className="flex-1">{t("orgChart")}</span>
        <ChevronRight
          aria-hidden
          size={20}
          strokeWidth={1.75}
          className="text-ink-muted"
        />
      </Link>
    </Card>
  );
}
