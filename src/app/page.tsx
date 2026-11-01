"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { authClient } from "@/lib/auth-client";
import { FIELD_TYPES, fieldTypeHasNestedFields, isFieldType, type FieldType } from "@/lib/form-filling/constants";
import {
  ArrowLeft,
  Check,
  ClipboardList,
  Copy,
  KeyRound,
  Plus,
  Trash2,
} from "lucide-react";

type ApiKeyMeta = {
  id: string;
  label: string | null;
  createdAt: string;
};

type FormFieldView = {
  key: string;
  type: string;
  sort_order?: number;
  fields?: FormFieldView[];
};

type FormView = {
  form_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  fields: FormFieldView[];
};

type FieldDraft = {
  id: string;
  key: string;
  type: FieldType;
  fields?: FieldDraft[];
};

type FieldPayload = {
  key: string;
  type: FieldType;
  fields?: FieldPayload[];
};

type SubmissionView = {
  session_id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const buttonPrimaryClassName =
  "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

const inputClassName =
  "h-9 w-full rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none transition-shadow focus:border-ring focus:bg-card focus:ring-2 focus:ring-ring/30";

function formatKeyDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function newFieldDraft(index: number): FieldDraft {
  return {
    id: crypto.randomUUID(),
    key: `field_${index + 1}`,
    type: "string",
  };
}

const DEFAULT_CREATE_FORM = {
  name: "",
  description: "",
  fields: [] as FieldPayload[],
};

function stringifyCreateForm(payload: {
  name: string;
  description: string | null;
  fields: FieldPayload[];
}): string {
  return JSON.stringify(payload, null, 2);
}

function fieldDraftToPayload(field: FieldDraft): FieldPayload {
  const payload: FieldPayload = {
    key: field.key.trim(),
    type: field.type,
  };
  if (fieldTypeHasNestedFields(field.type) && field.fields?.length) {
    payload.fields = field.fields.map(fieldDraftToPayload);
  }
  return payload;
}

function parseFieldDraft(raw: unknown): FieldDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const field = raw as {
    key?: unknown;
    type?: unknown;
    fields?: unknown;
  };
  if (typeof field.key !== "string" || typeof field.type !== "string") {
    return null;
  }
  const type =
    field.type === "dropdown" ? "array" : field.type;
  if (!isFieldType(type)) return null;

  const draft: FieldDraft = {
    id: crypto.randomUUID(),
    key: field.key,
    type,
  };

  if (fieldTypeHasNestedFields(type)) {
    if (!Array.isArray(field.fields)) {
      draft.fields = [];
    } else {
      const nested: FieldDraft[] = [];
      for (const child of field.fields) {
        const parsed = parseFieldDraft(child);
        if (!parsed) return null;
        nested.push(parsed);
      }
      draft.fields = nested;
    }
  }

  return draft;
}

function uiFromCreatePayload(payload: {
  name?: unknown;
  description?: unknown;
  fields?: unknown;
}): {
  name: string;
  description: string;
  fields: FieldDraft[];
} | null {
  if (typeof payload.name !== "string") return null;
  if (
    payload.description != null &&
    typeof payload.description !== "string"
  ) {
    return null;
  }
  if (!Array.isArray(payload.fields)) {
    return null;
  }

  const fields: FieldDraft[] = [];
  for (const raw of payload.fields) {
    const draft = parseFieldDraft(raw);
    if (!draft) return null;
    fields.push(draft);
  }

  return {
    name: payload.name,
    description:
      typeof payload.description === "string" ? payload.description : "",
    fields,
  };
}

function formViewToDrafts(form: FormView): {
  name: string;
  description: string;
  fields: FieldDraft[];
} {
  return {
    name: form.name,
    description: form.description ?? "",
    fields: form.fields
      .map((field) => parseFieldDraft(field))
      .filter((f): f is FieldDraft => f != null),
  };
}

function NestedFieldList({
  fields,
  depth,
  onChange,
}: {
  fields: FieldDraft[];
  depth: number;
  onChange: (next: FieldDraft[]) => void;
}) {
  const label =
    depth === 0
      ? "Fields"
      : depth === 1
        ? "Nested fields"
        : `Nested fields (level ${depth})`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className={depth === 0 ? "text-sm font-semibold" : "text-xs font-medium text-muted-foreground"}>
          {label}
        </h2>
        <button
          type="button"
          onClick={() => onChange([...fields, newFieldDraft(fields.length)])}
          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" />
          Add field
        </button>
      </div>

      {fields.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {depth === 0
            ? "No fields yet. Add a field to get started."
            : "Add nested fields for this object / array item shape."}
        </p>
      ) : null}

      {fields.map((field, index) => (
        <div
          key={field.id}
          className="space-y-2 rounded-lg border border-border bg-muted/30 p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Field {index + 1}
            </span>
            <button
              type="button"
              onClick={() => onChange(fields.filter((f) => f.id !== field.id))}
              className="cursor-pointer text-xs text-destructive"
            >
              Remove
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className={inputClassName}
              value={field.key}
              onChange={(e) =>
                onChange(
                  fields.map((f) =>
                    f.id === field.id ? { ...f, key: e.target.value } : f,
                  ),
                )
              }
              placeholder="key"
            />
            <select
              className={inputClassName}
              value={field.type}
              onChange={(e) => {
                const nextType = e.target.value as FieldType;
                onChange(
                  fields.map((f) => {
                    if (f.id !== field.id) return f;
                    const next: FieldDraft = {
                      ...f,
                      type: nextType,
                    };
                    if (fieldTypeHasNestedFields(nextType)) {
                      next.fields = f.fields ?? [];
                    } else {
                      delete next.fields;
                    }
                    return next;
                  }),
                );
              }}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          {fieldTypeHasNestedFields(field.type) ? (
            <div className="ml-2 border-l border-border pl-3">
              <p className="mb-2 text-[11px] text-muted-foreground">
                {field.type === "array"
                  ? "Object shape for each array item"
                  : "Object fields"}
              </p>
              <NestedFieldList
                fields={field.fields ?? []}
                depth={depth + 1}
                onChange={(nested) =>
                  onChange(
                    fields.map((f) =>
                      f.id === field.id ? { ...f, fields: nested } : f,
                    ),
                  )
                }
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function FieldTreeView({ fields, depth = 0 }: { fields: FormFieldView[]; depth?: number }) {
  return (
    <ul className={depth === 0 ? "mt-3 divide-y divide-border" : "mt-1 space-y-1"}>
      {fields.map((field) => (
        <li
          key={`${depth}-${field.key}`}
          className={
            depth === 0
              ? "py-2 text-sm"
              : "rounded-md bg-muted/40 px-2 py-1.5 text-sm"
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-sm text-foreground">{field.key}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {field.type === "dropdown" ? "array" : field.type}
            </span>
          </div>
          {field.fields && field.fields.length > 0 ? (
            <div className="ml-3 mt-1 border-l border-border pl-3">
              <FieldTreeView fields={field.fields} depth={depth + 1} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function DashboardShell({
  email,
  onSignOut,
  children,
}: {
  email: string;
  onSignOut: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur-sm">
        <nav className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold text-foreground">
              Form Filling Connector
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden max-w-[200px] truncate text-xs text-muted-foreground sm:block">
              {email}
            </span>
            <ThemeToggle />
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              Sign out
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formParam = searchParams.get("form")?.trim() ?? "";
  const createMode = searchParams.get("create") === "1";
  const editParam = searchParams.get("edit")?.trim() ?? "";
  const isEditorMode = createMode || Boolean(editParam);

  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isAuthenticated = Boolean(session?.user);
  const signingOutRef = useRef(false);

  const onSignOut = useCallback(async () => {
    signingOutRef.current = true;
    const { data } = await authClient.signOut({ disableRedirect: true });
    if (data?.url) {
      window.location.assign(data.url);
      return;
    }
    router.replace("/login");
  }, [router]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [apiKeys, setApiKeys] = useState<ApiKeyMeta[]>([]);
  const [forms, setForms] = useState<FormView[]>([]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");

  const [createTab, setCreateTab] = useState<"ui" | "json">("ui");
  const [formName, setFormName] = useState(DEFAULT_CREATE_FORM.name);
  const [formDescription, setFormDescription] = useState(
    DEFAULT_CREATE_FORM.description,
  );
  const [fieldDrafts, setFieldDrafts] = useState<FieldDraft[]>([]);
  const [jsonDraft, setJsonDraft] = useState(() =>
    stringifyCreateForm(DEFAULT_CREATE_FORM),
  );
  const [creatingForm, setCreatingForm] = useState(false);
  const [createError, setCreateError] = useState("");

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailForm, setDetailForm] = useState<FormView | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionView[]>([]);
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [sseSnippetCopied, setSseSnippetCopied] = useState(false);

  const loadWorkspace = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/workspace", { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        workspace?: {
          apiKeys: ApiKeyMeta[];
          forms: FormView[];
        };
      };
      if (!res.ok || !json.ok || !json.workspace) {
        throw new Error(json.error ?? "Failed to load workspace");
      }
      setApiKeys(json.workspace.apiKeys);
      setForms(json.workspace.forms);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFormDetail = useCallback(async (formId: string) => {
    setDetailError("");
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/workspace/forms/${formId}`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        form?: FormView;
        submissions?: SubmissionView[];
      };
      if (!res.ok || !json.ok || !json.form) {
        throw new Error(json.error ?? "Failed to load form");
      }
      setDetailForm(json.form);
      setSubmissions(json.submissions ?? []);
    } catch (err) {
      setDetailForm(null);
      setSubmissions([]);
      setDetailError(err instanceof Error ? err.message : "Failed to load form");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionPending || signingOutRef.current) return;
    if (!isAuthenticated) {
      router.replace("/login?next=/");
      return;
    }
    void loadWorkspace();
  }, [sessionPending, isAuthenticated, router, loadWorkspace]);

  useEffect(() => {
    if (!isAuthenticated || !formParam) {
      setDetailForm(null);
      setSubmissions([]);
      return;
    }
    void loadFormDetail(formParam);
  }, [isAuthenticated, formParam, loadFormDetail]);

  useEffect(() => {
    if (!isAuthenticated || !editParam) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/workspace/forms/${editParam}`, {
          credentials: "include",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          form?: FormView;
        };
        if (!res.ok || !json.ok || !json.form) {
          throw new Error(json.error ?? "Failed to load form");
        }
        if (!cancelled) loadEditorFromForm(json.form);
      } catch (err) {
        if (!cancelled) {
          setCreateError(
            err instanceof Error ? err.message : "Failed to load form",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, editParam]);

  const publicBase = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  async function handleCreateKey() {
    setCreatingKey(true);
    setCreatedKey(null);
    setCopied(false);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newKeyLabel.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        apiKey?: string;
        apiKeyMeta?: ApiKeyMeta;
      };
      if (!res.ok || !json.ok || !json.apiKey || !json.apiKeyMeta) {
        throw new Error(json.error ?? "Failed to create API key");
      }
      setCreatedKey(json.apiKey);
      setNewKeyLabel("");
      setApiKeys((prev) => [json.apiKeyMeta!, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleDeleteKey(keyId: string) {
    if (!confirm("Delete this API key? Agents using it will stop working.")) {
      return;
    }
    try {
      const res = await fetch(`/api/api-keys/${keyId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Failed to delete");
      }
      setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
      if (createdKey) setCreatedKey(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete key");
    }
  }

  async function handleCopyKey() {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function buildPayloadFromUi() {
    return {
      name: formName.trim(),
      description: formDescription.trim() || null,
      fields: fieldDrafts.map(fieldDraftToPayload),
    };
  }

  function switchCreateTab(next: "ui" | "json") {
    if (next === createTab) return;
    setCreateError("");

    if (next === "json") {
      setJsonDraft(stringifyCreateForm(buildPayloadFromUi()));
      setCreateTab("json");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonDraft) as unknown;
    } catch {
      setCreateError("Fix invalid JSON before switching to the UI builder.");
      return;
    }

    if (!parsed || typeof parsed !== "object") {
      setCreateError("JSON must be an object before switching to the UI builder.");
      return;
    }

    const ui = uiFromCreatePayload(parsed as Record<string, unknown>);
    if (!ui) {
      setCreateError(
        "JSON must include name and fields with key/type (string|number|boolean|array|object). object and array require nested fields.",
      );
      return;
    }

    setFormName(ui.name);
    setFormDescription(ui.description);
    setFieldDrafts(ui.fields);
    setCreateTab("ui");
  }

  function resetEditor() {
    setFormName(DEFAULT_CREATE_FORM.name);
    setFormDescription(DEFAULT_CREATE_FORM.description);
    setFieldDrafts([]);
    setJsonDraft(stringifyCreateForm(DEFAULT_CREATE_FORM));
    setCreateTab("ui");
    setCreateError("");
  }

  function loadEditorFromForm(form: FormView) {
    const draft = formViewToDrafts(form);
    setFormName(draft.name);
    setFormDescription(draft.description);
    setFieldDrafts(draft.fields);
    setJsonDraft(
      stringifyCreateForm({
        name: draft.name,
        description: draft.description || null,
        fields: draft.fields.map(fieldDraftToPayload),
      }),
    );
    setCreateTab("ui");
    setCreateError("");
  }

  async function handleSaveForm() {
    setCreateError("");
    setCreatingForm(true);
    try {
      let body: unknown;
      if (createTab === "json") {
        try {
          body = JSON.parse(jsonDraft) as unknown;
        } catch {
          throw new Error("JSON is invalid");
        }
      } else {
        body = buildPayloadFromUi();
      }

      const isEdit = Boolean(editParam);
      const res = await fetch(
        isEdit ? `/api/workspace/forms/${editParam}` : "/api/workspace/forms",
        {
          method: isEdit ? "PUT" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        form?: FormView;
      };
      if (!res.ok || !json.ok || !json.form) {
        throw new Error(
          json.error ?? (isEdit ? "Failed to update form" : "Failed to create form"),
        );
      }
      if (isEdit) {
        setForms((prev) =>
          prev.map((f) => (f.form_id === json.form!.form_id ? json.form! : f)),
        );
        setDetailForm(json.form);
      } else {
        setForms((prev) => [json.form!, ...prev]);
      }
      resetEditor();
      router.push(`/?form=${json.form.form_id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setCreatingForm(false);
    }
  }

  async function handleDeleteForm(formId: string) {
    if (!confirm("Delete this form and all session data?")) return;
    setDeletingFormId(formId);
    try {
      const res = await fetch(`/api/workspace/forms/${formId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Failed to delete form");
      }
      setForms((prev) => prev.filter((f) => f.form_id !== formId));
      if (formParam === formId) {
        router.push("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete form");
    } finally {
      setDeletingFormId(null);
    }
  }

  async function handleCopySseUrl(formId: string) {
    const url = `${publicBase}/api/1.0/forms/${formId}/data`;
    await navigator.clipboard.writeText(url);
    setSseSnippetCopied(true);
    setTimeout(() => setSseSnippetCopied(false), 2000);
  }

  if (sessionPending || (isAuthenticated && loading && !isEditorMode && !formParam)) {
    return (
      <DashboardShell
        email={session?.user?.email ?? ""}
        onSignOut={() => void onSignOut()}
      >
        <p className="text-sm text-muted-foreground">Loading…</p>
      </DashboardShell>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <DashboardShell
      email={session?.user?.email ?? ""}
      onSignOut={() => void onSignOut()}
    >
      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {formParam ? (
        <section className="space-y-6">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to forms
          </button>

          {detailLoading ? (
            <p className="text-sm text-muted-foreground">Loading form…</p>
          ) : detailError ? (
            <p className="text-sm text-destructive">{detailError}</p>
          ) : detailForm ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-xl font-semibold text-foreground">
                    {detailForm.name}
                  </h1>
                  {detailForm.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {detailForm.description}
                    </p>
                  ) : null}
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    {detailForm.form_id}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/?edit=${detailForm.form_id}`)
                    }
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={deletingFormId === detailForm.form_id}
                    onClick={() => void handleDeleteForm(detailForm.form_id)}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-destructive hover:bg-muted"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">Fields</h2>
                <FieldTreeView fields={detailForm.fields} />
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground">
                    SSE endpoint
                  </h2>
                  <button
                    type="button"
                    onClick={() => void handleCopySseUrl(detailForm.form_id)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted"
                  >
                    {sseSnippetCopied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    Copy URL
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Streams form data. Omit{" "}
                  <code className="font-mono">session_id</code> for the{" "}
                  <span className="font-medium text-foreground">
                    latest session
                  </span>
                  , or pass it to follow one session. Authenticate with{" "}
                  <code className="font-mono">X-API-Key</code>.
                </p>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-code-block-bg p-3 font-mono text-xs text-code-block-foreground">
                  {`${publicBase}/api/1.0/forms/${detailForm.form_id}/data`}
                  {"\n"}
                  {`${publicBase}/api/1.0/forms/${detailForm.form_id}/data?session_id=YOUR_SESSION`}
                </pre>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">
                  Sessions ({submissions.length})
                </h2>
                {submissions.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No data saved yet. Use the{" "}
                    <code className="font-mono text-xs">saveFormData</code> tool.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {submissions.map((row) => (
                      <li
                        key={row.session_id}
                        className="rounded-lg border border-border bg-muted/40 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">{row.session_id}</span>
                          <span>{formatKeyDate(row.updated_at)}</span>
                        </div>
                        <pre className="mt-2 overflow-x-auto font-mono text-xs text-foreground">
                          {JSON.stringify(row.data, null, 2)}
                        </pre>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </section>
      ) : isEditorMode ? (
        <section className="space-y-6">
          <button
            type="button"
            onClick={() =>
              router.push(editParam ? `/?form=${editParam}` : "/")
            }
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {editParam ? "Edit form" : "Create form"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Define fields and types via the builder or paste JSON.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => switchCreateTab("ui")}
              className={`h-9 rounded-lg px-3 text-sm font-medium ${
                createTab === "ui"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              UI builder
            </button>
            <button
              type="button"
              onClick={() => switchCreateTab("json")}
              className={`h-9 rounded-lg px-3 text-sm font-medium ${
                createTab === "json"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              JSON
            </button>
          </div>

          {createTab === "ui" ? (
            <div className="space-y-4 rounded-xl border border-border bg-card p-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Name
                </label>
                <input
                  className={`${inputClassName} mt-1`}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contact form"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Description
                </label>
                <textarea
                  className="mt-1 min-h-20 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-3">
                <NestedFieldList
                  fields={fieldDrafts}
                  depth={0}
                  onChange={setFieldDrafts}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-4">
              <label className="text-xs font-medium text-muted-foreground">
                Form JSON
              </label>
              <textarea
                className="mt-2 min-h-80 w-full rounded-lg border border-border bg-code-block-bg p-3 font-mono text-xs text-code-block-foreground outline-none ring-ring focus:ring-2"
                value={jsonDraft}
                onChange={(e) => setJsonDraft(e.target.value)}
                spellCheck={false}
              />
            </div>
          )}

          {createError ? (
            <p className="text-sm text-destructive">{createError}</p>
          ) : null}

          <button
            type="button"
            className={buttonPrimaryClassName}
            disabled={creatingForm}
            onClick={() => void handleSaveForm()}
          >
            {creatingForm
              ? editParam
                ? "Saving…"
                : "Creating…"
              : editParam
                ? "Save changes"
                : "Create form"}
          </button>
        </section>
      ) : (
        <div className="space-y-8">
          <div>
            <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Define forms for agents, then connect with an API key.
            </p>
          </div>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">Forms</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Agents use{" "}
                  <code className="font-mono">getForms</code> and{" "}
                  <code className="font-mono">saveFormData</code>.
                </p>
              </div>
              <button
                type="button"
                className={buttonPrimaryClassName}
                onClick={() => router.push("/?create=1")}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                New form
              </button>
            </div>

            <div className="px-5 py-4">
              {forms.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <ClipboardList className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    No forms yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Create a form with fields and types to get started.
                  </p>
                </div>
              ) : (
                <ul className="-mx-1 divide-y divide-border">
                  {forms.map((form) => (
                    <li key={form.form_id} className="px-1">
                      <button
                        type="button"
                        onClick={() => router.push(`/?form=${form.form_id}`)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">
                            {form.name}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {form.fields.length} field
                            {form.fields.length === 1 ? "" : "s"} ·{" "}
                            {formatKeyDate(form.created_at)}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs font-medium text-primary">
                          View
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">
                  API keys
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Send as{" "}
                  <code className="font-mono">X-API-Key</code> for tools and
                  SSE.
                </p>
              </div>
              <button
                type="button"
                className={buttonPrimaryClassName}
                disabled={creatingKey}
                onClick={() => void handleCreateKey()}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {creatingKey ? "Creating…" : "Create key"}
              </button>
            </div>

            <div className="px-5 py-4">
              <div className="mb-4">
                <label
                  htmlFor="api-key-label"
                  className="mb-1.5 block text-xs font-medium text-foreground"
                >
                  Label{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <input
                  id="api-key-label"
                  className={inputClassName}
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  placeholder="e.g. AgentBlit"
                  disabled={creatingKey}
                  maxLength={100}
                />
              </div>

              {createdKey ? (
                <div className="mb-4 rounded-lg border border-border bg-muted/40 p-4">
                  <p className="text-xs font-medium text-foreground">
                    Copy this key now — it will not be shown again.
                  </p>
                  <div className="mt-2 flex items-start gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-lg bg-card px-3 py-2 font-mono text-xs text-foreground">
                      {createdKey}
                    </code>
                    <button
                      type="button"
                      onClick={() => void handleCopyKey()}
                      className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="mt-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setCreatedKey(null)}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}

              {apiKeys.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    No API keys yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Create a key to connect this connector in AgentBlit.
                  </p>
                </div>
              ) : (
                <ul className="-mx-1 divide-y divide-border">
                  {apiKeys.map((key) => (
                    <li
                      key={key.id}
                      className="flex items-center justify-between gap-3 rounded-lg px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {key.label?.trim() || "API key"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Created {formatKeyDate(key.createdAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Delete API key"
                        onClick={() => void handleDeleteKey(key.id)}
                        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}
    </DashboardShell>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
