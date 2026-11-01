import { publishFormDataUpdate } from "@/lib/form-filling/events";
import {
  getFormWithFields,
  listFormsWithFields,
  saveFormSubmission,
  serializeForm,
} from "@/lib/form-filling/repo";
import { saveFormDataArgsSchema } from "@/lib/form-filling/tools";

export type FormFillingToolCallResult = {
  content: Array<{ type: "text"; text: string }>;
};

function mcpStyleResult(data: Record<string, unknown>): FormFillingToolCallResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

export async function executeFormFillingTool(options: {
  workspaceId: string;
  toolName: string;
  args: unknown;
}): Promise<FormFillingToolCallResult> {
  const { workspaceId, toolName, args } = options;

  switch (toolName) {
    case "getForms":
      return getFormsTool({ workspaceId });
    case "saveFormData":
      return saveFormDataTool({ workspaceId, args });
    default:
      throw new Error(`Unknown Form Filling Connector tool: ${toolName}`);
  }
}

async function getFormsTool(options: {
  workspaceId: string;
}): Promise<FormFillingToolCallResult> {
  const forms = await listFormsWithFields(options.workspaceId);
  return mcpStyleResult({
    ok: true,
    count: forms.length,
    forms: forms.map(serializeForm),
  });
}

async function saveFormDataTool(options: {
  workspaceId: string;
  args: unknown;
}): Promise<FormFillingToolCallResult> {
  const parsed = saveFormDataArgsSchema.safeParse(options.args ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(issue?.message ?? "Invalid saveFormData arguments");
  }

  const form = await getFormWithFields({
    workspaceId: options.workspaceId,
    formId: parsed.data.form_id,
  });
  if (!form) {
    throw new Error("Form not found for this workspace");
  }

  const knownKeys = new Set(form.fields.map((f) => f.key));
  const unknownKeys = Object.keys(parsed.data.data).filter(
    (key) => !knownKeys.has(key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      `Unknown field key(s) for this form: ${unknownKeys.join(", ")}`,
    );
  }

  const { submission, changedKeys } = await saveFormSubmission({
    formId: form.id,
    sessionId: parsed.data.session_id,
    data: parsed.data.data,
  });

  publishFormDataUpdate({
    formId: form.id,
    sessionId: submission.sessionId,
    data: submission.data,
    updatedAt: submission.updatedAt.toISOString(),
    changedKeys,
  });

  return mcpStyleResult({
    ok: true,
    form_id: form.id,
    session_id: submission.sessionId,
    changed_keys: changedKeys,
    data: submission.data,
    updated_at: submission.updatedAt.toISOString(),
  });
}
