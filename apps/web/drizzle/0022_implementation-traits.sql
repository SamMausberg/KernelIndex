CREATE TABLE "implementation_traits" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"implementation_id" uuid NOT NULL,
	"trait" text NOT NULL,
	"value" text,
	"evidence" text NOT NULL,
	"extractor_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "implementation_traits" ADD CONSTRAINT "implementation_traits_implementation_id_implementations_id_fk" FOREIGN KEY ("implementation_id") REFERENCES "public"."implementations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "implementation_traits_unique" ON "implementation_traits" USING btree ("implementation_id","trait","extractor_version");--> statement-breakpoint
CREATE INDEX "implementation_traits_trait_idx" ON "implementation_traits" USING btree ("trait","extractor_version");
