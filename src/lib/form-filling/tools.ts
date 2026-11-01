import { z } from "zod";
import {
  FIELD_TYPES,
  fieldTypeHasNestedFields,
  type FieldType,
  type NestedFieldDef,
} from "@/lib/form-filling/constants";

/** Matches AgentBlit `ToolPermissionMode` wire values. */
export enum ToolPermissionMode {
  AlwaysAllow = "always_allow",
  NeedsApproval = "needs_approval",
  Blocked = "blocked",
}

export type Tool = {
  name: string;
  description: string;
  parameters: object;
  permissionMode: ToolPermissionMode;
};

const allow = ToolPermissionMode.AlwaysAllow;

export const FORM_FILLING_CONNECTOR_KEY = "form_filling";

export const getFormsArgsSchema = z.object({}).strict().optional();

export const saveFormDataArgsSchema = z.object({
  form_id: z.string().uuid("form_id must be a valid UUID"),
  session_id: z
    .string()
    .trim()
    .min(1, "session_id is required")
    .max(255, "session_id is too long"),
  data: z
    .record(z.string(), z.unknown())
    .refine((obj) => Object.keys(obj).length > 0, {
      message: "data must include at least one field",
    }),
});

const fieldKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_]*$/,
    "key must start with a letter and contain only letters, numbers, underscores",
  );

type FormFieldBodyInput = {
  key: string;
  type: FieldType;
  fields?: FormFieldBodyInput[];
};

export const formFieldSchema: z.ZodType<FormFieldBodyInput> = z.lazy(() =>
  z
    .object({
      key: fieldKeySchema,
      type: z.enum(FIELD_TYPES),
      fields: z.array(formFieldSchema).optional(),
    })
    .superRefine((field, ctx) => {
      if (fieldTypeHasNestedFields(field.type)) {
        if (!field.fields || field.fields.length === 0) {
          ctx.addIssue({
            code: "custom",
            message:
              field.type === "array"
                ? `Field "${field.key}" of type array requires nested fields (object array item shape)`
                : `Field "${field.key}" of type object requires nested fields`,
            path: ["fields"],
          });
          return;
        }
        const nestedErr = assertUniqueFieldKeys(field.fields);
        if (nestedErr) {
          ctx.addIssue({
            code: "custom",
            message: nestedErr,
            path: ["fields"],
          });
        }
      } else if (field.fields && field.fields.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: `Field "${field.key}" of type ${field.type} cannot have nested fields`,
          path: ["fields"],
        });
      }
    }),
);

export const createFormBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional().nullable(),
  fields: z.array(formFieldSchema).min(1, "At least one field is required"),
});

export const updateFormBodySchema = createFormBodySchema;

export type FormFieldBody = FormFieldBodyInput;

function toNestedFieldDef(field: FormFieldBody): NestedFieldDef {
  const base: NestedFieldDef = {
    key: field.key,
    type: field.type,
  };
  if (fieldTypeHasNestedFields(field.type) && field.fields?.length) {
    base.fields = field.fields.map(toNestedFieldDef);
  }
  return base;
}

export function normalizeFormFields(
  fields: FormFieldBody[],
): Array<{
  key: string;
  type: FieldType;
  nestedFields: NestedFieldDef[] | null;
  sortOrder: number;
}> {
  return fields.map((field, index) => ({
    key: field.key,
    type: field.type,
    nestedFields: fieldTypeHasNestedFields(field.type)
      ? (field.fields ?? []).map(toNestedFieldDef)
      : null,
    sortOrder: index,
  }));
}

export function assertUniqueFieldKeys(
  fields: Array<{ key: string }>,
): string | null {
  const keys = fields.map((f) => f.key);
  if (new Set(keys).size !== keys.length) {
    return "Field keys must be unique";
  }
  return null;
}

export function serializeNestedFields(
  nested: NestedFieldDef[] | null | undefined,
): NestedFieldDef[] | undefined {
  if (!nested || nested.length === 0) return undefined;
  return nested.map((field) => {
    const out: NestedFieldDef = { key: field.key, type: field.type };
    const children = serializeNestedFields(field.fields);
    if (children) out.fields = children;
    return out;
  });
}

export const FORM_FILLING_TOOLS: Tool[] = [
  {
    name: "getForms",
    description:
      "List all forms in this workspace, including each field's key and type. object fields include nested fields; array fields include nested fields describing each object item.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    permissionMode: allow,
  },
  {
    name: "saveFormData",
    description:
      "Save or update form field values for a session. Pass form_id, session_id, and a data object of field keys to values. Supports single-field or multi-field updates; values are merged into the session row. Use booleans for boolean fields, objects for object fields, and arrays of objects for array fields. For session_id, use the exact Session id from the system prompt — never invent placeholders like \"default\".",
    parameters: {
      type: "object",
      properties: {
        form_id: {
          type: "string",
          description: "UUID of the form returned by getForms",
        },
        session_id: {
          type: "string",
          description:
            "Must match the Session id from the system prompt (same id as the host page / embed). Each session_id gets its own submission row — do not use placeholders like \"default\".",
        },
        data: {
          type: "object",
          description:
            "Object of field key → value. May contain one or many fields. Existing keys not listed are left unchanged.",
          additionalProperties: true,
        },
      },
      required: ["form_id", "session_id", "data"],
    },
    permissionMode: allow,
  },
];

/** OpenAI tools/list shape including `permission_mode`. */
export function toOpenAiToolsList() {
  return {
    tools: FORM_FILLING_TOOLS.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
      permission_mode: tool.permissionMode,
    })),
  };
}
