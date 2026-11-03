import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import type { CurrentMember } from "@/lib/auth/member";
import { formatDate, formatTime } from "@/lib/format";
import { signPolicy } from "@/lib/policies/actions";
import { inLocale } from "@/lib/policies/logic";
import { loadSignable } from "@/lib/policies/server";
import { isUuid } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";
import { SignDocument } from "./SignDocument";
import { SignedCopyButton } from "./SignedCopyButton";

// One policy version for the signed-in user: sign it (POL-03), or see that it is signed
// with a link to the signed copy. Used by the PDPA gate and the staff / admin policy pages.
export async function PolicySignView({
  member,
  policyId,
  doneHref,
}: {
  member: CurrentMember;
  policyId: string;
  doneHref: string;
}) {
  if (!isUuid(policyId)) notFound();
  const t = await getTranslations("Policies");
  const locale = await getLocale();
  const data = await loadSignable(await createClient(), member, policyId);
  if (!data) notFound();
  const { doc, signature, pdfUrl, expectedName } = data;
  const title = inLocale(doc, "title", locale);
  const when = (iso: string) =>
    `${formatDate(new Date(iso), locale, "full")}, ${formatTime(new Date(iso), locale)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-display-sm text-ink">{title}</h1>
        <p className="text-meta text-ink-muted">
          {t("versionMeta", {
            version: doc.version,
            date: formatDate(new Date(doc.published_at), locale, "full"),
          })}
        </p>
      </div>
      {signature ? (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-h3 text-ink">
              {t("signedOn", { date: when(signature.signed_at) })}
            </p>
            <StatusChip domain="policy" status="signed" />
          </div>
          <p className="text-meta break-all text-ink-muted">
            {t("fingerprint", { sha: signature.document_sha256 })}
          </p>
          <div className="flex flex-wrap gap-2">
            <SignedCopyButton
              signatureId={signature.id}
              label={t("signedCopy")}
            />
            <SignedCopyButton
              policyId={doc.id}
              label={t("original")}
              variant="ghost"
            />
          </div>
        </Card>
      ) : doc.superseded_at || !doc.requires_signature ? (
        <Card className="flex flex-col gap-3">
          <p className="text-body text-ink-muted">
            {doc.superseded_at ? t("superseded") : t("readOnly")}
          </p>
          <SignedCopyButton policyId={doc.id} label={t("original")} />
        </Card>
      ) : (
        <SignDocument
          entityId={doc.id}
          pdfUrl={pdfUrl}
          expectedName={expectedName}
          sign={signPolicy}
          doneHref={doneHref}
        />
      )}
    </div>
  );
}
