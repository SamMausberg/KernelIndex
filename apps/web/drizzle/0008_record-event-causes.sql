DROP INDEX "record_events_cohort_run_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "record_events_cohort_run_cause_unique" ON "record_events" USING btree ("comparison_key","run_id","cause");