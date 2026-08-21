-- Serving stacks published before metadata.title existed display their kebab
-- manifest name. The revision string (the MLPerf Software field) is the human
-- name; adopt it wherever it is stated. Idempotent.
UPDATE "serving_stack_revisions"
  SET "name" = "manifest"#>>'{spec,revision,version}'
  WHERE "manifest"#>>'{spec,revision,version}' IS NOT NULL;
