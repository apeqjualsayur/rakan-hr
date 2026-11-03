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

export type Locale = "en" | "ms";
type Data = Record<string, unknown>;

const copy = {
  en: {
    entity: {
      test: "test",
      fallback: "approval",
      profile_change: "profile change",
      bank_change: "bank change",
      credential: "credential",
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
    fallback: { title: "New notification", body: "" },
  },
  ms: {
    entity: {
      test: "ujian",
      fallback: "kelulusan",
      profile_change: "perubahan profil",
      bank_change: "perubahan bank",
      credential: "kredensial",
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
                {c.open}
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
              {c.footer}
            </Text>
          </Container>
        </Body>
      </Html>
    ),
  };
}
