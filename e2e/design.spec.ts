import { expect, test, type Page } from "@playwright/test";

// Build step 2 checks (ui-system.md §6) on the /design recreations, in EN and BM.

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

for (const locale of ["en", "ms"] as const) {
  test.describe(`design (${locale})`, () => {
    test("gallery renders every section", async ({ page }) => {
      await page.goto(`/${locale}/design`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      for (const id of ["buttons", "stepper", "credentials", "screens"]) {
        await expect(page.locator(`#${id}`)).toBeVisible();
      }
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });

    for (const width of [375, 768]) {
      test(`staff screens fit ${width} px without sideways scrolling`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 844 });
        for (const path of ["staff-home", "my-credentials"]) {
          await page.goto(`/${locale}/design/${path}`);
          expect(await horizontalOverflow(page), path).toBeLessThanOrEqual(0);
        }
      });
    }

    test("shift time stays on one line (fix §6.2)", async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(`/${locale}/design/staff-home`);
      const time = page.getByText(/^8:30 .+ 5:30 .+$/);
      const lineHeight = await time.evaluate((el) =>
        parseFloat(getComputedStyle(el).lineHeight),
      );
      const box = await time.boundingBox();
      expect(box!.height).toBeLessThan(lineHeight * 1.5);
    });

    test("payroll stepper shows all 6 states on one row (fix §6.1)", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`/${locale}/design/owner-home`);
      const steps = page.locator("ol > li");
      await expect(steps).toHaveCount(6);
      const tops = await steps.evaluateAll((items) =>
        items.map((li) => Math.round(li.getBoundingClientRect().top)),
      );
      expect(new Set(tops).size).toBe(1);
      await expect(page.locator('ol > li[aria-current="step"]')).toHaveCount(1);
    });

    test("owner home has exactly one accent button (fix §6.4)", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`/${locale}/design/owner-home`);
      const accentButtons = await page
        .locator("button, a")
        .evaluateAll(
          (els) =>
            els.filter(
              (el) =>
                getComputedStyle(el).backgroundColor === "rgb(196, 70, 31)",
            ).length,
        );
      expect(accentButtons).toBe(1);
    });

    test("button text never overflows its button", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 844 });
      for (const path of ["owner-home", "staff-home", "my-credentials"]) {
        await page.goto(`/${locale}/design/${path}`);
        // Skips the Next.js dev-tools button, which only exists in development.
        const clipped = await page
          .locator("button:not([data-nextjs-dev-tools-button]), a")
          .evaluateAll((els) =>
            els
              .filter((el) => el.scrollWidth > el.clientWidth + 1)
              .map((el) => el.textContent?.trim()),
          );
        expect(clipped, path).toEqual([]);
      }
    });
  });
}

test("outside the geofence, Clock in asks for a reason (fix §6.3)", async ({
  page,
}) => {
  await page.goto("/en/design#heroes");
  const outside = page
    .locator("section")
    .filter({ hasText: "Outside the centre" })
    .last();
  await outside.getByRole("button", { name: "Clock in" }).click();
  await outside.getByRole("button", { name: "Clock in with reason" }).click();
  await expect(outside.getByText("Enter a reason to clock in.")).toBeVisible();
});
