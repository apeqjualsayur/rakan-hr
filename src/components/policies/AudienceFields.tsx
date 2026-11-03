"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Audience } from "@/lib/policies/logic";

export type AudienceOption = { id: string; name: string };

// POL-01 / POL-02 audience: everyone, some branches, or some job roles.
export function AudienceFields({
  branches,
  roles,
  initial,
  error,
}: {
  branches: readonly AudienceOption[];
  roles: readonly AudienceOption[];
  initial?: Audience;
  error?: string;
}) {
  const t = useTranslations("Policies.audience");
  const [type, setType] = useState<Audience["type"]>(initial?.type ?? "all");
  const chosen = initial && initial.type !== "all" ? initial.ids : [];
  const options =
    type === "branches" ? branches : type === "job_roles" ? roles : [];

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-label text-ink">{t("label")}</legend>
      <div className="flex flex-wrap gap-x-6">
        {(["all", "branches", "job_roles"] as const).map((value) => (
          <label
            key={value}
            className="flex min-h-11 cursor-pointer items-center gap-3 text-body text-ink"
          >
            <input
              type="radio"
              name="audience_type"
              value={value}
              checked={type === value}
              onChange={() => setType(value)}
              className="size-5 accent-primary"
            />
            {t(value)}
          </label>
        ))}
      </div>
      {options.length ? (
        <div className="flex flex-wrap gap-x-6 rounded-tile bg-canvas px-4 py-2">
          {options.map((o) => (
            <label
              key={o.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 text-body text-ink"
            >
              <input
                type="checkbox"
                name="audience_ids"
                value={o.id}
                defaultChecked={chosen.includes(o.id)}
                className="size-5 accent-primary"
              />
              {o.name}
            </label>
          ))}
        </div>
      ) : null}
      {error ? (
        <p className="text-meta font-medium text-danger">{error}</p>
      ) : null}
    </fieldset>
  );
}
