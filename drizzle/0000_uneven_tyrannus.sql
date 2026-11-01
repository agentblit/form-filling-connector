CREATE SCHEMA "form_filling";
--> statement-breakpoint
CREATE TABLE "form_filling"."api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"api_key_hash" varchar(128) NOT NULL,
	"label" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
CREATE TABLE "form_filling"."fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"key" varchar(128) NOT NULL,
	"label" varchar(255) NOT NULL,
	"type" varchar(64) NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"options" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_filling"."forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_filling"."submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_filling"."workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "form_filling"."api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "form_filling"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_filling"."fields" ADD CONSTRAINT "fields_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "form_filling"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_filling"."forms" ADD CONSTRAINT "forms_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "form_filling"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_filling"."submissions" ADD CONSTRAINT "submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "form_filling"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_filling_api_keys_workspace_id_idx" ON "form_filling"."api_keys" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_filling_fields_form_key_uidx" ON "form_filling"."fields" USING btree ("form_id","key");--> statement-breakpoint
CREATE INDEX "form_filling_fields_form_id_idx" ON "form_filling"."fields" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "form_filling_forms_workspace_id_idx" ON "form_filling"."forms" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "form_filling_forms_workspace_created_idx" ON "form_filling"."forms" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "form_filling_submissions_form_session_uidx" ON "form_filling"."submissions" USING btree ("form_id","session_id");--> statement-breakpoint
CREATE INDEX "form_filling_submissions_form_id_idx" ON "form_filling"."submissions" USING btree ("form_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_filling_workspaces_user_id_uidx" ON "form_filling"."workspaces" USING btree ("user_id");