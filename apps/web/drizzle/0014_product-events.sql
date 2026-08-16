CREATE TABLE "product_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event" text NOT NULL,
	"facets" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "product_events_event_idx" ON "product_events" USING btree ("event","created_at");