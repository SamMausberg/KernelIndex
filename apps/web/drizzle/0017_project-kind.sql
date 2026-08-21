ALTER TABLE "projects" ADD COLUMN "kind" text DEFAULT 'library' NOT NULL;--> statement-breakpoint
-- Backfill by importer provenance: each importer mints projects under a
-- stable slug/name convention, so existing rows classify deterministically.
-- Competition authors (GPU MODE, SOL users, FlashInfer wrapper authors) are
-- individuals; MLPerf submitters are vendors; everything else stays library.
UPDATE "projects" SET "kind" = 'individual'
  WHERE "slug" LIKE 'kernelbot-user-%' OR "slug" LIKE 'sol-user-%'
    OR ("slug" LIKE 'flashinfer-%' AND "slug" <> 'flashinfer-baseline');--> statement-breakpoint
UPDATE "projects" SET "kind" = 'vendor' WHERE "name" LIKE '% (MLPerf submitter)';
