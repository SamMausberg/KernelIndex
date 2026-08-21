-- Some MLPerf submitters leave the Software field as filler ('TODO', empty).
-- A placeholder must never be a display name: fall back to the submitter,
-- mirroring the importer's rule. Identity (digest, revision) is untouched.
UPDATE "serving_stack_revisions" s
  SET "name" = replace(p."name", ' (MLPerf submitter)', '')
    || ' submission (software not stated)'
  FROM "projects" p
  WHERE p."id" = s."project_id"
    AND (length(trim(s."name")) < 3
      OR lower(trim(s."name")) IN ('todo', 'n/a', 'tbd', 'none'));
