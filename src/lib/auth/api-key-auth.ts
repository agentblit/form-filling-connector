import crypto from "crypto";
import { eq } from "drizzle-orm";
import {
  formFillingApiKeys,
  formFillingWorkspaces,
  type FormFillingWorkspaceRow,
} from "@/lib/form-filling/schema";
import { db } from "@/lib/db/client";

export const API_KEY_HEADER = "x-api-key";
export const API_KEY_PREFIX = "ffc_";

export function hashApiKey(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${crypto.randomBytes(24).toString("base64url")}`;
}

export function getApiKeyFromRequest(request: Request): string | null {
  const header = request.headers.get(API_KEY_HEADER)?.trim();
  if (header) return header;

  const auth = request.headers.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const bearer = auth.slice(7).trim();
    if (bearer) return bearer;
  }

  // Query param fallback for browser EventSource (cannot set headers).
  try {
    const url = new URL(request.url);
    const fromQuery =
      url.searchParams.get("api_key")?.trim() ||
      url.searchParams.get("apiKey")?.trim();
    if (fromQuery) return fromQuery;
  } catch {
    // ignore
  }

  return null;
}

export type WorkspaceApiKeyAuth = {
  workspace: FormFillingWorkspaceRow;
  apiKeyId: string;
};

export async function requireWorkspaceApiKey(
  request: Request,
): Promise<WorkspaceApiKeyAuth> {
  const raw = getApiKeyFromRequest(request);
  if (!raw) {
    throw new Error("Missing X-API-Key header");
  }
  const hash = hashApiKey(raw);
  const rows = await db
    .select({
      workspace: formFillingWorkspaces,
      apiKeyId: formFillingApiKeys.id,
    })
    .from(formFillingApiKeys)
    .innerJoin(
      formFillingWorkspaces,
      eq(formFillingApiKeys.workspaceId, formFillingWorkspaces.id),
    )
    .where(eq(formFillingApiKeys.apiKeyHash, hash))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error("Invalid API key");
  }
  return { workspace: row.workspace, apiKeyId: row.apiKeyId };
}
