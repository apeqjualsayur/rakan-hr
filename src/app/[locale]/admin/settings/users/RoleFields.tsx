"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SelectField } from "@/components/ui/SelectField";
import { APP_ROLES, MFA_ROLES, type AppRole } from "@/lib/auth/roles";

export type BranchOption = { id: string; name: string };

// Role picker with a one-line description of the chosen role, plus the branches a
// manager looks after (memberships.branch_ids). Used by the invite form and row editor.
export function RoleFields({
  defaultRole,
  defaultBranchIds,
  branches,
  error,
}: {
  defaultRole: AppRole;
  defaultBranchIds?: readonly string[];
  branches: readonly BranchOption[];
  error?: string;
}) {
  const t = useTranslations("Settings.users");
  const tr = useTranslations("Roles");
  const [role, setRole] = useState<AppRole>(defaultRole);
  // New managers look after every branch unless the owner narrows it down.
  const selected = new Set(
    defaultBranchIds?.length ? defaultBranchIds : branches.map((b) => b.id),
  );

  return (
    <>
      <SelectField
        label={t("role")}
        name="role"
        value={role}
        onChange={(e) => setRole(e.target.value as AppRole)}
        hint={
          <>
            {tr(`${role}.description`)}
            {MFA_ROLES.includes(role) ? ` ${tr("mfaNote")}` : null}
          </>
        }
        error={error}
      >
        {APP_ROLES.map((r) => (
          <option key={r} value={r}>
            {tr(`${r}.name`)}
          </option>
        ))}
      </SelectField>
      {role === "manager" && branches.length > 0 ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-label text-ink">{t("branches")}</legend>
          {branches.map((b) => (
            <label
              key={b.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 text-body text-ink"
            >
              <input
                type="checkbox"
                name="branch_ids"
                value={b.id}
                defaultChecked={selected.has(b.id)}
                className="size-5 accent-primary"
              />
              {b.name || t("unnamedBranch")}
            </label>
          ))}
          <p className="text-meta text-ink-muted">{t("branchesHint")}</p>
        </fieldset>
      ) : null}
    </>
  );
}
