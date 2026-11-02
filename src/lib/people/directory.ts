// EMP-08 staff directory and EMP-09 org chart, read from the v_directory view (work contact
// details only). Pure helpers so the tree and search are unit-tested.

export type DirectoryPerson = {
  id: string;
  full_name: string;
  job_title: string | null;
  job_role_name: string | null;
  is_clinical: boolean | null;
  branch_id: string | null;
  branch_name: string | null;
  work_email: string | null;
  work_phone: string | null;
  manager_id: string | null;
  photo_path: string | null;
  status: "active" | "on_notice";
  /** Filled in by Step 6 (credentials); null until then. */
  credential_status: "valid" | "expiring_soon" | "expired" | "missing" | null;
};

export const DIRECTORY_COLUMNS =
  "id, full_name, job_title, job_role_name, is_clinical, branch_id, branch_name, work_email, work_phone, manager_id, photo_path, status, credential_status";

/** What the person does: their own title, else their job role. */
export function personTitle(
  p: Pick<DirectoryPerson, "job_title" | "job_role_name">,
) {
  return p.job_title ?? p.job_role_name ?? null;
}

/** Case- and accent-insensitive match on name, title or job role (top-nav search). */
export function matchesPerson(
  p: Pick<DirectoryPerson, "full_name" | "job_title" | "job_role_name">,
  query: string,
) {
  const q = fold(query.trim());
  if (q === "") return true;
  return [p.full_name, p.job_title, p.job_role_name].some(
    (field) => field !== null && fold(field).includes(q),
  );
}

function fold(text: string) {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Text that is safe inside a PostgREST `or=(…ilike…)` filter: drops the characters that
 * filter syntax or LIKE treat specially. Returns null when nothing searchable is left.
 */
export function searchTerm(query: string) {
  const cleaned = query
    .replace(/[,()*%_\\:"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return cleaned.length >= 2 ? cleaned : null;
}

export type OrgNode<P> = { person: P; reports: OrgNode<P>[] };

/**
 * Builds the reporting tree from manager_id. People whose manager is not in the list
 * (no manager, or the manager left) are roots. Siblings are sorted by name.
 * The database refuses reporting loops; if one slipped in, its people become roots
 * rather than vanishing.
 */
export function buildOrgTree<
  P extends { id: string; manager_id: string | null; full_name: string },
>(people: readonly P[]): OrgNode<P>[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const children = new Map<string, P[]>();
  const roots: P[] = [];
  for (const p of people) {
    if (p.manager_id && byId.has(p.manager_id) && p.manager_id !== p.id) {
      const list = children.get(p.manager_id) ?? [];
      list.push(p);
      children.set(p.manager_id, list);
    } else {
      roots.push(p);
    }
  }

  const placed = new Set<string>();
  const build = (p: P): OrgNode<P> => {
    placed.add(p.id);
    return {
      person: p,
      reports: byName(children.get(p.id) ?? [])
        .filter((c) => !placed.has(c.id))
        .map(build),
    };
  };
  const tree = byName(roots).map(build);
  // Anyone not reached from a root sits in a loop: show them as roots.
  for (const p of byName(people.filter((p) => !placed.has(p.id)))) {
    if (!placed.has(p.id)) tree.push(build(p));
  }
  return tree;
}

function byName<P extends { full_name: string }>(list: readonly P[]) {
  return list.toSorted((a, b) => a.full_name.localeCompare(b.full_name));
}

/** Number of people in a subtree, not counting its root. */
export function countReports<P>(node: OrgNode<P>): number {
  return node.reports.reduce((sum, r) => sum + 1 + countReports(r), 0);
}
