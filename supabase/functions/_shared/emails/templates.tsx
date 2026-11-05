/** @jsxImportSource npm:react@19.3.0 */
// React Email templates for public.notify() (FND-07), in English and Bahasa Malaysia.
// Template keys and wording match Notifications.templates in messages/*.json, which the
// in-app bell uses. Add a key in both places when a later step adds a template.

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "npm:@react-email/components@1.0.12";
import type { ReactElement } from "npm:react@19.3.0";
import { letterDate } from "../letters/merge.ts";

export type Locale = "en" | "ms";
type Data = Record<string, unknown>;

const copy = {
  en: {
    entity: {
      claim: "claim",
      test: "test",
      fallback: "approval",
      profile_change: "profile change",
      bank_change: "bank change",
      credential: "credential",
      probation_review: "probation review",
      leave: "leave",
      overtime: "overtime",
    } as Record<string, string>,
    open: "Open Rakan",
    footer:
      "You get this email because you use Rakan. Sign in to see all your notifications.",
    test: {
      title: "Test notification",
      body: "In-app and email notifications are working.",
    },
    approvalRequested: (entity: string, step: string) => ({
      title: "Approval needed",
      body: `A ${entity} request needs your approval (step ${step}).`,
    }),
    approvalDecided: (entity: string, approved: boolean, comment?: string) => ({
      title: `Your ${entity} request was ${approved ? "approved" : "rejected"}`,
      body: comment ? `Comment: ${comment}` : "",
    }),
    // Step 4 Settings > Users. Sent by the Edge Function from a membership, not a notification.
    roles: {
      owner: "Owner",
      hr_admin: "HR Admin",
      payroll_approver: "Payroll Approver",
      manager: "Manager",
      staff: "Staff",
      auditor: "Auditor (read-only)",
    } as Record<string, string>,
    yourCompany: "Your company",
    invite: (company: string, role: string) => ({
      title: "You're invited to Rakan",
      body: `${company} has invited you to Rakan as ${role}. Sign in with this email address and we'll send you a 6-digit code.`,
    }),
    // Step 6 credential reminders and CPD (data.for_hr = the HR version).
    credentialExpiring: (
      type: string,
      days: number,
      name: string,
      hr: boolean,
    ) => ({
      title: hr
        ? days === 0
          ? `${name}'s ${type} expires today`
          : `${name}'s ${type} expires in ${days} day${days === 1 ? "" : "s"}`
        : days === 0
          ? `${type} expires today`
          : `${type} expires in ${days} day${days === 1 ? "" : "s"}`,
      body: hr
        ? "Check they renew it in time."
        : "Upload the renewed certificate in Rakan before it expires.",
    }),
    credentialExpired: (type: string, name: string, hr: boolean) => ({
      title: hr ? `${name}'s ${type} has expired` : `${type} has expired`,
      body: hr
        ? "Follow up today: clinical work may not be covered until it is renewed."
        : "Upload the renewed certificate now. Expired credentials are flagged on the roster.",
    }),
    cpdBehind: (
      type: string,
      name: string,
      hr: boolean,
      points: string,
      target: string,
      date: string,
    ) => ({
      title: hr
        ? `${name} is behind on CPD for ${type}`
        : `CPD behind target: ${type}`,
      body: `${points} of ${target} points expected by now; renewal on ${date}.`,
    }),
    cpdDecided: (title: string, verified: boolean, reason?: string) => ({
      title: `Your CPD “${title}” was ${verified ? "verified" : "rejected"}`,
      body: reason ? `Reason: ${reason}` : "",
    }),
    // Step 7 announcements and policies.
    announcement: (title: string) => ({
      title: `New announcement: ${title}`,
      body: "",
    }),
    policyPublished: (title: string, version: string) => ({
      title: `Please read and sign: ${title}`,
      body: `Version ${version} has been published.`,
    }),
    policyReminder: (title: string, days: string) => ({
      title: `Reminder: sign ${title}`,
      body: `It has been waiting for ${days} days.`,
    }),
    // Step 8 hiring and probation. The offer goes to a candidate, who has no account.
    offer: (company: string, title: string, date: string) => ({
      title: `Your job offer from ${company}`,
      body: `${company} is offering you the position of ${title}. Read the offer letter and contract, then accept by ${date}. This link works once: open it on the phone or computer you will keep using.`,
    }),
    offerButton: "Open my offer",
    offerFooter:
      "You get this email because a company that uses Rakan made you a job offer. If you were not expecting it, you can ignore it.",
    offerAccepted: (name: string, title: string) => ({
      title: `${name} accepted the offer`,
      body: `${title}. They can now fill in their pre-boarding details.`,
    }),
    preboardingCompleted: (name: string) => ({
      title: `${name} finished pre-boarding`,
      body: "Check their details and credentials, then convert them to an employee.",
    }),
    probationDue: (name: string, days: number, date: string) => ({
      title:
        days === 0
          ? `${name}'s probation ends today`
          : `${name}'s probation ends in ${days} day${days === 1 ? "" : "s"}`,
      body: `Probation ends on ${date}. Please complete the probation review in Rakan.`,
    }),
    probationDecided: (
      name: string,
      confirmed: boolean,
      date: string,
      self: boolean,
    ) =>
      confirmed
        ? {
            title: self
              ? "Your appointment is confirmed"
              : `${name}'s appointment is confirmed`,
            body: self
              ? `Confirmed from ${date}. Your confirmation letter is in Rakan.`
              : `Confirmed from ${date}.`,
          }
        : {
            title: self
              ? "Your probation has been extended"
              : `${name}'s probation was extended`,
            body: self
              ? `It now ends on ${date}. Your letter is in Rakan.`
              : `It now ends on ${date}.`,
          },
    probationEndApproved: (name: string) => ({
      title: `Approved: end ${name}'s employment after probation`,
      body: "Give notice as the contract sets out.",
    }),
    rosterPublished: (date: string) => ({
      title: "Your roster is out",
      body: `Shifts for the week of ${date} are published. Open Rakan to see them.`,
    }),
    otLimitExceeded: (
      name: string,
      hours: string,
      month: string,
      limit: string,
    ) => ({
      title: `${name} is over the monthly OT limit`,
      body: `${hours} OT hours in ${month} (limit ${limit}).`,
    }),
    weeklyHoursExceeded: (
      name: string,
      cap: string,
      hours: string,
      date: string,
    ) => ({
      title: `${name} worked over ${cap} hours`,
      body: `${hours} hours in the week of ${date}.`,
    }),
    fallback: { title: "New notification", body: "" },
  },
  ms: {
    entity: {
      claim: "tuntutan",
      test: "ujian",
      fallback: "kelulusan",
      profile_change: "perubahan profil",
      bank_change: "perubahan bank",
      credential: "kredensial",
      probation_review: "penilaian percubaan",
      leave: "cuti",
      overtime: "lebih masa",
    } as Record<string, string>,
    open: "Buka Rakan",
    footer:
      "Anda menerima e-mel ini kerana anda menggunakan Rakan. Log masuk untuk melihat semua pemberitahuan anda.",
    test: {
      title: "Pemberitahuan ujian",
      body: "Pemberitahuan dalam aplikasi dan e-mel berfungsi.",
    },
    approvalRequested: (entity: string, step: string) => ({
      title: "Kelulusan diperlukan",
      body: `Permohonan ${entity} memerlukan kelulusan anda (langkah ${step}).`,
    }),
    approvalDecided: (entity: string, approved: boolean, comment?: string) => ({
      title: `Permohonan ${entity} anda ${approved ? "diluluskan" : "ditolak"}`,
      body: comment ? `Ulasan: ${comment}` : "",
    }),
    roles: {
      owner: "Pemilik",
      hr_admin: "Pentadbir HR",
      payroll_approver: "Pelulus Gaji",
      manager: "Pengurus",
      staff: "Kakitangan",
      auditor: "Juruaudit (baca sahaja)",
    } as Record<string, string>,
    yourCompany: "Syarikat anda",
    invite: (company: string, role: string) => ({
      title: "Anda dijemput ke Rakan",
      body: `${company} telah menjemput anda ke Rakan sebagai ${role}. Log masuk dengan alamat e-mel ini dan kami akan menghantar kod 6 digit kepada anda.`,
    }),
    credentialExpiring: (
      type: string,
      days: number,
      name: string,
      hr: boolean,
    ) => ({
      title: hr
        ? days === 0
          ? `${type} ${name} luput hari ini`
          : `${type} ${name} luput dalam ${days} hari`
        : days === 0
          ? `${type} luput hari ini`
          : `${type} luput dalam ${days} hari`,
      body: hr
        ? "Pastikan mereka memperbaharuinya tepat pada masanya."
        : "Muat naik sijil yang diperbaharui dalam Rakan sebelum ia luput.",
    }),
    credentialExpired: (type: string, name: string, hr: boolean) => ({
      title: hr ? `${type} ${name} telah luput` : `${type} telah luput`,
      body: hr
        ? "Susuli hari ini: kerja klinikal mungkin tidak dilindungi sehingga ia diperbaharui."
        : "Muat naik sijil yang diperbaharui sekarang. Kredensial yang luput ditanda dalam jadual tugas.",
    }),
    cpdBehind: (
      type: string,
      name: string,
      hr: boolean,
      points: string,
      target: string,
      date: string,
    ) => ({
      title: hr
        ? `${name} ketinggalan CPD untuk ${type}`
        : `CPD di bawah sasaran: ${type}`,
      body: `${points} daripada ${target} mata dijangka setakat ini; pembaharuan pada ${date}.`,
    }),
    cpdDecided: (title: string, verified: boolean, reason?: string) => ({
      title: `CPD anda “${title}” telah ${verified ? "disahkan" : "ditolak"}`,
      body: reason ? `Sebab: ${reason}` : "",
    }),
    announcement: (title: string) => ({
      title: `Pengumuman baharu: ${title}`,
      body: "",
    }),
    policyPublished: (title: string, version: string) => ({
      title: `Sila baca dan tandatangan: ${title}`,
      body: `Versi ${version} telah diterbitkan.`,
    }),
    policyReminder: (title: string, days: string) => ({
      title: `Peringatan: tandatangan ${title}`,
      body: `Ia telah menunggu selama ${days} hari.`,
    }),
    offer: (company: string, title: string, date: string) => ({
      title: `Tawaran kerja anda daripada ${company}`,
      body: `${company} menawarkan jawatan ${title} kepada anda. Baca surat tawaran dan kontrak, kemudian terima sebelum ${date}. Pautan ini hanya berfungsi sekali: bukanya pada telefon atau komputer yang akan anda gunakan.`,
    }),
    offerButton: "Buka tawaran saya",
    offerFooter:
      "Anda menerima e-mel ini kerana syarikat yang menggunakan Rakan membuat tawaran kerja kepada anda. Jika anda tidak menjangkakannya, abaikan e-mel ini.",
    offerAccepted: (name: string, title: string) => ({
      title: `${name} menerima tawaran`,
      body: `${title}. Mereka kini boleh mengisi butiran pra-penyertaan.`,
    }),
    preboardingCompleted: (name: string) => ({
      title: `${name} telah melengkapkan pra-penyertaan`,
      body: "Semak butiran dan kredensial mereka, kemudian tukarkan mereka kepada pekerja.",
    }),
    probationDue: (name: string, days: number, date: string) => ({
      title:
        days === 0
          ? `Tempoh percubaan ${name} tamat hari ini`
          : `Tempoh percubaan ${name} tamat dalam ${days} hari`,
      body: `Tempoh percubaan tamat pada ${date}. Sila lengkapkan penilaian percubaan dalam Rakan.`,
    }),
    probationDecided: (
      name: string,
      confirmed: boolean,
      date: string,
      self: boolean,
    ) =>
      confirmed
        ? {
            title: self
              ? "Jawatan anda telah disahkan"
              : `Jawatan ${name} telah disahkan`,
            body: self
              ? `Disahkan mulai ${date}. Surat pengesahan anda ada dalam Rakan.`
              : `Disahkan mulai ${date}.`,
          }
        : {
            title: self
              ? "Tempoh percubaan anda telah dilanjutkan"
              : `Tempoh percubaan ${name} telah dilanjutkan`,
            body: self
              ? `Ia kini tamat pada ${date}. Surat anda ada dalam Rakan.`
              : `Ia kini tamat pada ${date}.`,
          },
    probationEndApproved: (name: string) => ({
      title: `Diluluskan: tamatkan pekerjaan ${name} selepas tempoh percubaan`,
      body: "Berikan notis seperti yang ditetapkan dalam kontrak.",
    }),
    rosterPublished: (date: string) => ({
      title: "Jadual tugas anda telah keluar",
      body: `Syif untuk minggu ${date} telah diterbitkan. Buka Rakan untuk melihatnya.`,
    }),
    otLimitExceeded: (
      name: string,
      hours: string,
      month: string,
      limit: string,
    ) => ({
      title: `${name} melebihi had lebih masa bulanan`,
      body: `${hours} jam lebih masa pada ${month} (had ${limit}).`,
    }),
    weeklyHoursExceeded: (
      name: string,
      cap: string,
      hours: string,
      date: string,
    ) => ({
      title: `${name} bekerja melebihi ${cap} jam`,
      body: `${hours} jam pada minggu ${date}.`,
    }),
    fallback: { title: "Pemberitahuan baharu", body: "" },
  },
};

const localTitle = (data: Data, locale: Locale) =>
  String((locale === "ms" ? data.title_ms : data.title_en) ?? "");

const typeName = (data: Data, locale: Locale) =>
  String(
    (locale === "ms" ? data.type_name_ms : data.type_name_en) ??
      data.type_code ??
      "",
  );

function text(template: string, data: Data, locale: Locale) {
  const c = copy[locale];
  const entity = c.entity[String(data.entity_type)] ?? c.entity.fallback;
  switch (template) {
    case "test":
      return c.test;
    case "approval_requested":
      return c.approvalRequested(entity, String(data.step_no ?? 1));
    case "approval_decided":
      return c.approvalDecided(
        entity,
        data.decision === "approved",
        data.comment ? String(data.comment) : undefined,
      );
    case "invite":
      return c.invite(
        data.company ? String(data.company) : c.yourCompany,
        c.roles[String(data.role)] ?? String(data.role ?? ""),
      );
    case "credential_expiring":
      return c.credentialExpiring(
        typeName(data, locale),
        Number(data.days_left ?? 0),
        String(data.employee_name ?? ""),
        data.for_hr === true,
      );
    case "credential_expired":
      return c.credentialExpired(
        typeName(data, locale),
        String(data.employee_name ?? ""),
        data.for_hr === true,
      );
    case "cpd_behind":
      return c.cpdBehind(
        typeName(data, locale),
        String(data.employee_name ?? ""),
        data.for_hr === true,
        String(data.points ?? 0),
        String(data.target ?? 0),
        String(data.cycle_end ?? ""),
      );
    case "announcement":
      return c.announcement(localTitle(data, locale));
    case "policy_published":
      return c.policyPublished(
        localTitle(data, locale),
        String(data.version ?? 1),
      );
    case "policy_reminder":
      return c.policyReminder(localTitle(data, locale), String(data.days ?? 3));
    case "cpd_decided":
      return c.cpdDecided(
        String(data.title ?? ""),
        data.decision === "verified",
        data.reason ? String(data.reason) : undefined,
      );
    case "offer":
      return c.offer(
        String(data.company ?? c.yourCompany),
        String(data.job_title ?? ""),
        letterDate(String(data.expires_on ?? ""), locale),
      );
    case "offer_accepted":
      return c.offerAccepted(
        String(data.candidate_name ?? ""),
        String(data.job_title ?? ""),
      );
    case "preboarding_completed":
      return c.preboardingCompleted(String(data.candidate_name ?? ""));
    case "probation_due":
      return c.probationDue(
        String(data.employee_name ?? ""),
        Number(data.days_left ?? 0),
        letterDate(String(data.end_date ?? ""), locale),
      );
    case "probation_decided":
      return c.probationDecided(
        String(data.employee_name ?? ""),
        data.outcome === "confirm",
        letterDate(String(data.date ?? ""), locale),
        data.for_employee === true,
      );
    case "probation_end_approved":
      return c.probationEndApproved(String(data.employee_name ?? ""));
    case "roster_published":
      return c.rosterPublished(
        letterDate(String(data.week_start ?? ""), locale),
      );
    case "ot_limit_exceeded":
      return c.otLimitExceeded(
        String(data.employee_name ?? ""),
        String(data.hours ?? ""),
        String(data.month ?? ""),
        String(data.limit ?? ""),
      );
    case "weekly_hours_exceeded":
      return c.weeklyHoursExceeded(
        String(data.employee_name ?? ""),
        String(data.cap ?? ""),
        String(data.hours ?? ""),
        letterDate(String(data.week_start ?? ""), locale),
      );
    default:
      return c.fallback;
  }
}

// Brand colours from src/app/globals.css (email clients need inline styles).
const colours = {
  ink: "#1e2a24",
  muted: "#5b6b62",
  canvas: "#f6f3ea",
  primary: "#1e6b52",
  border: "#e4dfd0",
};

export function buildEmail(
  template: string,
  data: Data,
  locale: Locale,
  appUrl: string,
  link: string | null,
): { subject: string; element: ReactElement } {
  const c = copy[locale];
  const { title, body } = text(template, data, locale);
  const href = `${appUrl.replace(/\/$/, "")}${link ?? `/${locale}`}`;

  return {
    subject: title,
    element: (
      <Html lang={locale}>
        <Head />
        <Preview>{body || title}</Preview>
        <Body
          style={{
            backgroundColor: colours.canvas,
            fontFamily: "Inter, Arial, sans-serif",
            margin: 0,
          }}
        >
          <Container
            style={{ maxWidth: 480, margin: "0 auto", padding: "32px 16px" }}
          >
            <Text
              style={{
                color: colours.primary,
                fontSize: 22,
                fontWeight: 700,
                margin: "0 0 16px",
              }}
            >
              rakan
            </Text>
            <Section
              style={{
                backgroundColor: "#ffffff",
                border: `1px solid ${colours.border}`,
                borderRadius: 24,
                padding: 24,
              }}
            >
              <Heading
                as="h1"
                style={{
                  color: colours.ink,
                  fontSize: 22,
                  lineHeight: "30px",
                  margin: "0 0 8px",
                }}
              >
                {title}
              </Heading>
              {body ? (
                <Text
                  style={{
                    color: colours.muted,
                    fontSize: 16,
                    lineHeight: "24px",
                    margin: "0 0 20px",
                  }}
                >
                  {body}
                </Text>
              ) : null}
              <Button
                href={href}
                style={{
                  backgroundColor: colours.primary,
                  borderRadius: 12,
                  color: "#ffffff",
                  fontSize: 16,
                  fontWeight: 600,
                  padding: "12px 20px",
                }}
              >
                {template === "offer" ? c.offerButton : c.open}
              </Button>
            </Section>
            <Text
              style={{
                color: colours.muted,
                fontSize: 13,
                lineHeight: "20px",
                marginTop: 16,
              }}
            >
              {template === "offer" ? c.offerFooter : c.footer}
            </Text>
          </Container>
        </Body>
      </Html>
    ),
  };
}
