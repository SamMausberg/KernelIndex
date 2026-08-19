ALTER TABLE "benchmark_runs" ADD COLUMN "sol_score" numeric;--> statement-breakpoint
ALTER TABLE "implementations" ADD COLUMN "role" text;--> statement-breakpoint
-- Backfill the projections from stored manifests (hand-written; the write
-- path populates them for all future publications).
UPDATE "benchmark_runs" SET
  "sol_score" = (manifest #>> '{run,spec,sourceNative,metrics,sol_score}')::numeric
  WHERE manifest #>> '{run,spec,sourceNative,metrics,sol_score}' IS NOT NULL;--> statement-breakpoint
-- Runs imported before the importer hardware maps learned these products
-- carry an 'unknown' architecture placeholder; the product names are exact.
UPDATE "benchmark_runs" SET "hardware_architecture" = CASE
  WHEN "hardware_model" LIKE 'NVIDIA B200%' OR "hardware_model" = 'NVIDIA GB200' THEN 'sm_100'
  WHEN "hardware_model" IN ('NVIDIA H100', 'NVIDIA H200') THEN 'sm_90'
  WHEN "hardware_model" = 'NVIDIA A100' THEN 'sm_80'
  WHEN "hardware_model" = 'NVIDIA L4' THEN 'sm_89'
  WHEN "hardware_model" = 'NVIDIA GeForce RTX 3090' THEN 'sm_86'
  WHEN "hardware_model" = 'AMD Instinct MI300X' THEN 'gfx942'
  WHEN "hardware_model" = 'AMD Instinct MI355X' THEN 'gfx950'
  ELSE "hardware_architecture" END
  WHERE "hardware_architecture" = 'unknown';--> statement-breakpoint
-- Rows imported before metadata.labels.role existed: FlashInfer-Bench ships
-- baseline solutions only, and the Liger import's eager reference modules
-- (PyTorch, Transformers) are its comparison baselines. torch.compile stays
-- a competitor.
UPDATE "implementations" SET "role" = coalesce(
  manifest #>> '{metadata,labels,role}',
  CASE WHEN project_id IN (
    SELECT id FROM projects WHERE slug = 'flashinfer-baseline'
  ) OR (
    project_id IN (SELECT id FROM projects WHERE slug IN ('pytorch', 'transformers'))
    AND title NOT LIKE '%torch.compile%'
  ) THEN 'baseline' END
);