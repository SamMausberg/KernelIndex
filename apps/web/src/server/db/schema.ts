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
    createdAt: createdAt(),
    supersedesId: uuid("supersedes_id").references(
      (): AnyPgColumn => operations.id,
    ),
  },
  (t) => [
    uniqueIndex("operations_slug_unique").on(t.slug),
    uniqueIndex("operations_semantic_digest_unique").on(t.semanticDigest),
    index("operations_family_idx").on(t.family),
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
    digestCheck("benchmark_runs_digest_format", t.runDigest),
    // NaN compares greater-than in PostgreSQL, so exclude it explicitly.
    check(
      "benchmark_runs_primary_value_valid",
      sql`${t.primaryValue} is null or (${t.primaryValue} >= 0 and ${t.primaryValue} <> 'NaN'::numeric)`,
    ),
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
