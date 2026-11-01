import { NextResponse } from "next/server";
import { toOpenAiToolsList } from "@/lib/form-filling/tools";
import { requireWorkspaceApiKey } from "@/lib/auth/api-key-auth";

export async function GET(request: Request) {
  try {
    await requireWorkspaceApiKey(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
  return NextResponse.json(toOpenAiToolsList());
}
