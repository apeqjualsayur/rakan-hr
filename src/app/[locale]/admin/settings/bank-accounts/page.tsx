import { getTranslations } from "next-intl/server";
import { requireMember } from "@/lib/auth/member";
import { can } from "@/lib/auth/roles";
import {
  BANK_FILE_FORMAT_COLUMNS,
  COMPANY_BANK_ACCOUNT_COLUMNS,
  type BankFileFormat,
  type CompanyBankAccount,
} from "@/lib/payments/accounts";
import type { Bank } from "@/lib/people/records";
import { createClient } from "@/lib/supabase/server";
import { BankAccountSettings } from "./BankAccountSettings";

export async function generateMetadata() {
  const t = await getTranslations("Settings.nav");
  return { title: t("bankAccounts") };
}

// PAY-10 Settings > Company bank accounts: any bank, one default, retired never deleted,
// numbers always masked. HR, payroll and audit read; only the Owner changes anything.
export default async function BankAccountsPage() {
  const member = await requireMember([
    "owner",
    "hr_admin",
    "payroll_approver",
    "auditor",
  ]);
  const supabase = await createClient();
  const [{ data: accounts }, { data: banks }, { data: formats }] =
    await Promise.all([
      supabase
        .from("company_bank_accounts")
        .select(COMPANY_BANK_ACCOUNT_COLUMNS)
        .order("is_default", { ascending: false })
        .order("created_at")
        .returns<CompanyBankAccount[]>(),
      supabase
        .from("banks")
        .select("code, name")
        .eq("is_active", true)
        .order("name")
        .returns<Bank[]>(),
      supabase
        .from("bank_file_formats")
        .select(BANK_FILE_FORMAT_COLUMNS)
        .eq("is_active", true)
        .order("name")
        .returns<BankFileFormat[]>(),
    ]);
  return (
    <BankAccountSettings
      accounts={accounts ?? []}
      banks={banks ?? []}
      formats={formats ?? []}
      canEdit={can(member.role, "manageCompanyBank")}
    />
  );
}
