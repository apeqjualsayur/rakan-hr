import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { typeName } from "@/lib/credentials/logic";
import type { CredentialType, StaffCredential } from "@/lib/credentials/types";
import { dateFromIso, formatDate } from "@/lib/format";

export type SignedFile = {
  id: string;
  url: string;
  mime: string;
  page_no: number;
};

// One credential record: its status, what was entered, and its files (CRD-05, CRD-09).
// Files arrive as 5-minute signed links made by the page (CRD-16).
export function CredentialDetail({
  credential: c,
  type,
  files,
  history,
  actions,
  layout = "stacked",
}: {
  credential: StaffCredential;
  type: Pick<
    CredentialType,
    "name_en" | "name_ms" | "restricted" | "tracks_cpd"
  >;
  files: readonly SignedFile[];
  /** Earlier and later records of the same credential, newest first. */
  history?: readonly Pick<
    StaffCredential,
    "id" | "status" | "effective_date" | "expiry_date"
  >[];
  actions?: ReactNode;
  /** "split": files beside the details (HR review on desktop). */
  layout?: "stacked" | "split";
}) {
  const t = useTranslations("Credentials.detail");
  const tf = useTranslations("Credentials.form");
  const locale = useLocale();
  const day = (iso: string | null) =>
    iso ? formatDate(dateFromIso(iso), locale, "full") : null;
  const stamp = (iso: string | null) =>
    iso ? formatDate(new Date(iso), locale, "full") : "";

  const facts: [string, ReactNode][] = [
    [t("reference_no"), c.reference_no ?? "—"],
    [t("issuing_body"), c.issuing_body ?? "—"],
    [t("effective_date"), day(c.effective_date)],
    [t("expiry_date"), day(c.expiry_date) ?? t("noExpiry")],
    ...(type.tracks_cpd && c.cpd_points
      ? ([[t("cpd_points"), c.cpd_points]] as [string, ReactNode][])
      : []),
    ...(c.notes ? ([[t("notes"), c.notes]] as [string, ReactNode][]) : []),
  ];

  const details = (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-h2 text-ink">{typeName(type, locale)}</h2>
        <StatusChip domain="credentialRecord" status={c.status} />
      </div>
      {type.restricted ? (
        <p className="rounded-tile bg-neutral-tint px-4 py-3 text-meta text-neutral">
          {tf("restrictedNote")}
        </p>
      ) : null}
      <p className="text-meta text-ink-muted">
        {c.status === "verified" || c.status === "superseded"
          ? t("verified", {
              date: stamp(c.verified_at),
              method: c.verify_method ?? "",
            })
          : c.status === "rejected"
            ? t("rejected", { reason: c.reject_reason ?? "" })
            : c.submitted_at
              ? t("submitted", { date: stamp(c.submitted_at) })
              : null}
      </p>
      <dl className="flex flex-col divide-y divide-border">
        {facts.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 py-2.5">
            <dt className="text-meta text-ink-muted">{label}</dt>
            <dd className="text-body break-words text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {actions}
    </Card>
  );

  const fileCard = (
    <Card className="flex flex-col gap-3">
      <CardHeader title={t("files")} as="h3" />
      {files.length === 0 ? (
        <p className="text-meta text-ink-muted">{t("noFiles")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {files.map((f) => (
            <li key={f.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-label text-ink">
                  {t("page", { n: f.page_no })}
                </span>
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
                >
                  {t("open")}
                  <ExternalLink aria-hidden size={16} strokeWidth={1.75} />
                </a>
              </div>
              {f.mime.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                <img
                  src={f.url}
                  alt={t("page", { n: f.page_no })}
                  className="max-h-[70vh] w-full rounded-tile border border-border object-contain"
                />
              ) : (
                <iframe
                  src={f.url}
                  title={t("page", { n: f.page_no })}
                  className="hidden h-[70vh] w-full rounded-tile border border-border md:block"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  const historyCard = history?.length ? (
    <Card className="flex flex-col gap-2">
      <CardHeader title={t("history")} as="h3" />
      <ul className="divide-y divide-border">
        {history.map((h) => (
          <li
            key={h.id}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <span className="text-meta text-ink-soft tabular-nums">
              {day(h.effective_date)}
              {h.expiry_date ? ` – ${day(h.expiry_date)}` : ""}
            </span>
            <StatusChip domain="credentialRecord" status={h.status} />
          </li>
        ))}
      </ul>
    </Card>
  ) : null;

  if (layout === "split") {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="order-2 lg:order-1">{fileCard}</div>
        <div className="order-1 flex flex-col gap-6 lg:order-2">
          {details}
          {historyCard}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 md:gap-6">
      {details}
      {fileCard}
      {historyCard}
    </div>
  );
}
