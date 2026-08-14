CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"content_digest" text NOT NULL,
	"kind" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" bigint,
	"storage" text NOT NULL,
	"uri" text,
	"license" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifacts_digest_format" CHECK ("artifacts"."content_digest" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "benchmark_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"run_digest" text NOT NULL,
	"implementation_id" uuid NOT NULL,
	"workload_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"status" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"hardware_vendor" text NOT NULL,
	"hardware_model" text NOT NULL,
	"hardware_architecture" text NOT NULL,
	"driver_major" integer,
	"cuda_major" integer,
	"protocol_key" text NOT NULL,
	"environment_key" text NOT NULL,
	"correctness_key" text NOT NULL,
	"comparison_key" text NOT NULL,
	"primary_metric" text NOT NULL,
	"primary_value" numeric,
	"primary_unit" text,
	"sample_count" integer,
	"uncertainty_low" numeric,
	"uncertainty_high" numeric,
	"reported" boolean NOT NULL,
	"reproduced_by_kernelindex" boolean DEFAULT false NOT NULL,
	"independent_replication_count" integer DEFAULT 0 NOT NULL,
	"source_available" boolean NOT NULL,
	"installable" boolean NOT NULL,
	"license_expression" text,
	"manifest" jsonb NOT NULL,
	"supersedes_id" uuid,
	"retracted_at" timestamp with time zone,
	"retraction_reason" jsonb,
	CONSTRAINT "benchmark_runs_digest_format" CHECK ("benchmark_runs"."run_digest" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "benchmark_runs_primary_value_valid" CHECK ("benchmark_runs"."primary_value" is null or ("benchmark_runs"."primary_value" >= 0 and "benchmark_runs"."primary_value" <> 'NaN'::numeric))
);
--> statement-breakpoint
CREATE TABLE "implementations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"implementation_digest" text NOT NULL,
	"source_revision" text,
	"language" text NOT NULL,
	"framework" text,
	"target_architectures" text[] NOT NULL,
	"license_expression" text,
	"source_available" boolean NOT NULL,
	"installable" boolean NOT NULL,
	"manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"supersedes_id" uuid,
	CONSTRAINT "implementations_digest_format" CHECK ("implementations"."implementation_digest" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"run_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"statistic" text NOT NULL,
	"unit" text NOT NULL,
	"value" numeric NOT NULL,
	"sample_count" integer,
	CONSTRAINT "measurements_value_valid" CHECK ("measurements"."value" <> 'NaN'::numeric and ("measurements"."metric" <> 'latency' or "measurements"."value" >= 0))
);
--> statement-breakpoint
CREATE TABLE "operation_aliases" (
	"operation_id" uuid NOT NULL,
	"alias" text NOT NULL,
	CONSTRAINT "operation_aliases_operation_id_alias_pk" PRIMARY KEY("operation_id","alias")
);
--> statement-breakpoint
CREATE TABLE "operations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"family" text NOT NULL,
	"name" text NOT NULL,
	"schema_version" text NOT NULL,
	"semantic_digest" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"supersedes_id" uuid,
	CONSTRAINT "operations_semantic_digest_format" CHECK ("operations"."semantic_digest" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"canonical_url" text,
	"license_expression" text,
	"manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_artifacts" (
	"run_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "run_artifacts_run_id_artifact_id_role_pk" PRIMARY KEY("run_id","artifact_id","role")
);
--> statement-breakpoint
CREATE TABLE "source_links" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source_id" uuid NOT NULL,
	"entity_kind" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source_id" uuid NOT NULL,
	"locator" text NOT NULL,
	"resolved_locator" text,
	"content_digest" text NOT NULL,
	"media_type" text,
	"size_bytes" bigint,
	"body" text,
	"storage_ref" text,
	"http_metadata" jsonb,
	"parser_name" text NOT NULL,
	"parser_version" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "source_snapshots_digest_format" CHECK ("source_snapshots"."content_digest" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"policy" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workloads" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"operation_id" uuid NOT NULL,
	"workload_digest" text NOT NULL,
	"schema_version" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"shape_summary" text NOT NULL,
	"dtypes" text[] NOT NULL,
	"layout_keys" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workloads_digest_format" CHECK ("workloads"."workload_digest" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "benchmark_runs" ADD CONSTRAINT "benchmark_runs_implementation_id_implementations_id_fk" FOREIGN KEY ("implementation_id") REFERENCES "public"."implementations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_runs" ADD CONSTRAINT "benchmark_runs_workload_id_workloads_id_fk" FOREIGN KEY ("workload_id") REFERENCES "public"."workloads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_runs" ADD CONSTRAINT "benchmark_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_runs" ADD CONSTRAINT "benchmark_runs_supersedes_id_benchmark_runs_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."benchmark_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementations" ADD CONSTRAINT "implementations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementations" ADD CONSTRAINT "implementations_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementations" ADD CONSTRAINT "implementations_supersedes_id_implementations_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."implementations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_run_id_benchmark_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."benchmark_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_aliases" ADD CONSTRAINT "operation_aliases_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_supersedes_id_operations_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_run_id_benchmark_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."benchmark_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_links" ADD CONSTRAINT "source_links_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workloads" ADD CONSTRAINT "workloads_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_digest_unique" ON "artifacts" USING btree ("content_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_runs_digest_unique" ON "benchmark_runs" USING btree ("run_digest");--> statement-breakpoint
CREATE INDEX "benchmark_runs_implementation_idx" ON "benchmark_runs" USING btree ("implementation_id");--> statement-breakpoint
CREATE INDEX "benchmark_runs_workload_idx" ON "benchmark_runs" USING btree ("workload_id");--> statement-breakpoint
CREATE INDEX "benchmark_runs_source_idx" ON "benchmark_runs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "benchmark_runs_published_idx" ON "benchmark_runs" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "benchmark_runs_comparison_idx" ON "benchmark_runs" USING btree ("comparison_key","primary_metric","primary_value") WHERE "benchmark_runs"."published_at" is not null and "benchmark_runs"."status" = 'passed' and "benchmark_runs"."retracted_at" is null;--> statement-breakpoint
CREATE INDEX "benchmark_runs_hardware_idx" ON "benchmark_runs" USING btree ("hardware_architecture","hardware_model");--> statement-breakpoint
CREATE UNIQUE INDEX "implementations_digest_unique" ON "implementations" USING btree ("implementation_digest");--> statement-breakpoint
CREATE INDEX "implementations_slug_idx" ON "implementations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "implementations_operation_idx" ON "implementations" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "implementations_project_idx" ON "implementations" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "measurements_run_metric_statistic_unique" ON "measurements" USING btree ("run_id","metric","statistic");--> statement-breakpoint
CREATE INDEX "operation_aliases_alias_idx" ON "operation_aliases" USING btree ("alias");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_slug_unique" ON "operations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_semantic_digest_unique" ON "operations" USING btree ("semantic_digest");--> statement-breakpoint
CREATE INDEX "operations_family_idx" ON "operations" USING btree ("family");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_unique" ON "projects" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "projects_normalized_name_idx" ON "projects" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "source_links_identity_unique" ON "source_links" USING btree ("source_id","entity_kind","external_id");--> statement-breakpoint
CREATE INDEX "source_links_entity_idx" ON "source_links" USING btree ("entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX "source_snapshots_source_idx" ON "source_snapshots" USING btree ("source_id","fetched_at");--> statement-breakpoint
CREATE INDEX "source_snapshots_digest_idx" ON "source_snapshots" USING btree ("content_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_slug_unique" ON "sources" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "workloads_digest_unique" ON "workloads" USING btree ("workload_digest");--> statement-breakpoint
CREATE INDEX "workloads_operation_idx" ON "workloads" USING btree ("operation_id");