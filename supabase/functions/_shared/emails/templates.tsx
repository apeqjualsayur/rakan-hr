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
    entity: { test: "test", fallback: "approval" } as Record<string, string>,
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
    fallback: { title: "New notification", body: "" },
  },
  ms: {
    entity: { test: "ujian", fallback: "kelulusan" } as Record<string, string>,
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
    fallback: { title: "Pemberitahuan baharu", body: "" },
  },
};

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
