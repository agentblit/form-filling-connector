import {
  getFormWithFields,
  getLatestSubmission,
  getSubmission,
} from "@/lib/form-filling/repo";
import {
  subscribeFormDataUpdates,
  type FormDataUpdateEvent,
} from "@/lib/form-filling/events";
import { requireWorkspaceApiKey } from "@/lib/auth/api-key-auth";
import { serializeNestedFields } from "@/lib/form-filling/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ formId: string }> };

function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * SSE stream of form field values.
 * GET /api/1.0/forms/[formId]/data
 * Optional query: session_id — stream that session only; omit for latest session.
 * Auth: X-API-Key
 */
export async function GET(request: Request, context: RouteContext) {
  let workspaceId: string;
  try {
    const auth = await requireWorkspaceApiKey(request);
    workspaceId = auth.workspace.id;
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unauthorized",
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const { formId } = await context.params;
  const sessionIdParam =
    new URL(request.url).searchParams.get("session_id")?.trim() || null;

  const form = await getFormWithFields({ workspaceId, formId });
  if (!form) {
    return new Response(JSON.stringify({ error: "Form not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fieldMeta = form.fields.map((f) => {
    const nested = serializeNestedFields(f.nestedFields);
    return {
      key: f.key,
      type: f.type,
      ...(nested ? { fields: nested } : {}),
    };
  });

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseEncode(event, data)));
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      const existing = sessionIdParam
        ? await getSubmission({ formId, sessionId: sessionIdParam })
        : await getLatestSubmission(formId);

      send("form_data", {
        form_id: formId,
        session_id: existing?.sessionId ?? sessionIdParam,
        data: existing?.data ?? {},
        updated_at: existing?.updatedAt.toISOString() ?? null,
        fields: fieldMeta,
      });

      const onUpdate = (event: FormDataUpdateEvent) => {
        if (event.formId !== formId) return;
        if (sessionIdParam && event.sessionId !== sessionIdParam) return;
        send("form_data", {
          form_id: event.formId,
          session_id: event.sessionId,
          data: event.data,
          updated_at: event.updatedAt,
          changed_keys: event.changedKeys,
        });
      };

      unsubscribe = subscribeFormDataUpdates(onUpdate);

      heartbeat = setInterval(() => {
        send("ping", { ts: Date.now() });
      }, 25_000);

      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "X-API-Key, Authorization, Content-Type",
    },
  });
}

/** CORS preflight for browser EventSource / fetch. */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "X-API-Key, Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
