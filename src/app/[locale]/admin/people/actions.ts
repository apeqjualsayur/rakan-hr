"use server";

import { refresh } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { malaysiaToday } from "@/lib/format";
import {
  parsePersonal,
  parsePlacement,
  parseStatutory,
} from "@/lib/people/employee";
import {
  dbErrorKey,
  failed,
  peopleContext,
  saved,
  signedDocumentUrl,
} from "@/lib/people/server";
import {
  DOC_TYPES,
  documentFolder,
  parseBankAccount,
  parseContract,
  parseDependent,
  parseDocument,
  type DocType,
} from "@/lib/people/records";
import {
  isUuid,
  type ErrorKey,
  type FieldErrors,
  type FormState,
} from "@/lib/settings/form";

// People (EMP-01 → EMP-06). Owner and HR admin write (employees_* policies); the database
// encrypts IC and account numbers, numbers new employees and refuses reporting loops.
// Files go from the browser straight to the private buckets (Storage RLS + bucket limits),
// then are attached here; they are only ever opened through short-lived signed URLs.

type Ctx = NonNullable<Awaited<ReturnType<typeof peopleContext>>>;

const fieldError = (name: string, key: ErrorKey): FormState => ({
  status: "error",
  errors: { [name]: key },
});

/** Maps a write error to the field it belongs to, when there is one. */
function writeFailed(
  error: Parameters<typeof dbErrorKey>[0],
  context: string,
): FormState {
  const key = dbErrorKey(error, context);
  if (
    key === "duplicateId" ||
    key === "invalidMykad" ||
    key === "invalidPassport"
  )
    return fieldError("id_no", key);
  if (key === "managerLoop") return fieldError("manager_id", key);
  if (key === "invalidAccountNo") return fieldError("account_no", key);
  return failed(key);
}

async function updateEmployee(
  ctx: Ctx,
  id: string,
  values: Record<string, unknown>,
  context: string,
): Promise<FormState> {
  const { data, error } = await ctx.supabase
    .from("employees")
    .update(values)
    .eq("id", id)
    .select("id");
  if (error) return writeFailed(error, context);
  if (!data?.length) return failed("notFound");
  refresh();
  return saved();
}

function employeeIdFrom(formData: FormData) {
  const id = formData.get("employee_id");
  return isUuid(id) ? id : null;
}

/** New employee: personal details, job and first contract; then their record opens. */
export async function createEmployee(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await peopleContext("editPeople");
  if (!ctx) return failed("forbidden");

  const errors: FieldErrors = {};
  const personal = parsePersonal(formData, malaysiaToday(), errors);
  const placement = parsePlacement(formData, errors);
  const contract = parseContract(formData, errors);
  if (!personal.ok || !placement.ok || !contract.ok)
    return { status: "error", errors };

  const { data, error } = await ctx.supabase
    .from("employees")
    .insert({
      tenant_id: ctx.member.tenantId,
      ...personal.values,
      ...placement.values,
    })
    .select("id")
    .single();
  if (error || !data)
    return error ? writeFailed(error, "createEmployee") : failed("saveFailed");

  const { error: contractError } = await ctx.supabase
    .from("employment_records")
    .insert({ employee_id: data.id, ...contract.values, is_current: true });
  if (contractError) dbErrorKey(contractError, "createEmployee contract");

  redirect({
    href: `/admin/people/${data.id}?created=1`,
    locale: await getLocale(),
  });
  return saved();
}

export async function savePersonal(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await peopleContext("editPeople");
  const id = employeeIdFrom(formData);
  if (!ctx || !id) return failed("forbidden");
  const parsed = parsePersonal(formData, malaysiaToday());
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  return updateEmployee(ctx, id, parsed.values, "savePersonal");
}

export async function savePlacement(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await peopleContext("editPeople");
  const id = employeeIdFrom(formData);
  if (!ctx || !id) return failed("forbidden");
  const parsed = parsePlacement(formData, {}, id);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  return updateEmployee(ctx, id, parsed.values, "savePlacement");
}

export async function saveStatutory(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await peopleContext("editPeople");
  const id = employeeIdFrom(formData);
  if (!ctx || !id) return failed("forbidden");
  const parsed = parseStatutory(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  return updateEmployee(ctx, id, parsed.values, "saveStatutory");
}

/**
 * Edits the current contract (record_id set), or starts a new one: the database then ends
 * the previous contract the day before and keeps it in the history.
 */
export async function saveContract(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await peopleContext("editPeople");
  const id = employeeIdFrom(formData);
  if (!ctx || !id) return failed("forbidden");
  const parsed = parseContract(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const recordId = formData.get("record_id");
  const query = isUuid(recordId)
    ? ctx.supabase
        .from("employment_records")
        .update(parsed.values)
        .eq("id", recordId)
        .eq("employee_id", id)
    : ctx.supabase
        .from("employment_records")
        .insert({ employee_id: id, ...parsed.values, is_current: true });
  const { data, error } = await query.select("id");
  if (error) return failed(dbErrorKey(error, "saveContract"));
  if (!data?.length) return failed("notFound");
  refresh();
  return saved();
}

/** HR enters the account directly: it becomes the primary one, verified by them (EMP-05). */
export async function addBankAccount(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await peopleContext("viewSensitive");
  const id = employeeIdFrom(formData);
  if (!ctx || !id) return failed("forbidden");
  const { data: banks } = await ctx.supabase
    .from("banks")
    .select("code")
    .eq("is_active", true);
  const parsed = parseBankAccount(
    formData,
    (banks ?? []).map((b) => b.code as string),
  );
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const { error } = await ctx.supabase.from("bank_accounts").insert({
    employee_id: id,
    ...parsed.values,
    is_primary: true,
    status: "active",
  });
  if (error) return writeFailed(error, "addBankAccount");
  refresh();
  return saved();
}

type Reveal = { value: string } | { error: ErrorKey };

/** Full IC number, for owner / HR admin. The database logs every reveal. */
export async function revealIdNo(employeeId: string): Promise<Reveal> {
  const ctx = await peopleContext("viewSensitive");
  if (!ctx || !isUuid(employeeId)) return { error: "forbidden" };
  const { data, error } = await ctx.supabase.rpc("reveal_employee_id_no", {
    p_employee_id: employeeId,
  });
  if (error || typeof data !== "string") return { error: "notFound" };
  return { value: data };
}

export async function revealAccountNo(accountId: string): Promise<Reveal> {
  const ctx = await peopleContext("viewSensitive");
  if (!ctx || !isUuid(accountId)) return { error: "forbidden" };
  const { data, error } = await ctx.supabase.rpc("reveal_bank_account_no", {
    p_bank_account_id: accountId,
  });
  if (error || typeof data !== "string") return { error: "notFound" };
  return { value: data };
}

export async function saveDependent(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await peopleContext("editPeople");
  const id = employeeIdFrom(formData);
  if (!ctx || !id) return failed("forbidden");
  const parsed = parseDependent(formData, malaysiaToday());
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const dependentId = formData.get("dependent_id");
  const query = isUuid(dependentId)
    ? ctx.supabase
        .from("dependents")
        .update(parsed.values)
        .eq("id", dependentId)
        .eq("employee_id", id)
    : ctx.supabase
        .from("dependents")
        .insert({ employee_id: id, ...parsed.values });
  const { data, error } = await query.select("id");
  if (error) return failed(dbErrorKey(error, "saveDependent"));
  if (!data?.length) return failed("notFound");
  refresh();
  return saved();
}

export async function removeDependent(dependentId: string): Promise<FormState> {
  const ctx = await peopleContext("editPeople");
  if (!ctx || !isUuid(dependentId)) return failed("forbidden");
  const { error, count } = await ctx.supabase
    .from("dependents")
    .delete({ count: "exact" })
    .eq("id", dependentId);
  if (error) return failed(dbErrorKey(error, "removeDependent"));
  if (count === 0) return failed("notFound");
  refresh();
  return saved();
}

// ── Documents (EMP-06), bucket `documents` ──

export async function attachDocument(
  employeeId: string,
  path: string,
  values: { doc_type: string; title: string; expiry_date: string },
  file: { mime: string; size: number },
): Promise<FormState> {
  const ctx = await peopleContext("viewSensitive");
  if (!ctx || !isUuid(employeeId)) return failed("forbidden");
  const form = new FormData();
  for (const [k, v] of Object.entries(values)) form.set(k, v);
  const parsed = parseDocument(form);
  const docType = parsed.ok ? parsed.values.doc_type : null;
  if (
    !parsed.ok ||
    !docType ||
    !(DOC_TYPES as readonly string[]).includes(docType) ||
    !path.startsWith(
      documentFolder(ctx.member.tenantId, employeeId, docType as DocType),
    ) ||
    path.includes("..")
  ) {
    await ctx.supabase.storage.from("documents").remove([path]);
    return parsed.ok
      ? failed("forbidden")
      : { status: "error", errors: parsed.errors };
  }

  const { error } = await ctx.supabase.from("documents").insert({
    employee_id: employeeId,
    ...parsed.values,
    file_path: path,
    mime: file.mime,
    size_bytes: file.size,
  });
  if (error) {
    await ctx.supabase.storage.from("documents").remove([path]);
    return failed(dbErrorKey(error, "attachDocument"));
  }
  refresh();
  return saved();
}

export async function removeDocument(documentId: string): Promise<FormState> {
  const ctx = await peopleContext("viewSensitive");
  if (!ctx || !isUuid(documentId)) return failed("forbidden");
  const { data, error } = await ctx.supabase
    .from("documents")
    .delete()
    .eq("id", documentId)
    .select("file_path");
  if (error) return failed(dbErrorKey(error, "removeDocument"));
  if (!data?.length) return failed("notFound");
  await ctx.supabase.storage
    .from("documents")
    .remove([data[0].file_path as string]);
  refresh();
  return saved();
}

/** A 5-minute signed link (data-model.md §6). Staff may open their own documents too. */
export async function documentUrl(
  documentId: string,
): Promise<{ url: string } | { error: ErrorKey }> {
  const ctx = await peopleContext("viewSensitive");
  if (!ctx || !isUuid(documentId)) return { error: "forbidden" };
  return signedDocumentUrl(ctx.supabase, documentId);
}

// ── Profile photo, bucket `avatars`: {tenant_id}/{employee_id}.{ext} ──

export async function setPhoto(
  employeeId: string,
  path: string,
): Promise<FormState> {
  const ctx = await peopleContext("editPeople");
  if (!ctx || !isUuid(employeeId)) return failed("forbidden");
  if (
    !/^[^/]+\/[^/]+\.(jpg|png|webp)$/.test(path) ||
    !path.startsWith(`${ctx.member.tenantId}/${employeeId}.`)
  )
    return failed("forbidden");
  const { data: before } = await ctx.supabase
    .from("employees")
    .select("photo_path")
    .eq("id", employeeId)
    .maybeSingle();
  const result = await updateEmployee(
    ctx,
    employeeId,
    { photo_path: path },
    "setPhoto",
  );
  const old = before?.photo_path as string | null | undefined;
  if (result.status === "saved" && old && old !== path) {
    await ctx.supabase.storage.from("avatars").remove([old]);
  }
  return result;
}

export async function removePhoto(employeeId: string): Promise<FormState> {
  const ctx = await peopleContext("editPeople");
  if (!ctx || !isUuid(employeeId)) return failed("forbidden");
  const { data: before } = await ctx.supabase
    .from("employees")
    .select("photo_path")
    .eq("id", employeeId)
    .maybeSingle();
  const result = await updateEmployee(
    ctx,
    employeeId,
    { photo_path: null },
    "removePhoto",
  );
  if (result.status === "saved" && before?.photo_path) {
    await ctx.supabase.storage
      .from("avatars")
      .remove([before.photo_path as string]);
  }
  return result;
}
