# Bank payment files (PAY-10)

Rakan is not tied to any bank. Payroll gives this folder three things and gets one file back:

```ts
generateBankFile(run, companyAccount, lines) // → { fileName, mimeType, content, lineCount, total }
```

- `run`: the payroll month, pay date and an optional payment description.
- `companyAccount`: the paying account, its bank, its full account number (decrypted on the server with `company_bank_account_no()`), any corporate ID or organisation code, and its file format.
- `lines`: one per employee, giving name, IC, bank, account number and net pay.

The account's `bank_file_formats.adapter_key` picks the adapter. If anything is wrong, such as a missing account number, a zero amount or an employee listed twice, the adapter throws a `BankFileError` that lists every problem. Payroll shows all of them at once.

The code is plain TypeScript with no npm or URL imports. The payroll Edge Function (Deno), the app (via `src/lib/payments/bank-files.ts`) and the unit tests all use this one copy.

## Files

| File | What it is |
| --- | --- |
| `types.ts` | The shared shapes: `BankFileRun`, `CompanyAccount`, `PaymentLine`, `BankFile`, `BankFileAdapter`, `BankFileError` |
| `common.ts` | Helpers every adapter uses: money in whole sen, the standard line checks, same-bank vs interbank, date formats |
| `generic-csv.ts` | `GENERIC_CSV`, the fallback that always works. Columns, headers, delimiter and date format come from a column mapping, which the Owner can change per account in Settings → Company bank accounts. |
| `adapters.ts` | The registry (`adapter_key` → adapter) and `generateBankFile` |

## Adding a bank (one adapter per bank file spec)

1. **Get the spec.** Ask the bank for its bulk-payment file specification for the corporate banking product the company uses, for example Maybank2u Biz, CIMB BizChannel, Public Bank PBe, RHB Reflex, Bank Islam GO, Hong Leong ConnectFirst or AmBank AmAccess. Also get a sample file and any corporate ID or organisation code they assign.
2. **Write the adapter.** Create `<bank>-<product>.ts` in this folder, for example `mbb-m2u-biz.ts`, exporting a `BankFileAdapter`:
   ```ts
   export const mbbM2uBiz: BankFileAdapter = {
     key: "mbb_m2u_biz",
     generate(run, account, lines) {
       const problems = checkLines(account, lines, { bic: true });
       if (problems.length) throw new BankFileError(problems);
       // header record (account.corporateId / account.orgCode), one detail record per line
       // (isSameBank(account, line) decides the transaction type), trailer with totals.
     },
   };
   ```
   Keep it pure: the same input must give the same file, byte for byte. Use `toSen` / `fromSen` for money, never floating point.
3. **Register it** in `ADAPTERS` in `adapters.ts`.
4. **Add the format row** in a new migration (never edit an applied one):
   ```sql
   insert into public.bank_file_formats (code, name, bank_code, version, adapter_key)
   values ('MBB_M2U_BIZ', 'Maybank2u Biz bulk payment', 'MBB', '1', 'mbb_m2u_biz');
   ```
   `bank_code` ties the format to its bank, so it is offered only for accounts at that bank.
5. **Test it** with a golden file in `src/lib/payments/`: build the file from fixed inputs and compare it with the bank's sample, byte for byte. Cover same-bank and interbank lines, and the header and trailer totals.
6. **Check the bank codes.** `banks.ibg_code` holds each bank's RENTAS BIC, from Bank Islam's IBG listing. If the bank's spec asks for a different code, such as a numeric bank code, map it inside the adapter and note the source.
7. **Try it** on the bank's test or UAT upload screen before the first live run.

Payroll logic, payslips and statutory files do not change. Switching banks mid-year is a new company account with a new format; old runs keep the format they were locked with (`payroll_runs.bank_file_format_code`), so they re-export identically.
