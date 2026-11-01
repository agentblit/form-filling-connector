UPDATE "form_filling"."fields" SET "type" = 'array' WHERE "type" = 'dropdown';--> statement-breakpoint
ALTER TABLE "form_filling"."fields" DROP COLUMN "options";
