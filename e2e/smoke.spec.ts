import { expect, test } from "@playwright/test";

test("signed-out visitors land on the login page, which switches to BM", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en\/login$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "Sign in to Rakan" }),
  ).toBeVisible();
  await expect(page.getByLabel("Work email")).toBeVisible();

  // The landing page streams a redirect; wait for hydration before using the toggle.
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "BM" }).click();
  await expect(page).toHaveURL(/\/ms\/login$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ms");
  await expect(
    page.getByRole("heading", { name: "Log masuk ke Rakan" }),
  ).toBeVisible();
});

test("admin and staff areas redirect signed-out visitors to login", async ({
  page,
}) => {
  for (const path of [
    "/en/admin",
    "/en/staff",
    "/ms/mfa",
    "/en/admin/settings/company",
    "/en/admin/settings/branches/new",
    "/ms/admin/settings/users",
    "/en/admin/settings/setup-checklist",
    "/en/admin/people",
    "/en/admin/people/directory",
    "/ms/staff/me",
    "/en/staff/credentials",
    "/en/admin/compliance",
    "/en/admin/settings/credentials",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/(en|ms)\/login$/);
  }
});

test("login rejects an invalid email without sending anything", async ({
  page,
}) => {
  await page.goto("/en/login");
  await page.getByLabel("Work email").fill("not-an-email");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
});

test("PWA manifest is served", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  expect((await res.json()).name).toBe("Rakan");
});
