import { ChevronRight, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import { ringgit } from "@/lib/hiring/letters";
import { OPENING_COLUMNS, type JobOpening } from "@/lib/hiring/types";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Hiring.nav");
  return { title: t("openings") };
}

// HIR-01 job openings: open first, then on hold, then closed.
export default async function OpeningsPage() {
  const member = await requireMember(ADMIN_ROLES);
  const t = await getTranslations("Hiring.openings");
  const tp = await getTranslations("People.employment");
  const supabase = await createClient();
  const [{ data: openings }, { data: roles }, { data: candidates }] =
    await Promise.all([
      supabase
        .from("job_openings")
        .select(OPENING_COLUMNS)
        .order("created_at", { ascending: false })
        .returns<JobOpening[]>(),
      supabase.from("job_roles").select("id, name"),
      supabase.from("candidates").select("job_opening_id, stage"),
    ]);
  const roleName = new Map(
    (roles ?? []).map((r) => [r.id as string, r.name as string]),
  );
  const order = { open: 0, on_hold: 1, closed: 2 } as const;
  const rows = [...(openings ?? [])].sort(
    (a, b) => order[a.status] - order[b.status],
  );
  const countFor = (id: string) =>
    (candidates ?? []).filter(
      (c) =>
        c.job_opening_id === id &&
        c.stage !== "rejected" &&
        c.stage !== "hired",
    ).length;
  const salary = (o: JobOpening) =>
    o.salary_min && o.salary_max
      ? `${ringgit(o.salary_min)} – ${ringgit(o.salary_max)}`
      : o.salary_min || o.salary_max
        ? ringgit(o.salary_min ?? o.salary_max)
        : t("noSalary");

  return (
    <div className="flex flex-col gap-4">
      {can(member.role, "manageHiring") ? (
        <Link
          href="/admin/hiring/openings/new"
          className={buttonVariants({
            variant: "accent",
            className: "self-start",
          })}
        >
          <Plus aria-hidden />
          {t("new")}
        </Link>
      ) : null}
      <Card className="flex flex-col">
        {rows.length === 0 ? (
          <EmptyState message={t("empty")} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/hiring/openings/${o.id}`}
                  className="-mx-2 flex items-center gap-4 rounded-tile px-2 py-3 transition-colors hover:bg-canvas"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-h3 text-ink">{o.title}</span>
                    <span className="text-meta text-ink-muted">
                      {[
                        o.job_role_id ? roleName.get(o.job_role_id) : null,
                        tp(`employmentTypes.${o.employment_type}`),
                        salary(o),
                        t("candidates", { count: countFor(o.id) }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <StatusChip domain="opening" status={o.status} />
                  <ChevronRight
                    aria-hidden
                    size={20}
                    strokeWidth={1.75}
                    className="shrink-0 text-ink-soft"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
