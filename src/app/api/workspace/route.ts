import { NextResponse } from "next/server";
import {
  ensureWorkspaceForUser,
  listApiKeys,
  listFormsWithFields,
  serializeForm,
} from "@/lib/form-filling/repo";
import { requireDashboardAuth } from "@/lib/auth/require-dashboard-auth";

export async function GET(request: Request) {
  const auth = await requireDashboardAuth(request);
  if (!auth.ok) return auth.response;

  const workspace = await ensureWorkspaceForUser({ userId: auth.userId });
  const [apiKeys, forms] = await Promise.all([
    listApiKeys(workspace.id),
    listFormsWithFields(workspace.id),
  ]);

  return NextResponse.json({
    ok: true,
    workspace: {
      id: workspace.id,
      apiKeys: apiKeys.map((key) => ({
        id: key.id,
        label: key.label,
        createdAt: key.createdAt.toISOString(),
      })),
      forms: forms.map(serializeForm),
    },
  });
}
