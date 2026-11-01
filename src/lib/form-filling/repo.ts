import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  formFillingApiKeys,
  formFillingFields,
  formFillingForms,
  formFillingSubmissions,
  formFillingWorkspaces,
  type FormFillingFieldRow,
  type FormFillingFormRow,
  type FormFillingSubmissionRow,
  type FormFillingWorkspaceRow,
} from "@/lib/form-filling/schema";
import { hashApiKey } from "@/lib/auth/api-key-auth";
import { db } from "@/lib/db/client";
import type { FieldType, NestedFieldDef } from "@/lib/form-filling/constants";
import { serializeNestedFields } from "@/lib/form-filling/tools";

export type FormFieldInput = {
  key: string;
  type: FieldType;
  nestedFields?: NestedFieldDef[] | null;
  sortOrder?: number;
};

export type FormWithFields = FormFillingFormRow & {
  fields: FormFillingFieldRow[];
};

export async function getWorkspaceById(workspaceId: string) {
  const rows = await db
    .select()
    .from(formFillingWorkspaces)
    .where(eq(formFillingWorkspaces.id, workspaceId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getWorkspaceByUserId(userId: string) {
  const rows = await db
    .select()
    .from(formFillingWorkspaces)
    .where(eq(formFillingWorkspaces.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** One workspace per dashboard user. Creates if missing. */
export async function ensureWorkspaceForUser(options: {
  userId: string;
}): Promise<FormFillingWorkspaceRow> {
  const existing = await getWorkspaceByUserId(options.userId);
  if (existing) return existing;

  const inserted = await db
    .insert(formFillingWorkspaces)
    .values({
      userId: options.userId,
      updatedAt: new Date(),
    })
    .returning();
  return inserted[0];
}

export async function createApiKey(options: {
  workspaceId: string;
  apiKeyPlaintext: string;
  label?: string | null;
}) {
  const inserted = await db
    .insert(formFillingApiKeys)
    .values({
      workspaceId: options.workspaceId,
      apiKeyHash: hashApiKey(options.apiKeyPlaintext),
      label: options.label?.trim() || null,
    })
    .returning();
  return inserted[0];
}

export async function listApiKeys(workspaceId: string) {
  return db
    .select({
      id: formFillingApiKeys.id,
      label: formFillingApiKeys.label,
      createdAt: formFillingApiKeys.createdAt,
    })
    .from(formFillingApiKeys)
    .where(eq(formFillingApiKeys.workspaceId, workspaceId))
    .orderBy(desc(formFillingApiKeys.createdAt));
}

export async function deleteApiKey(options: {
  apiKeyId: string;
  workspaceId: string;
}) {
  const deleted = await db
    .delete(formFillingApiKeys)
    .where(
      and(
        eq(formFillingApiKeys.id, options.apiKeyId),
        eq(formFillingApiKeys.workspaceId, options.workspaceId),
      ),
    )
    .returning({ id: formFillingApiKeys.id });
  return deleted[0] ?? null;
}

export async function listFormsWithFields(
  workspaceId: string,
): Promise<FormWithFields[]> {
  const forms = await db
    .select()
    .from(formFillingForms)
    .where(eq(formFillingForms.workspaceId, workspaceId))
    .orderBy(desc(formFillingForms.createdAt));

  if (forms.length === 0) return [];

  const formIds = forms.map((f) => f.id);
  const fields = await db
    .select()
    .from(formFillingFields)
    .where(inArray(formFillingFields.formId, formIds))
    .orderBy(asc(formFillingFields.sortOrder), asc(formFillingFields.createdAt));

  const byForm = new Map<string, FormFillingFieldRow[]>();
  for (const field of fields) {
    const list = byForm.get(field.formId) ?? [];
    list.push(field);
    byForm.set(field.formId, list);
  }

  return forms.map((form) => ({
    ...form,
    fields: byForm.get(form.id) ?? [],
  }));
}

export async function getFormWithFields(options: {
  workspaceId: string;
  formId: string;
}): Promise<FormWithFields | null> {
  const forms = await db
    .select()
    .from(formFillingForms)
    .where(
      and(
        eq(formFillingForms.id, options.formId),
        eq(formFillingForms.workspaceId, options.workspaceId),
      ),
    )
    .limit(1);
  const form = forms[0];
  if (!form) return null;

  const fields = await db
    .select()
    .from(formFillingFields)
    .where(eq(formFillingFields.formId, form.id))
    .orderBy(asc(formFillingFields.sortOrder), asc(formFillingFields.createdAt));

  return { ...form, fields };
}

export async function createForm(options: {
  workspaceId: string;
  name: string;
  description?: string | null;
  fields: FormFieldInput[];
}): Promise<FormWithFields> {
  const now = new Date();
  const inserted = await db
    .insert(formFillingForms)
    .values({
      workspaceId: options.workspaceId,
      name: options.name.trim(),
      description: options.description?.trim() || null,
      updatedAt: now,
    })
    .returning();
  const form = inserted[0];

  let fields: FormFillingFieldRow[] = [];
  if (options.fields.length > 0) {
    fields = await db
      .insert(formFillingFields)
      .values(
        options.fields.map((field, index) => ({
          formId: form.id,
          key: field.key.trim(),
          type: field.type,
          nestedFields: field.nestedFields ?? null,
          sortOrder: field.sortOrder ?? index,
        })),
      )
      .returning();
    fields.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return { ...form, fields };
}

export async function updateForm(options: {
  workspaceId: string;
  formId: string;
  name: string;
  description?: string | null;
  fields: FormFieldInput[];
}): Promise<FormWithFields | null> {
  const existing = await getFormWithFields({
    workspaceId: options.workspaceId,
    formId: options.formId,
  });
  if (!existing) return null;

  const now = new Date();
  const updatedRows = await db
    .update(formFillingForms)
    .set({
      name: options.name.trim(),
      description: options.description?.trim() || null,
      updatedAt: now,
    })
    .where(
      and(
        eq(formFillingForms.id, options.formId),
        eq(formFillingForms.workspaceId, options.workspaceId),
      ),
    )
    .returning();
  const form = updatedRows[0];
  if (!form) return null;

  await db
    .delete(formFillingFields)
    .where(eq(formFillingFields.formId, form.id));

  let fields: FormFillingFieldRow[] = [];
  if (options.fields.length > 0) {
    fields = await db
      .insert(formFillingFields)
      .values(
        options.fields.map((field, index) => ({
          formId: form.id,
          key: field.key.trim(),
          type: field.type,
          nestedFields: field.nestedFields ?? null,
          sortOrder: field.sortOrder ?? index,
        })),
      )
      .returning();
    fields.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return { ...form, fields };
}

export async function deleteForm(options: {
  workspaceId: string;
  formId: string;
}): Promise<FormFillingFormRow | null> {
  const deleted = await db
    .delete(formFillingForms)
    .where(
      and(
        eq(formFillingForms.id, options.formId),
        eq(formFillingForms.workspaceId, options.workspaceId),
      ),
    )
    .returning();
  return deleted[0] ?? null;
}

export async function getSubmission(options: {
  formId: string;
  sessionId: string;
}): Promise<FormFillingSubmissionRow | null> {
  const rows = await db
    .select()
    .from(formFillingSubmissions)
    .where(
      and(
        eq(formFillingSubmissions.formId, options.formId),
        eq(formFillingSubmissions.sessionId, options.sessionId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Most recently updated submission for a form (latest session). */
export async function getLatestSubmission(
  formId: string,
): Promise<FormFillingSubmissionRow | null> {
  const rows = await db
    .select()
    .from(formFillingSubmissions)
    .where(eq(formFillingSubmissions.formId, formId))
    .orderBy(desc(formFillingSubmissions.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Upsert submission for (formId, sessionId) and merge `data` into existing JSON.
 * Returns the full merged row plus which keys changed.
 */
export async function saveFormSubmission(options: {
  formId: string;
  sessionId: string;
  data: Record<string, unknown>;
}): Promise<{
  submission: FormFillingSubmissionRow;
  changedKeys: string[];
}> {
  const sessionId = options.sessionId.trim().slice(0, 255);
  const existing = await getSubmission({
    formId: options.formId,
    sessionId,
  });

  const changedKeys = Object.keys(options.data);
  const now = new Date();

  if (!existing) {
    const inserted = await db
      .insert(formFillingSubmissions)
      .values({
        formId: options.formId,
        sessionId,
        data: options.data,
        updatedAt: now,
      })
      .returning();
    return { submission: inserted[0], changedKeys };
  }

  const merged = { ...existing.data, ...options.data };
  const updated = await db
    .update(formFillingSubmissions)
    .set({
      data: merged,
      updatedAt: now,
    })
    .where(eq(formFillingSubmissions.id, existing.id))
    .returning();

  return { submission: updated[0], changedKeys };
}

export async function listSubmissionsForForm(options: {
  formId: string;
  limit?: number;
}) {
  return db
    .select()
    .from(formFillingSubmissions)
    .where(eq(formFillingSubmissions.formId, options.formId))
    .orderBy(desc(formFillingSubmissions.updatedAt))
    .limit(options.limit ?? 50);
}

export function serializeForm(form: FormWithFields) {
  return {
    form_id: form.id,
    name: form.name,
    description: form.description,
    created_at: form.createdAt.toISOString(),
    updated_at: form.updatedAt.toISOString(),
    fields: form.fields.map((field) => {
      const nested = serializeNestedFields(field.nestedFields);
      return {
        key: field.key,
        type: field.type,
        ...(nested ? { fields: nested } : {}),
        sort_order: field.sortOrder,
      };
    }),
  };
}
