ALTER TABLE "operations" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX "operations_tags_idx" ON "operations" USING gin ("tags");