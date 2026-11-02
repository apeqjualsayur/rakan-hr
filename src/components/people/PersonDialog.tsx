"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { PersonFacts, WorkContact, type CardPerson } from "./PersonCard";

// The directory card in a dialog (EMP-09: click a person in the org chart to open it).
export function PersonDialog({
  person,
  manager,
  reportsCount,
  recordBase,
  onClose,
}: {
  person: CardPerson | null;
  manager: CardPerson | null;
  reportsCount: number;
  /** "/admin/people" for roles that can open employee records. */
  recordBase?: string;
  onClose: () => void;
}) {
  const t = useTranslations("People.directory");
  const lines = person
    ? [
        manager ? t("reportsTo", { name: manager.full_name }) : null,
        reportsCount > 0 ? t("reportsCount", { count: reportsCount }) : null,
      ].filter(Boolean)
    : [];
  return (
    <Dialog.Root
      open={person !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content
          {...(lines.length ? {} : { "aria-describedby": undefined })}
          className="fixed inset-x-4 top-1/2 z-50 mx-auto flex max-h-[85dvh] max-w-md -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-card border border-border bg-surface p-6 focus:outline-none"
        >
          {person ? (
            <>
              <div className="flex items-start gap-2">
                <Dialog.Title className="sr-only">
                  {person.full_name}
                </Dialog.Title>
                <div className="min-w-0 flex-1">
                  <PersonFacts person={person} size="dialog" />
                </div>
                <Dialog.Close
                  aria-label={t("close")}
                  className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-canvas"
                >
                  <X aria-hidden size={20} strokeWidth={1.75} />
                </Dialog.Close>
              </div>
              {lines.length ? (
                <Dialog.Description className="text-meta text-ink-muted">
                  {lines.join(" · ")}
                </Dialog.Description>
              ) : null}
              <WorkContact person={person} />
              {recordBase ? (
                <Link
                  href={`${recordBase}/${person.id}`}
                  className={cn(
                    buttonVariants({ variant: "outline", block: true }),
                  )}
                >
                  {t("openRecord")}
                </Link>
              ) : null}
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
