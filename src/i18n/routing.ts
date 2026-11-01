import { defineRouting } from "next-intl/routing";

// "ms" is the ISO code for Bahasa Malaysia; the UI labels it "BM".
export const routing = defineRouting({
  locales: ["en", "ms"],
  defaultLocale: "en",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
