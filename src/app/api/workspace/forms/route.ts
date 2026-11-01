import { NextResponse } from "next/server";
import {
  createForm,
  ensureWorkspaceForUser,
  serializeForm,
} from "@/lib/form-filling/repo";
import {
  assertUniqueFieldKeys,
  createFormBodySchema,
  normalizeFormFields,
} from "@/lib/form-filling/tools";
import { requireDashboardAuth } from "@/lib/auth/require-dashboard-auth";

export async function POST(request: Request) {
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

  const parsed = createFormBodySchema.safeParse(json);
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
  const form = await createForm({
    workspaceId: workspace.id,
    name: parsed.data.name,
    description: parsed.data.description,
    fields: normalizeFormFields(parsed.data.fields),
  });

  return NextResponse.json({ ok: true, form: serializeForm(form) });
}
