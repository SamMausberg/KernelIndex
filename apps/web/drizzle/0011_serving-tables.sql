CREATE TABLE "model_revisions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"model_digest" text NOT NULL,
	"name" text NOT NULL,
	"parameter_count" bigint,
	"context_length" integer,
	"tokenizer" text,
	"license" text,
	"schema_version" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_revisions_digest_format" CHECK ("model_revisions"."model_digest" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "serving_configurations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"stack_revision_id" uuid NOT NULL,
	"configuration_digest" text NOT NULL,
	"dtype" text,
	"quantization" text,
	"tensor_parallel" integer,
	"summary" text NOT NULL,
	"schema_version" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "serving_configurations_digest_format" CHECK ("serving_configurations"."configuration_digest" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "serving_measurements" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"run_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"statistic" text NOT NULL,
	"unit" text NOT NULL,
	"value" numeric NOT NULL,
	"sample_count" integer,
	CONSTRAINT "serving_measurements_value_valid" CHECK ("serving_measurements"."value" <> 'NaN'::numeric)
);
--> statement-breakpoint
CREATE TABLE "serving_run_artifacts" (
	"run_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "serving_run_artifacts_run_id_artifact_id_role_pk" PRIMARY KEY("run_id","artifact_id","role")
);
--> statement-breakpoint
CREATE TABLE "serving_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"run_digest" text NOT NULL,
	"model_revision_id" uuid NOT NULL,
	"configuration_id" uuid NOT NULL,
	"workload_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"status" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"cohort_key" text NOT NULL,
	"protocol_key" text NOT NULL,
	"quality_policy" text NOT NULL,
	"metric_set_key" text NOT NULL,
	"scenario" text NOT NULL,
	"accelerator_vendor" text,
	"accelerator_model" text NOT NULL,
	"accelerator_count" integer NOT NULL,
	"node_count" integer DEFAULT 1 NOT NULL,
	"total_accelerators" integer NOT NULL,
	"reported" boolean DEFAULT true NOT NULL,
	"schema_version" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"supersedes_id" uuid,
	"retracted_at" timestamp with time zone,
	"retraction_reason" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "serving_runs_digest_format" CHECK ("serving_runs"."run_digest" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "serving_runs_cohort_format" CHECK ("serving_runs"."cohort_key" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "serving_stack_revisions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"stack_digest" text NOT NULL,
	"name" text NOT NULL,
	"version" text,
	"schema_version" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "serving_stack_revisions_digest_format" CHECK ("serving_stack_revisions"."stack_digest" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "serving_workloads" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workload_digest" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"streaming" boolean NOT NULL,
	"load_generation" text NOT NULL,
	"schema_version" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "serving_workloads_digest_format" CHECK ("serving_workloads"."workload_digest" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "serving_configurations" ADD CONSTRAINT "serving_configurations_stack_revision_id_serving_stack_revisions_id_fk" FOREIGN KEY ("stack_revision_id") REFERENCES "public"."serving_stack_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serving_measurements" ADD CONSTRAINT "serving_measurements_run_id_serving_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."serving_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serving_run_artifacts" ADD CONSTRAINT "serving_run_artifacts_run_id_serving_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."serving_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serving_run_artifacts" ADD CONSTRAINT "serving_run_artifacts_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serving_runs" ADD CONSTRAINT "serving_runs_model_revision_id_model_revisions_id_fk" FOREIGN KEY ("model_revision_id") REFERENCES "public"."model_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serving_runs" ADD CONSTRAINT "serving_runs_configuration_id_serving_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."serving_configurations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serving_runs" ADD CONSTRAINT "serving_runs_workload_id_serving_workloads_id_fk" FOREIGN KEY ("workload_id") REFERENCES "public"."serving_workloads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serving_runs" ADD CONSTRAINT "serving_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serving_runs" ADD CONSTRAINT "serving_runs_supersedes_id_serving_runs_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."serving_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serving_stack_revisions" ADD CONSTRAINT "serving_stack_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_revisions_digest_unique" ON "model_revisions" USING btree ("model_digest");--> statement-breakpoint
CREATE INDEX "model_revisions_slug_idx" ON "model_revisions" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "serving_configurations_digest_unique" ON "serving_configurations" USING btree ("configuration_digest");--> statement-breakpoint
CREATE INDEX "serving_configurations_stack_idx" ON "serving_configurations" USING btree ("stack_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "serving_measurements_run_metric_statistic_unique" ON "serving_measurements" USING btree ("run_id","metric","statistic");--> statement-breakpoint
CREATE UNIQUE INDEX "serving_runs_digest_unique" ON "serving_runs" USING btree ("run_digest");--> statement-breakpoint
CREATE INDEX "serving_runs_model_idx" ON "serving_runs" USING btree ("model_revision_id");--> statement-breakpoint
CREATE INDEX "serving_runs_configuration_idx" ON "serving_runs" USING btree ("configuration_id");--> statement-breakpoint
CREATE INDEX "serving_runs_workload_idx" ON "serving_runs" USING btree ("workload_id");--> statement-breakpoint
CREATE INDEX "serving_runs_cohort_idx" ON "serving_runs" USING btree ("cohort_key") WHERE "serving_runs"."published_at" is not null and "serving_runs"."status" = 'valid' and "serving_runs"."retracted_at" is null;--> statement-breakpoint
CREATE INDEX "serving_runs_hardware_idx" ON "serving_runs" USING btree ("accelerator_model","total_accelerators") WHERE "serving_runs"."published_at" is not null and "serving_runs"."status" = 'valid' and "serving_runs"."retracted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "serving_stack_revisions_digest_unique" ON "serving_stack_revisions" USING btree ("stack_digest");--> statement-breakpoint
CREATE INDEX "serving_stack_revisions_project_idx" ON "serving_stack_revisions" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "serving_workloads_digest_unique" ON "serving_workloads" USING btree ("workload_digest");--> statement-breakpoint
CREATE INDEX "serving_workloads_slug_idx" ON "serving_workloads" USING btree ("slug");