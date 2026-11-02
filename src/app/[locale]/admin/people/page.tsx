import { getTranslations } from "next-intl/server";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import { photoUrls } from "@/lib/people/server";
import { createClient } from "@/lib/supabase/server";
import { PeopleList, type PersonListRow } from "./PeopleList";

export async function generateMetadata() {
  const t = await getTranslations("People");
  return { title: t("title") };
}

type EmployeeRow = Omit<
  PersonListRow,
  "photoUrl" | "employment_type" | "start_date"
> & {
  photo_path: string | null;
};

// People list with filters (status, branch, job role, employment type) and search.
// A small company has tens of people, so the list is filtered in the browser.
export default async function PeoplePage() {
  const member = await requireMember(ADMIN_ROLES);
  const supabase = await createClient();
  const [
    { data: employees },
    { data: branches },
    { data: roles },
    { data: contracts },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, employee_no, full_name, status, branch_id, job_role_id, job_title, photo_path",
      )
      .is("deleted_at", null)
      .order("full_name")
      .returns<EmployeeRow[]>(),
    supabase.from("branches").select("id, name").order("created_at"),
    supabase.from("job_roles").select("id, name").order("sort_order"),
    supabase
      .from("employment_records")
      .select("employee_id, employment_type, start_date")
      .eq("is_current", true),
  ]);

  const urls = await photoUrls(
    supabase,
    (employees ?? []).map((e) => e.photo_path),
  );
  const contractOf = new Map(
    (contracts ?? []).map((c) => [c.employee_id as string, c]),
  );
  const rows: PersonListRow[] = (employees ?? []).map(
    ({ photo_path, ...e }) => ({
      ...e,
      photoUrl: photo_path ? urls.get(photo_path) : undefined,
      employment_type:
        (contractOf.get(e.id)
          ?.employment_type as PersonListRow["employment_type"]) ?? null,
      start_date:
        (contractOf.get(e.id)?.start_date as string | undefined) ?? null,
    }),
  );

  return (
    <PeopleList
      people={rows}
      branches={(branches ?? []).map((b) => ({
        id: b.id as string,
        name: (b.name as string | null) ?? null,
      }))}
      roles={(roles ?? []).map((r) => ({
        id: r.id as string,
        name: r.name as string,
      }))}
      canAdd={can(member.role, "editPeople")}
    />
  );
}
