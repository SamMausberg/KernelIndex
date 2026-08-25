ALTER TABLE "benchmark_runs" ADD COLUMN "package_version" text;--> statement-breakpoint
-- Settle the new column from the manifests already published: the measured
-- package version rides run metadata labels (`package_version`, with the
-- Liger import's original `liger_version` as the legacy spelling).
UPDATE "benchmark_runs"
SET "package_version" = COALESCE(
  "manifest" #>> '{run,metadata,labels,package_version}',
  "manifest" #>> '{run,metadata,labels,liger_version}'
)
WHERE COALESCE(
  "manifest" #>> '{run,metadata,labels,package_version}',
  "manifest" #>> '{run,metadata,labels,liger_version}'
) IS NOT NULL;
