import {
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { NestedFieldDef } from "@/lib/form-filling/constants";

export const formFillingSchema = pgSchema("form_filling");

/** One workspace per dashboard user. */
export const formFillingWorkspaces = formFillingSchema.table(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("form_filling_workspaces_user_id_uidx").on(t.userId)],
);

export const formFillingApiKeys = formFillingSchema.table(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => formFillingWorkspaces.id, { onDelete: "cascade" }),
    apiKeyHash: varchar("api_key_hash", { length: 128 }).notNull().unique(),
    label: varchar("label", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("form_filling_api_keys_workspace_id_idx").on(t.workspaceId)],
);

export const formFillingForms = formFillingSchema.table(
  "forms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => formFillingWorkspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("form_filling_forms_workspace_id_idx").on(t.workspaceId),
    index("form_filling_forms_workspace_created_idx").on(
      t.workspaceId,
      t.createdAt,
    ),
  ],
);

/**
 * Field definitions for a form.
 * For `object` / `array`, `nestedFields` holds the nested schema
 * (array = array of objects with that shape).
 */
export const formFillingFields = formFillingSchema.table(
  "fields",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    formId: uuid("form_id")
      .notNull()
      .references(() => formFillingForms.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 128 }).notNull(),
    type: varchar("type", { length: 64 }).notNull(),
    nestedFields: jsonb("nested_fields").$type<NestedFieldDef[] | null>(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("form_filling_fields_form_key_uidx").on(t.formId, t.key),
    index("form_filling_fields_form_id_idx").on(t.formId),
  ],
);

/**
 * One row per (form, session). `data` is a JSON object of field key → value.
 * saveFormData merges partial updates into this object.
 */
export const formFillingSubmissions = formFillingSchema.table(
  "submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    formId: uuid("form_id")
      .notNull()
      .references(() => formFillingForms.id, { onDelete: "cascade" }),
    sessionId: varchar("session_id", { length: 255 }).notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("form_filling_submissions_form_session_uidx").on(
      t.formId,
      t.sessionId,
    ),
    index("form_filling_submissions_form_id_idx").on(t.formId),
  ],
);

export type FormFillingWorkspaceRow = typeof formFillingWorkspaces.$inferSelect;
export type FormFillingApiKeyRow = typeof formFillingApiKeys.$inferSelect;
export type FormFillingFormRow = typeof formFillingForms.$inferSelect;
export type FormFillingFieldRow = typeof formFillingFields.$inferSelect;
export type FormFillingSubmissionRow = typeof formFillingSubmissions.$inferSelect;
