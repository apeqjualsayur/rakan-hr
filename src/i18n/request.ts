import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { routing } from "./routing";

// Server Actions and Route Handlers cannot read root params:
// pass the locale explicitly there, e.g. getTranslations({ locale, namespace }).
export default getRequestConfig(async ({ locale: explicitLocale }) => {
  const requested = explicitLocale ?? (await rootLocale());
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
