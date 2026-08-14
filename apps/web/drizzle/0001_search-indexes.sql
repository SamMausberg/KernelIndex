-- Search infrastructure (§10.6): weighted full-text vector on operations plus
-- trigram indexes for typo-tolerant name matching. Kept as hand-written SQL
-- because drizzle-kit does not model generated tsvector columns.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
ALTER TABLE "operations" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("family", '')), 'B') ||
  setweight(to_tsvector('english', coalesce("slug", '')), 'B')
) STORED;
--> statement-breakpoint
CREATE INDEX "operations_search_vector_idx" ON "operations" USING gin ("search_vector");
--> statement-breakpoint
CREATE INDEX "operations_name_trgm_idx" ON "operations" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "operation_aliases_trgm_idx" ON "operation_aliases" USING gin ("alias" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "projects_name_trgm_idx" ON "projects" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "implementations_slug_trgm_idx" ON "implementations" USING gin ("slug" gin_trgm_ops);
