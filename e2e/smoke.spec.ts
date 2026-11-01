import { expect, test } from "@playwright/test";

test("root redirects to English and the language toggle switches to BM", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText("Layout previews")).toBeVisible();

  await page.getByRole("button", { name: "BM" }).click();
  await expect(page).toHaveURL(/\/ms$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ms");
  await expect(page.getByText("Pratonton susun atur")).toBeVisible();
});

test("admin and staff placeholder shells render", async ({ page }) => {
  await page.goto("/en/admin");
  await expect(page.getByRole("heading", { name: "Admin home" })).toBeVisible();

  await page.goto("/en/staff");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});

test("PWA manifest is served", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  expect((await res.json()).name).toBe("Rakan");
});
