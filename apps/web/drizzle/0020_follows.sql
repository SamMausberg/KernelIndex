ALTER TABLE "watches" RENAME TO "follows";--> statement-breakpoint
ALTER TABLE "follows" RENAME COLUMN "comparison_key" TO "key";--> statement-breakpoint
ALTER TABLE "follows" ADD COLUMN "kind" text DEFAULT 'cohort' NOT NULL;--> statement-breakpoint
ALTER TABLE "follows" ADD COLUMN "label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "follows" ADD COLUMN "href" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "follows" ALTER COLUMN "kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "follows" ALTER COLUMN "label" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "follows" ALTER COLUMN "href" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "follows" DROP CONSTRAINT "watches_user_id_comparison_key_pk";--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_user_id_kind_key_pk" PRIMARY KEY("user_id","kind","key");--> statement-breakpoint
ALTER TABLE "follows" RENAME CONSTRAINT "watches_user_id_users_id_fk" TO "follows_user_id_users_id_fk";--> statement-breakpoint
-- Existing cohort watches keep working as cohort follows: label and page
-- from the cohort's operation, the join the account page used to make.
UPDATE "follows" f
  SET "label" = sub."name" || ' · ' || sub."hardware_model",
      "href" = '/operations/' || sub."slug" || '?workload=' || sub."workload_id"
        || '&cohort=' || f."key"
  FROM (
    SELECT DISTINCT ON (r."comparison_key")
      r."comparison_key", r."hardware_model", r."workload_id", o."name", o."slug"
    FROM "benchmark_runs" r
    JOIN "workloads" w ON w."id" = r."workload_id"
    JOIN "operations" o ON o."id" = w."operation_id"
  ) sub
  WHERE f."kind" = 'cohort' AND sub."comparison_key" = f."key";
