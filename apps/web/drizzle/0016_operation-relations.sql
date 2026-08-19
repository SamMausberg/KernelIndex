CREATE TABLE "operation_relations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"from_operation_id" uuid NOT NULL,
	"to_operation_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"rationale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operation_relations" ADD CONSTRAINT "operation_relations_from_operation_id_operations_id_fk" FOREIGN KEY ("from_operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_relations" ADD CONSTRAINT "operation_relations_to_operation_id_operations_id_fk" FOREIGN KEY ("to_operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operation_relations_pair_unique" ON "operation_relations" USING btree ("from_operation_id","to_operation_id");--> statement-breakpoint
-- Editorial family harmonization (§8.2: family is navigation metadata, not
-- identity — spec.family inside the manifests keeps each source's original
-- value). SOL and FlashInfer-Bench name the same families differently, which
-- split equivalent definitions across browse groups.
UPDATE "operations" SET "family" = CASE "family"
  WHEN 'normalization' THEN 'rmsnorm'
  WHEN 'gqa-paged' THEN 'gqa-paged-attention'
  WHEN 'gqa-ragged' THEN 'gqa-ragged-attention'
  WHEN 'mla-paged' THEN 'mla-paged-attention'
  ELSE "family" END
  WHERE "family" IN ('normalization', 'gqa-paged', 'gqa-ragged', 'mla-paged');