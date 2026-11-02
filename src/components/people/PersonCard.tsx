"use client";

import { Mail, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { PersonAvatar } from "@/components/ui/PersonRow";
import { StatusChip } from "@/components/ui/StatusChip";
import { personTitle, type DirectoryPerson } from "@/lib/people/directory";
import { cn } from "@/lib/utils";

export type CardPerson = DirectoryPerson & { photoUrl?: string };

/** EMP-08 directory facts: title · branch, credential status (status only), work contact. */
export function PersonFacts({
  person,
  size = "card",
}: {
  person: CardPerson;
  size?: "card" | "dialog";
}) {
  const t = useTranslations("People");
  const title = personTitle(person);
  return (
    <div className="flex min-w-0 items-start gap-4">
      <PersonAvatar
        id={person.id}
        name={person.full_name}
        photoUrl={person.photoUrl}
        className={size === "dialog" ? "size-20 text-h2" : "size-14"}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p
          className={cn(
            "text-ink",
            size === "dialog" ? "text-h2" : "text-h3 font-semibold",
          )}
        >
          {person.full_name}
        </p>
        <p className="text-meta text-ink-muted">
          {[
            title,
            person.branch_name ??
              (person.branch_id ? t("unnamedBranch") : t("noBranch")),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {person.credential_status || person.status === "on_notice" ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {person.credential_status ? (
              <StatusChip
                domain="credential"
                status={person.credential_status}
                short
              />
            ) : null}
            {person.status === "on_notice" ? (
              <StatusChip domain="employee" status="on_notice" />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Work email and phone as tap targets (≥ 44 px). */
export function WorkContact({ person }: { person: CardPerson }) {
  const t = useTranslations("People.directory");
  if (!person.work_email && !person.work_phone) return null;
  const link =
    "flex min-h-11 min-w-0 items-center gap-2 rounded-control px-2 -mx-2 text-meta text-primary transition-colors hover:bg-primary-tint";
  return (
    <div className="flex flex-col">
      {person.work_email ? (
        <a
          href={`mailto:${person.work_email}`}
          aria-label={t("email", { name: person.full_name })}
          className={link}
        >
          <Mail aria-hidden size={18} strokeWidth={1.75} className="shrink-0" />
          <span className="truncate">{person.work_email}</span>
        </a>
      ) : null}
      {person.work_phone ? (
        <a
          href={`tel:${person.work_phone.replace(/[^\d+]/g, "")}`}
          aria-label={t("call", { name: person.full_name })}
          className={link}
        >
          <Phone
            aria-hidden
            size={18}
            strokeWidth={1.75}
            className="shrink-0"
          />
          <span className="tabular-nums">{person.work_phone}</span>
        </a>
      ) : null}
    </div>
  );
}
