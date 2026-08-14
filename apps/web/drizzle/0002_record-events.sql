CREATE TABLE "record_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"comparison_key" text NOT NULL,
	"run_id" uuid NOT NULL,
	"previous_run_id" uuid,
	"policy_version" text NOT NULL,
	"cause" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "record_events" ADD CONSTRAINT "record_events_run_id_benchmark_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."benchmark_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_events" ADD CONSTRAINT "record_events_previous_run_id_benchmark_runs_id_fk" FOREIGN KEY ("previous_run_id") REFERENCES "public"."benchmark_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "record_events_cohort_run_unique" ON "record_events" USING btree ("comparison_key","run_id");--> statement-breakpoint
CREATE INDEX "record_events_cohort_idx" ON "record_events" USING btree ("comparison_key","at");