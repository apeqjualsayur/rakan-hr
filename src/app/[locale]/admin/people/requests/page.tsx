import { getTranslations } from "next-intl/server";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireMember } from "@/lib/auth/member";
import { can } from "@/lib/auth/roles";
import { CHANGE_COLUMNS, type ChangeRequest } from "@/lib/people/changes";
import type { Bank } from "@/lib/people/records";
import { createClient } from "@/lib/supabase/server";
import { RequestRow, type RequestView } from "./RequestRow";

export async function generateMetadata() {
  const t = await getTranslations("People.requests");
  return { title: t("title") };
}

// EMP-07 change request queue: staff ask, HR decides. Bank changes are flagged.
export default async function RequestsPage() {
  const member = await requireMember(["owner", "hr_admin", "auditor"]);
  const t = await getTranslations("People.requests");
  const supabase = await createClient();

  const [{ data: pending }, { data: decided }, { data: banks }] =
    await Promise.all([
      supabase
        .from("profile_change_requests")
        .select(CHANGE_COLUMNS)
        .eq("status", "pending")
        .order("created_at")
        .returns<ChangeRequest[]>(),
      supabase
        .from("profile_change_requests")
        .select(CHANGE_COLUMNS)
        .neq("status", "pending")
        .order("decided_at", { ascending: false })
        .limit(20)
        .returns<ChangeRequest[]>(),
      supabase.from("banks").select("code, name").returns<Bank[]>(),
    ]);
  const all = [...(pending ?? []), ...(decided ?? [])];
  const approvalIds = all
    .map((r) => r.approval_id)
    .filter((id): id is string => Boolean(id));
  const [{ data: employees }, { data: approvals }, { data: steps }] =
    await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name")
        .in("id", [...new Set(all.map((r) => r.employee_id))]),
      supabase
        .from("approvals")
        .select("id, requested_by")
        .in("id", approvalIds),
      supabase
        .from("approval_steps")
        .select("approval_id, comment")
        .in("approval_id", approvalIds)
        .not("comment", "is", null),
    ]);
  const nameOf = new Map(
    (employees ?? []).map((e) => [e.id as string, e.full_name as string]),
  );
  const requesterOf = new Map(
    (approvals ?? []).map((a) => [a.id as string, a.requested_by as string]),
  );
  const commentOf = new Map(
    (steps ?? []).map((s) => [s.approval_id as string, s.comment as string]),
  );
  const canDecide = can(member.role, "reviewChanges");
  const view = (r: ChangeRequest): RequestView => ({
    ...r,
    employeeName: nameOf.get(r.employee_id) ?? "—",
    isOwn: r.approval_id
      ? requesterOf.get(r.approval_id) === member.userId
      : false,
    comment: r.approval_id ? (commentOf.get(r.approval_id) ?? null) : null,
  });

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-3xl text-meta text-ink-muted">{t("intro")}</p>
      <Card className="flex flex-col gap-2">
        <CardHeader title={t("pending")} />
        {pending?.length ? (
          <ul className="divide-y divide-border">
            {pending.map((r) => (
              <RequestRow
                key={r.id}
                request={view(r)}
                banks={banks ?? []}
                canDecide={canDecide}
              />
            ))}
          </ul>
        ) : (
          <EmptyState message={t("none")} />
        )}
      </Card>
      <Card className="flex flex-col gap-2">
        <CardHeader title={t("decided")} as="h3" />
        {decided?.length ? (
          <ul className="divide-y divide-border">
            {decided.map((r) => (
              <RequestRow
                key={r.id}
                request={view(r)}
                banks={banks ?? []}
                canDecide={false}
              />
            ))}
          </ul>
        ) : (
          <EmptyState message={t("noneDecided")} />
        )}
      </Card>
    </div>
  );
}
