import { defineConfig, devices } from "@playwright/test";

// Port 3002: 3000 is used by another project on this PC.
const baseURL = "http://localhost:3002";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    // On Windows, Chromium's sandboxed network service writes profile folders that this
    // user account cannot delete, and Playwright then stalls at teardown. Running the
    // network service in-process keeps the temporary profile deletable. Test browser only.
    launchOptions: {
      args: [
        "--enable-features=NetworkServiceInProcess,NetworkServiceInProcess2",
        "--disable-features=NetworkServiceSandbox",
      ],
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
