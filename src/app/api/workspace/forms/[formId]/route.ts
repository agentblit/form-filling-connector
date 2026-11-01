import { NextResponse } from "next/server";
import {
  deleteForm,
  ensureWorkspaceForUser,
  getFormWithFields,
  listSubmissionsForForm,
  serializeForm,
  updateForm,
} from "@/lib/form-filling/repo";
import {
  assertUniqueFieldKeys,
  normalizeFormFields,
  updateFormBodySchema,
} from "@/lib/form-filling/tools";
import { requireDashboardAuth } from "@/lib/auth/require-dashboard-auth";

type RouteContext = { params: Promise<{ formId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { formId } = await context.params;
  const auth = await requireDashboardAuth(request);
  if (!auth.ok) return auth.response;

  const workspace = await ensureWorkspaceForUser({ userId: auth.userId });
  const form = await getFormWithFields({
    workspaceId: workspace.id,
    formId,
  });
  if (!form) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const submissions = await listSubmissionsForForm({ formId: form.id });
  return NextResponse.json({
    ok: true,
    form: serializeForm(form),
    submissions: submissions.map((row) => ({
      session_id: row.sessionId,
      data: row.data,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    })),
  });
}

export async function PUT(request: Request, context: RouteContext) {
  const { formId } = await context.params;
  const auth = await requireDashboardAuth(request);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = updateFormBodySchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { ok: false, error: issue?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const uniqueError = assertUniqueFieldKeys(parsed.data.fields);
  if (uniqueError) {
    return NextResponse.json({ ok: false, error: uniqueError }, { status: 400 });
  }

  const workspace = await ensureWorkspaceForUser({ userId: auth.userId });
  const form = await updateForm({
    workspaceId: workspace.id,
    formId,
    name: parsed.data.name,
    description: parsed.data.description,
    fields: normalizeFormFields(parsed.data.fields),
  });
  if (!form) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, form: serializeForm(form) });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { formId } = await context.params;
  const auth = await requireDashboardAuth(request);
  if (!auth.ok) return auth.response;

  const workspace = await ensureWorkspaceForUser({ userId: auth.userId });
  const deleted = await deleteForm({
    workspaceId: workspace.id,
    formId,
  });
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
