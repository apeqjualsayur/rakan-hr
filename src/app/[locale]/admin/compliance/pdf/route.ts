import { getTranslations } from "next-intl/server";
import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";
import { hex, safe, wrap } from "@/lib/pdf";
import { getCurrentMember } from "@/lib/auth/member";
import { needsMfa } from "@/lib/auth/roles";
import { buildMatrix, summarise, typeName } from "@/lib/credentials/logic";
import { loadStatusRows } from "@/lib/credentials/server";
import { DISPLAY_STATUSES, type DisplayStatus } from "@/lib/credentials/types";
import { formatDate } from "@/lib/format";
import { statusTone, type Tone } from "@/lib/status-styles";
import { createClient } from "@/lib/supabase/server";

// CRD-15: the compliance matrix as a PDF for KKM or facility inspections. Same data and
// access rules as the screen (v_credential_status): owner, HR admin and auditor.

const TONE_COLOURS: Record<Tone, { fill: string; text: string }> = {
  primary: { fill: "#DDEEE5", text: "#14503D" },
  info: { fill: "#E1E9FB", text: "#2D4F9C" },
  warning: { fill: "#FBEBC5", text: "#7A4F00" },
  danger: { fill: "#FADDD6", text: "#A12A17" },
  neutral: { fill: "#E8E5DA", text: "#4B5750" },
};
const INK = hex("#1E2A24");
const MUTED = hex("#5B6B62");
const BORDER = hex("#E4DFD0");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const member = await getCurrentMember();
  if (
    !member.tenantId ||
    !member.role ||
    needsMfa(member) ||
    !["owner", "hr_admin", "auditor"].includes(member.role)
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const lang = locale === "ms" ? "ms" : "en";
  const t = await getTranslations({
    locale: lang,
    namespace: "Compliance.matrix",
  });
  const ts = await getTranslations({
    locale: lang,
    namespace: "Status.credential",
  });
  const tShort = await getTranslations({
    locale: lang,
    namespace: "Status.short.credential",
  });
  const supabase = await createClient();
  const [rows, { data: people }, { data: tenant }] = await Promise.all([
    loadStatusRows(supabase),
    supabase
      .from("employees")
      .select("id, full_name, employee_no")
      .is("deleted_at", null)
      .neq("status", "left")
      .order("full_name"),
    supabase
      .from("tenants")
      .select("legal_name, trading_name")
      .eq("id", member.tenantId)
      .single(),
  ]);
  const matrix = buildMatrix(rows);
  const listed = (people ?? []).filter((p) =>
    rows.some((r) => r.employee_id === p.id && r.requirement !== null),
  );
  // Short chip labels, as on screen ("Expiring" instead of "Expiring soon").
  const label = (status: DisplayStatus) =>
    status === "expiring_soon" ? tShort("expiring_soon") : ts(status);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(t("pdfTitle"));
  pdf.setCreator("Rakan");

  const W = 842;
  const H = 595;
  const M = 36;
  const nameW = 170;
  const pctW = 64;
  const colW = Math.max(
    56,
    (W - 2 * M - nameW - pctW) / Math.max(1, matrix.columns.length),
  );
  const rowH = 24;
  const headerSize = 7.5;
  const headerLines = matrix.columns.map((c) =>
    wrap(bold, typeName(c, lang), headerSize, colW - 6),
  );
  const headerH =
    Math.max(2, ...headerLines.map((l) => l.length)) * (headerSize + 2) + 10;

  let page: PDFPage;
  let y = 0;
  const company = (tenant?.trading_name ?? tenant?.legal_name ?? "") as string;

  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
    page.drawText(safe(bold, t("pdfTitle")), {
      x: M,
      y: y - 16,
      size: 16,
      font: bold,
      color: INK,
    });
    y -= 34;
    page.drawText(
      safe(
        font,
        [
          company,
          t("pdfGenerated", { date: formatDate(new Date(), lang, "full") }),
        ]
          .filter(Boolean)
          .join(" · "),
      ),
      { x: M, y, size: 9, font, color: MUTED },
    );
    y -= 18;
    // Column headings
    page.drawText(safe(bold, t("person")), {
      x: M + 4,
      y: y - 12,
      size: headerSize,
      font: bold,
      color: INK,
    });
    page.drawText(safe(bold, t("compliance")), {
      x: M + nameW + 4,
      y: y - 12,
      size: headerSize,
      font: bold,
      color: INK,
    });
    headerLines.forEach((lines, i) =>
      lines.forEach((line, j) =>
        page.drawText(line, {
          x: M + nameW + pctW + i * colW + 3,
          y: y - 12 - j * (headerSize + 2),
          size: headerSize,
          font: bold,
          color: INK,
        }),
      ),
    );
    y -= headerH;
    page.drawLine({
      start: { x: M, y },
      end: { x: W - M, y },
      thickness: 1,
      color: BORDER,
    });
  };
  newPage();

  for (const p of listed) {
    if (y - rowH < M + 40) newPage();
    const top = y;
    const mid = top - rowH / 2 - 3;
    const personRows = rows.filter((r) => r.employee_id === p.id);
    const summary = summarise(personRows);
    page!.drawText(wrap(font, p.full_name as string, 9, nameW - 8)[0] ?? "", {
      x: M + 4,
      y: mid,
      size: 9,
      font,
      color: INK,
    });
    page!.drawText(summary.mandatoryTotal ? `${summary.percent}%` : "-", {
      x: M + nameW + 4,
      y: mid,
      size: 9,
      font: bold,
      color: INK,
    });
    matrix.columns.forEach((c, i) => {
      const cell = matrix.cell(p.id as string, c.id);
      const x = M + nameW + pctW + i * colW + 3;
      if (!cell) {
        page!.drawText("-", { x: x + 2, y: mid, size: 9, font, color: MUTED });
        return;
      }
      const colours =
        TONE_COLOURS[statusTone("credential", cell.display_status)];
      const text = safe(
        font,
        label(cell.display_status) +
          (cell.requirement === "optional" ? "*" : ""),
      );
      const size = 7.5;
      const w = Math.min(colW - 6, font.widthOfTextAtSize(text, size) + 10);
      page!.drawRectangle({
        x,
        y: top - rowH + 5,
        width: w,
        height: rowH - 10,
        color: hex(colours.fill),
      });
      page!.drawText(text, {
        x: x + 5,
        y: mid + 0.5,
        size,
        font,
        color: hex(colours.text),
      });
    });
    y -= rowH;
    page!.drawLine({
      start: { x: M, y },
      end: { x: W - M, y },
      thickness: 0.5,
      color: BORDER,
    });
  }

  // Key: every status as text + colour, and the optional marker.
  if (y < M + 40) newPage();
  let x = M;
  const ky = M + 8;
  page!.drawText(safe(bold, `${t("legend")}:`), {
    x,
    y: ky,
    size: 8,
    font: bold,
    color: INK,
  });
  x += 34;
  for (const s of DISPLAY_STATUSES) {
    const colours = TONE_COLOURS[statusTone("credential", s)];
    const text = safe(font, label(s));
    const w = font.widthOfTextAtSize(text, 7.5) + 10;
    page!.drawRectangle({
      x,
      y: ky - 4,
      width: w,
      height: 14,
      color: hex(colours.fill),
    });
    page!.drawText(text, {
      x: x + 5,
      y: ky,
      size: 7.5,
      font,
      color: hex(colours.text),
    });
    x += w + 6;
  }
  page!.drawText(safe(font, `* ${t("optional")} · - ${t("notRequired")}`), {
    x: x + 6,
    y: ky,
    size: 7.5,
    font,
    color: MUTED,
  });

  const bytes = await pdf.save();
  const stamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date());
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="credential-compliance-${stamp}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
