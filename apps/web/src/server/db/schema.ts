// The twelve-table public catalog (§10.1–10.6). Typed columns carry
// identity, joins, filters, and ranking projections; the complete canonical
// manifest lives in JSONB. Canonical rows are append-only after publication:
// corrections supersede via supersedes_id, never update in place (§10.7).
import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

const uuidv7 = sql`uuidv7()`
const now = sql`now()`

const id = () => uuid("id").primaryKey().default(uuidv7)
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().default(now)
const digestCheck = (name: string, column: AnyPgColumn) =>
  check(name, sql`${column} ~ '^sha256:[0-9a-f]{64}$'`)

/** Versioned operation semantics and family (§8.2–8.3). */
export const operations = pgTable(
  "operations",
  {
    id: id(),
    slug: text("slug").notNull(),
    family: text("family").notNull(),
    name: text("name").notNull(),
    schemaVersion: text("schema_version").notNull(),
    semanticDigest: text("semantic_digest").notNull(),
    manifest: jsonb("manifest").notNull(),
    /* Editorial taxonomy tags (§8.2): source families plus model:<slug>
       workload provenance. Mutable metadata — never part of the digest. */
    tags: text("tags").array().notNull().default([]),
    createdAt: createdAt(),
    supersedesId: uuid("supersedes_id").references(
      (): AnyPgColumn => operations.id,
    ),
  },
  (t) => [
    uniqueIndex("operations_slug_unique").on(t.slug),
    uniqueIndex("operations_semantic_digest_unique").on(t.semanticDigest),
    index("operations_family_idx").on(t.family),
    index("operations_tags_idx").using("gin", t.tags),
    digestCheck("operations_semantic_digest_format", t.semanticDigest),
  ],
)

/** Source and human aliases; names are aliases, never identity (§2.2). */
export const operationAliases = pgTable(
  "operation_aliases",
  {
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operations.id),
    alias: text("alias").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.operationId, t.alias] }),
    index("operation_aliases_alias_idx").on(t.alias),
  ],
)

/**
 * Reviewed cross-source operation relations (§8.4). Only reviewed rows exist
 * — never inferred at read time — and a relation never merges cohorts: it
 * lets surfaces present one computation's separately-imported definitions
 * (and their separate cohorts) together. Pairs are stored once, ordered by
 * slug, with the review rationale.
 */
export const operationRelations = pgTable(
  "operation_relations",
  {
    id: id(),
    fromOperationId: uuid("from_operation_id")
      .notNull()
      .references(() => operations.id),
    toOperationId: uuid("to_operation_id")
      .notNull()
      .references(() => operations.id),
    relation: text("relation").notNull(),
    rationale: text("rationale").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("operation_relations_pair_unique").on(
      t.fromOperationId,
      t.toOperationId,
    ),
  ],
)

/** Concrete axis/input/tolerance binding for an operation (§8.5). */
export const workloads = pgTable(
  "workloads",
  {
    id: id(),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operations.id),
    workloadDigest: text("workload_digest").notNull(),
    schemaVersion: text("schema_version").notNull(),
    manifest: jsonb("manifest").notNull(),
    shapeSummary: text("shape_summary").notNull(),
    dtypes: text("dtypes").array().notNull(),
    layoutKeys: text("layout_keys").array().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("workloads_digest_unique").on(t.workloadDigest),
    index("workloads_operation_idx").on(t.operationId),
    digestCheck("workloads_digest_format", t.workloadDigest),
  ],
)

/** Upstream software project or library (§8.6). */
export const projects = pgTable(
  "projects",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    canonicalUrl: text("canonical_url"),
    licenseExpression: text("license_expression"),
    /** Taxonomy species (§8.6): 'library' (a real software project),
     * 'individual' (a competition author), or 'vendor' (a benchmark
     * submitter). Importers declare it in the project manifest; the
     * projects surface groups by it instead of mixing all three. */
    kind: text("kind").notNull().default("library"),
    manifest: jsonb("manifest").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("projects_slug_unique").on(t.slug),
    index("projects_normalized_name_idx").on(t.normalizedName),
  ],
)

/** Immutable implementation revision and usable build metadata (§8.7). */
export const implementations = pgTable(
  "implementations",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operations.id),
    slug: text("slug").notNull(),
    implementationDigest: text("implementation_digest").notNull(),
    sourceRevision: text("source_revision"),
    language: text("language").notNull(),
    framework: text("framework"),
    targetArchitectures: text("target_architectures").array().notNull(),
    licenseExpression: text("license_expression"),
    sourceAvailable: boolean("source_available").notNull(),
    installable: boolean("installable").notNull(),
    /* Read-path projections of the manifest so list surfaces never load
       JSONB: display title, first build variant's install, declared license. */
    title: text("title"),
    installKind: text("install_kind"),
    installCommand: text("install_command"),
    licenseDeclared: text("license_declared"),
    /* 'baseline' when the source designates this implementation as its
       reference solution (metadata.labels.role); null for competitors. */
    role: text("role"),
    manifest: jsonb("manifest").notNull(),
    createdAt: createdAt(),
    supersedesId: uuid("supersedes_id").references(
      (): AnyPgColumn => implementations.id,
    ),
  },
  (t) => [
    uniqueIndex("implementations_digest_unique").on(t.implementationDigest),
    index("implementations_slug_idx").on(t.slug),
    index("implementations_operation_idx").on(t.operationId),
    index("implementations_project_idx").on(t.projectId),
    digestCheck("implementations_digest_format", t.implementationDigest),
  ],
)

/** Source system and ingestion policy (§14.10). */
export const sources = pgTable(
  "sources",
  {
    id: id(),
    slug: text("slug").notNull(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    policy: jsonb("policy"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sources_slug_unique").on(t.slug)],
)

/**
 * Append-only correctness and performance observation (§8.11, §10.2). The
 * hottest filter/ranking fields are denormalized columns; the complete
 * protocol, environment, correctness, and trust inputs stay in the manifest.
 */
export const benchmarkRuns = pgTable(
  "benchmark_runs",
  {
    id: id(),
    runDigest: text("run_digest").notNull(),
    implementationId: uuid("implementation_id")
      .notNull()
      .references(() => implementations.id),
    workloadId: uuid("workload_id")
      .notNull()
      .references(() => workloads.id),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    status: text("status").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    hardwareVendor: text("hardware_vendor").notNull(),
    hardwareModel: text("hardware_model").notNull(),
    hardwareArchitecture: text("hardware_architecture").notNull(),
    driverMajor: integer("driver_major"),
    cudaMajor: integer("cuda_major"),
    protocolKey: text("protocol_key").notNull(),
    environmentKey: text("environment_key").notNull(),
    correctnessKey: text("correctness_key").notNull(),
    comparisonKey: text("comparison_key").notNull(),
    primaryMetric: text("primary_metric").notNull(),
    primaryValue: numeric("primary_value", { mode: "number" }),
    primaryUnit: text("primary_unit"),
    sampleCount: integer("sample_count"),
    uncertaintyLow: numeric("uncertainty_low", { mode: "number" }),
    uncertaintyHigh: numeric("uncertainty_high", { mode: "number" }),
    reported: boolean("reported").notNull(),
    reproducedByKernelindex: boolean("reproduced_by_kernelindex")
      .notNull()
      .default(false),
    independentReplicationCount: integer("independent_replication_count")
      .notNull()
      .default(0),
    sourceAvailable: boolean("source_available").notNull(),
    installable: boolean("installable").notNull(),
    licenseExpression: text("license_expression"),
    /* Read-path projections of the manifest (statistic label, evidence and
       source-native flags, environment line) so ranked surfaces select only
       scalars; the canonical facts stay inside the manifest. */
    primaryStatistic: text("primary_statistic"),
    hasRawEvidence: boolean("has_raw_evidence").notNull().default(false),
    sourceNative: boolean("source_native").notNull().default(false),
    environmentSummary: text("environment_summary"),
    // Source-published SOL-Score (fraction of the source's speed-of-light
    // estimate), when the source publishes one; headline context on rows.
    solScore: numeric("sol_score", { mode: "number" }),
    manifest: jsonb("manifest").notNull(),
    supersedesId: uuid("supersedes_id").references(
      (): AnyPgColumn => benchmarkRuns.id,
    ),
    retractedAt: timestamp("retracted_at", { withTimezone: true }),
    retractionReason: jsonb("retraction_reason"),
  },
  (t) => [
    uniqueIndex("benchmark_runs_digest_unique").on(t.runDigest),
    index("benchmark_runs_implementation_idx").on(t.implementationId),
    index("benchmark_runs_workload_idx").on(t.workloadId),
    index("benchmark_runs_source_idx").on(t.sourceId),
    index("benchmark_runs_published_idx").on(t.publishedAt),
    // Ranking scan for eligible runs only (§10.6).
    index("benchmark_runs_comparison_idx")
      .on(t.comparisonKey, t.primaryMetric, t.primaryValue)
      .where(
        sql`${t.publishedAt} is not null and ${t.status} = 'passed' and ${t.retractedAt} is null`,
      ),
    index("benchmark_runs_hardware_idx").on(
      t.hardwareArchitecture,
      t.hardwareModel,
    ),
    // Serves the not-superseded anti-join applied by every ranked read.
    index("benchmark_runs_supersedes_idx")
      .on(t.supersedesId)
      .where(sql`${t.supersedesId} is not null`),
    // Eligible-runs-per-workload scan behind joinedRunsForOperation.
    index("benchmark_runs_workload_eligible_idx")
      .on(t.workloadId, t.primaryValue)
      .where(
        sql`${t.publishedAt} is not null and ${t.status} = 'passed' and ${t.retractedAt} is null`,
      ),
    digestCheck("benchmark_runs_digest_format", t.runDigest),
    // NaN compares greater-than in PostgreSQL, so exclude it explicitly.
    check(
      "benchmark_runs_primary_value_valid",
      sql`${t.primaryValue} is null or (${t.primaryValue} >= 0 and ${t.primaryValue} <> 'NaN'::numeric)`,
    ),
  ],
)

/**
 * Append-only record transitions per comparison cohort (§11.10), added in
 * Week 4 with the public record history. Derived from eligible runs under a
 * named ranking policy; recomputation appends, never rewrites.
 */
export const recordEvents = pgTable(
  "record_events",
  {
    id: id(),
    comparisonKey: text("comparison_key").notNull(),
    runId: uuid("run_id")
      .notNull()
      .references(() => benchmarkRuns.id),
    previousRunId: uuid("previous_run_id").references(() => benchmarkRuns.id),
    policyVersion: text("policy_version").notNull(),
    cause: text("cause").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // Cause is part of the identity: a retraction may re-promote a run that
    // already holds a new_run event, and that transition must append.
    uniqueIndex("record_events_cohort_run_cause_unique").on(
      t.comparisonKey,
      t.runId,
      t.cause,
    ),
    index("record_events_cohort_idx").on(t.comparisonKey, t.at),
  ],
)

/** Typed secondary and statistical measurements (§8.12). */
export const measurements = pgTable(
  "measurements",
  {
    id: id(),
    runId: uuid("run_id")
      .notNull()
      .references(() => benchmarkRuns.id),
    metric: text("metric").notNull(),
    statistic: text("statistic").notNull(),
    unit: text("unit").notNull(),
    value: numeric("value", { mode: "number" }).notNull(),
    sampleCount: integer("sample_count"),
  },
  (t) => [
    uniqueIndex("measurements_run_metric_statistic_unique").on(
      t.runId,
      t.metric,
      t.statistic,
    ),
    check(
      "measurements_value_valid",
      sql`${t.value} <> 'NaN'::numeric and (${t.metric} <> 'latency' or ${t.value} >= 0)`,
    ),
  ],
)

/** Content-addressed immutable evidence objects (§8.13). */
export const artifacts = pgTable(
  "artifacts",
  {
    id: id(),
    contentDigest: text("content_digest").notNull(),
    kind: text("kind").notNull(),
    mediaType: text("media_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    storage: text("storage").notNull(),
    uri: text("uri"),
    /* Inline body for storage='inline' artifacts (e.g. mirrored kernel
       source); larger evidence stays digest+uri only. */
    content: text("content"),
    license: text("license"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("artifacts_digest_unique").on(t.contentDigest),
    digestCheck("artifacts_digest_format", t.contentDigest),
  ],
)

/** Artifact role on a run (§10.1). */
export const runArtifacts = pgTable(
  "run_artifacts",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => benchmarkRuns.id),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id),
    role: text("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.artifactId, t.role] })],
)

/** External identity for any public entity; unique per source (§10.5). */
export const sourceLinks = pgTable(
  "source_links",
  {
    id: id(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    entityKind: text("entity_kind").notNull(),
    entityId: uuid("entity_id").notNull(),
    externalId: text("external_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("source_links_identity_unique").on(
      t.sourceId,
      t.entityKind,
      t.externalId,
    ),
    index("source_links_entity_idx").on(t.entityKind, t.entityId),
  ],
)

// ---------------------------------------------------------------------------
// Identity and contribution (§13.6, §15) — Week 6. The user/session/account/
// verification tables follow better-auth's core schema; KernelIndex-owned
// authorization lives in user_roles, never inside the auth library's tables.

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(now),
})

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(now),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
)

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(now),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
)

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(now),
})

/** KernelIndex roles (§15.8); granted by a maintainer command, never OAuth. */
export const userRoles = pgTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    grantedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
)

/** Followed entities (§13.11): a comparison cohort, operation, project,
 * GPU, or model tag, with the label and page it was followed from so the
 * account list needs no joins. The feed derives on read from record_events
 * and the audit trail filtered by these keys — no notifications table, no
 * fan-out jobs. */
export const follows = pgTable(
  "follows",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    href: text("href").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.key] })],
)

/** One seen-watermark per user; feed entries newer than it read as new. */
export const watchMarks = pgTable("watch_marks", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
})

/** Scoped API keys (§13.6): visible prefix, hash-only secret storage,
 * explicit scopes, expiry/revocation/last-use, and a per-day quota. */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /* First characters of the token ("ki_ab12…"), shown in listings; the
       secret itself is never stored. */
    prefix: text("prefix").notNull(),
    secretHash: text("secret_hash").notNull().unique(),
    scopes: text("scopes").array().notNull().default(["catalog:read"]),
    quotaPerDay: integer("quota_per_day").notNull().default(5000),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("api_keys_user_idx").on(t.userId)],
)

/** Per-key daily request counters (§13.7): quota state in PostgreSQL. */
export const apiKeyUsage = pgTable(
  "api_key_usage",
  {
    apiKeyId: uuid("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.apiKeyId, t.day] })],
)

/** Mutation audit trail (§11.10): every authenticated or maintainer write. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    targetKind: text("target_kind").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason"),
    priorState: jsonb("prior_state"),
    at: createdAt(),
  },
  (t) => [index("audit_events_target_idx").on(t.targetKind, t.targetId)],
)

/** Submission lifecycle (§15.4): the manifest bundle rides as jsonb until
    acceptance publishes it through the one publication transaction.
    user_id detaches on account deletion — the evidence row outlives the
    identity (§9.3: history is preserved, personal data is not). */
export const submissions = pgTable(
  "submissions",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    state: text("state").notNull().default("draft"),
    bundle: jsonb("bundle").notNull(),
    validationReport: jsonb("validation_report"),
    reviewNote: text("review_note"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(now),
  },
  (t) => [index("submissions_user_idx").on(t.userId, t.state)],
)

/** Project claims (§15.3): evidence reviewed by a maintainer. */
export const projectClaims = pgTable(
  "project_claims",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    evidenceUrl: text("evidence_url").notNull(),
    state: text("state").notNull().default("pending"),
    reviewNote: text("review_note"),
    createdAt: createdAt(),
  },
  (t) => [index("project_claims_project_idx").on(t.projectId)],
)

/** Public correction/report intake (§15.6): structured, reviewed, and
    never a direct edit of evidence — an accepted report becomes a
    retraction or supersession through the existing correction path. */
export const reports = pgTable(
  "reports",
  {
    id: id(),
    targetKind: text("target_kind").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    detail: text("detail").notNull(),
    evidenceUrl: text("evidence_url"),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    contact: text("contact"),
    state: text("state").notNull().default("open"),
    resolutionNote: text("resolution_note"),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("reports_state_idx").on(t.state, t.createdAt),
    index("reports_target_idx").on(t.targetKind, t.targetId),
  ],
)

/** Minimal first-party product events (§20.5): event name plus coarse
    facets. Deliberately no user id, no IP, no session key, and no raw
    query text — the answer-quality metrics in §20.4 need nothing more.
    Rows older than the documented retention window are pruned weekly. */
export const productEvents = pgTable(
  "product_events",
  {
    id: id(),
    event: text("event").notNull(),
    facets: jsonb("facets"),
    at: createdAt(),
  },
  (t) => [index("product_events_event_idx").on(t.event, t.at)],
)

/** Immutable fetched or supplied source observation (§14.3). */
export const sourceSnapshots = pgTable(
  "source_snapshots",
  {
    id: id(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    locator: text("locator").notNull(),
    resolvedLocator: text("resolved_locator"),
    contentDigest: text("content_digest").notNull(),
    mediaType: text("media_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    body: text("body"),
    storageRef: text("storage_ref"),
    httpMetadata: jsonb("http_metadata"),
    parserName: text("parser_name").notNull(),
    parserVersion: text("parser_version").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("source_snapshots_source_idx").on(t.sourceId, t.fetchedAt),
    index("source_snapshots_digest_idx").on(t.contentDigest),
    digestCheck("source_snapshots_digest_format", t.contentDigest),
  ],
)

// ---------------------------------------------------------------------------
// Serving catalog (§8.16, §10.1 — Week 9). Dedicated typed tables: serving
// reuses projects/sources/source_links/source_snapshots/artifacts but never
// kernel benchmark_runs, its comparison key, or any universal score (§2.2).

/** Model identity for serving cohorts (§8.16). Immutable, digest-keyed. */
export const modelRevisions = pgTable(
  "model_revisions",
  {
    id: id(),
    slug: text("slug").notNull(),
    modelDigest: text("model_digest").notNull(),
    name: text("name").notNull(),
    parameterCount: bigint("parameter_count", { mode: "number" }),
    contextLength: integer("context_length"),
    tokenizer: text("tokenizer"),
    license: text("license"),
    schemaVersion: text("schema_version").notNull(),
    manifest: jsonb("manifest").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("model_revisions_digest_unique").on(t.modelDigest),
    index("model_revisions_slug_idx").on(t.slug),
    digestCheck("model_revisions_digest_format", t.modelDigest),
  ],
)

export const servingStackRevisions = pgTable(
  "serving_stack_revisions",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    slug: text("slug").notNull(),
    stackDigest: text("stack_digest").notNull(),
    name: text("name").notNull(),
    version: text("version"),
    schemaVersion: text("schema_version").notNull(),
    manifest: jsonb("manifest").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("serving_stack_revisions_digest_unique").on(t.stackDigest),
    index("serving_stack_revisions_project_idx").on(t.projectId),
    digestCheck("serving_stack_revisions_digest_format", t.stackDigest),
  ],
)

export const servingConfigurations = pgTable(
  "serving_configurations",
  {
    id: id(),
    stackRevisionId: uuid("stack_revision_id")
      .notNull()
      .references(() => servingStackRevisions.id),
    configurationDigest: text("configuration_digest").notNull(),
    dtype: text("dtype"),
    quantization: text("quantization"),
    tensorParallel: integer("tensor_parallel"),
    /** Human line for result rows: the launch identity a source states. */
    summary: text("summary").notNull(),
    schemaVersion: text("schema_version").notNull(),
    manifest: jsonb("manifest").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("serving_configurations_digest_unique").on(
      t.configurationDigest,
    ),
    index("serving_configurations_stack_idx").on(t.stackRevisionId),
    digestCheck("serving_configurations_digest_format", t.configurationDigest),
  ],
)

export const servingWorkloads = pgTable(
  "serving_workloads",
  {
    id: id(),
    workloadDigest: text("workload_digest").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    streaming: boolean("streaming").notNull(),
    loadGeneration: text("load_generation").notNull(),
    schemaVersion: text("schema_version").notNull(),
    manifest: jsonb("manifest").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("serving_workloads_digest_unique").on(t.workloadDigest),
    index("serving_workloads_slug_idx").on(t.slug),
    digestCheck("serving_workloads_digest_format", t.workloadDigest),
  ],
)

/** One serving benchmark execution (§10.1). The §11.1 cohort projections
 * are typed columns; measurements are multi-objective rows, never a single
 * primary value — there is no universal serving score. */
export const servingRuns = pgTable(
  "serving_runs",
  {
    id: id(),
    runDigest: text("run_digest").notNull(),
    modelRevisionId: uuid("model_revision_id")
      .notNull()
      .references(() => modelRevisions.id),
    configurationId: uuid("configuration_id")
      .notNull()
      .references(() => servingConfigurations.id),
    workloadId: uuid("workload_id")
      .notNull()
      .references(() => servingWorkloads.id),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    status: text("status").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /* §11.1 serving cohort key: digest over model+tokenizer, workload,
       protocol, topology, quality policy, and metric set. */
    cohortKey: text("cohort_key").notNull(),
    protocolKey: text("protocol_key").notNull(),
    qualityPolicy: text("quality_policy").notNull(),
    metricSetKey: text("metric_set_key").notNull(),
    scenario: text("scenario").notNull(),
    acceleratorVendor: text("accelerator_vendor"),
    acceleratorModel: text("accelerator_model").notNull(),
    acceleratorCount: integer("accelerator_count").notNull(),
    nodeCount: integer("node_count").notNull().default(1),
    totalAccelerators: integer("total_accelerators").notNull(),
    reported: boolean("reported").notNull().default(true),
    schemaVersion: text("schema_version").notNull(),
    manifest: jsonb("manifest").notNull(),
    supersedesId: uuid("supersedes_id").references(
      (): AnyPgColumn => servingRuns.id,
    ),
    retractedAt: timestamp("retracted_at", { withTimezone: true }),
    retractionReason: jsonb("retraction_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("serving_runs_digest_unique").on(t.runDigest),
    index("serving_runs_model_idx").on(t.modelRevisionId),
    index("serving_runs_configuration_idx").on(t.configurationId),
    index("serving_runs_workload_idx").on(t.workloadId),
    // Resolver scans: eligible runs by cohort, and by hardware budget.
    index("serving_runs_cohort_idx")
      .on(t.cohortKey)
      .where(
        sql`${t.publishedAt} is not null and ${t.status} = 'valid' and ${t.retractedAt} is null`,
      ),
    index("serving_runs_hardware_idx")
      .on(t.acceleratorModel, t.totalAccelerators)
      .where(
        sql`${t.publishedAt} is not null and ${t.status} = 'valid' and ${t.retractedAt} is null`,
      ),
    digestCheck("serving_runs_digest_format", t.runDigest),
    digestCheck("serving_runs_cohort_format", t.cohortKey),
  ],
)

export const servingMeasurements = pgTable(
  "serving_measurements",
  {
    id: id(),
    runId: uuid("run_id")
      .notNull()
      .references(() => servingRuns.id),
    metric: text("metric").notNull(),
    statistic: text("statistic").notNull(),
    unit: text("unit").notNull(),
    value: numeric("value", { mode: "number" }).notNull(),
    sampleCount: integer("sample_count"),
  },
  (t) => [
    uniqueIndex("serving_measurements_run_metric_statistic_unique").on(
      t.runId,
      t.metric,
      t.statistic,
    ),
    check(
      "serving_measurements_value_valid",
      sql`${t.value} <> 'NaN'::numeric`,
    ),
  ],
)

export const servingRunArtifacts = pgTable(
  "serving_run_artifacts",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => servingRuns.id),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id),
    role: text("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.artifactId, t.role] })],
)
