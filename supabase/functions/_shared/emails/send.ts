// Sends one email through Resend (RESEND_API_KEY, EMAIL_FROM). Shared by the notification
// and hiring functions.

import { render } from "npm:@react-email/components@1.0.12";

/** Returns the failure reason, or null when sent. */
export async function sendEmail(
  to: string,
  subject: string,
  element: Parameters<typeof render>[0],
): Promise<string | null> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return "RESEND_API_KEY is not set";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("EMAIL_FROM") || "Rakan <onboarding@resend.dev>",
      to: [to],
      subject,
      html: await render(element),
      text: await render(element, { plainText: true }),
    }),
  });
  return res.ok ? null : `Resend ${res.status}: ${await res.text()}`;
}
