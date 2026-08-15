ALTER TABLE "benchmark_runs" ADD COLUMN "primary_statistic" text;--> statement-breakpoint
ALTER TABLE "benchmark_runs" ADD COLUMN "has_raw_evidence" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "benchmark_runs" ADD COLUMN "source_native" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "benchmark_runs" ADD COLUMN "environment_summary" text;--> statement-breakpoint
ALTER TABLE "implementations" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "implementations" ADD COLUMN "install_kind" text;--> statement-breakpoint
ALTER TABLE "implementations" ADD COLUMN "install_command" text;--> statement-breakpoint
ALTER TABLE "implementations" ADD COLUMN "license_declared" text;--> statement-breakpoint
-- Backfill the projections from the stored manifests (hand-written; the
-- write path populates them for all future publications).
UPDATE "benchmark_runs" SET
  "primary_statistic" = coalesce(
    manifest #>> '{run,spec,timing,primaryStatistic}',
    manifest #>> '{run,spec,measurements,0,statistic}'
  ),
  "has_raw_evidence" = (manifest #> '{run,spec,timing,rawSamples}') IS NOT NULL
    OR (manifest #> '{run,spec,evidence,rawSamples}') IS NOT NULL
    OR (manifest #> '{run,spec,evidence,logs}') IS NOT NULL,
  "source_native" = (manifest #> '{run,spec,sourceNative}') IS NOT NULL,
  "environment_summary" = concat_ws(' · ',
    'CUDA ' || (manifest #>> '{environment,spec,software,cudaToolkit}'),
    (manifest #>> '{environment,spec,software,framework,name}') || ' '
      || (manifest #>> '{environment,spec,software,framework,version}'),
    manifest #>> '{protocol,spec,harness,name}');--> statement-breakpoint
UPDATE "implementations" SET
  "title" = manifest #>> '{metadata,title}',
  "install_kind" = manifest #>> '{spec,buildVariants,0,install,kind}',
  "install_command" = manifest #>> '{spec,buildVariants,0,install,command}',
  "license_declared" = manifest #>> '{spec,licensing,declared}';