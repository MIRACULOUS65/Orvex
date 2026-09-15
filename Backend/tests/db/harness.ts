/**
 * Postgres test harness — Phase 3+.
 *
 * The financial/authorization safety guarantees (row locking, FOR UPDATE contention,
 * transactional reservations) MUST be verified against a REAL Postgres engine with
 * genuine multi-connection semantics — an in-memory shim would not prove concurrency.
 *
 * Two backends are supported, chosen automatically:
 *
 *   1. REMOTE (preferred): if TEST_DATABASE_URL (or DATABASE_URL) points at a real
 *      Postgres server (e.g. Supabase), each test run gets its own isolated SCHEMA
 *      (test_<uuid>) inside that server. The Prisma migration is applied into that
 *      schema and the schema is DROPPED on teardown, so the server's real `public`
 *      data is never touched. This uses genuine, separate TCP connections, giving
 *      true concurrency semantics.
 *
 *   2. EMBEDDED (fallback): if no remote URL is configured, spawn a local embedded
 *      Postgres cluster (zonky binaries) and create a fresh database per caller.
 *
 * Money note: Decimal columns come back as Prisma.Decimal; tests compare via
 * `.toString()`/`.equals()` so no float coercion enters authorization-critical paths.
 */
import EmbeddedPostgres from "embedded-postgres";
import { PrismaClient } from "@prisma/client";
import { readFileSync, mkdtempSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

const MIGRATIONS_DIR = join(repoRoot, "prisma", "migrations");

/** The configured remote Postgres URL, if any. */
function remoteUrl(): string | undefined {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  return url && url.trim().length > 0 ? url : undefined;
}

/**
 * The concatenated migration SQL for ALL migrations, applied in lexical (timestamp/
 * ordinal) order — equivalent to `prisma migrate deploy`. Each migration targets the
 * `public` schema; for remote isolated schemas we strip the schema-creation lines and
 * rely on a per-connection search_path instead.
 */
function loadMigration(): string {
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const parts: string[] = [];
  for (const dir of dirs) {
    const file = join(MIGRATIONS_DIR, dir, "migration.sql");
    if (existsSync(file)) parts.push(readFileSync(file, "utf8"));
  }
  return parts.join("\n\n");
}

export interface TestDb {
  prisma: PrismaClient;
  databaseUrl: string;
  /** Human label for logs. */
  label: string;
  disconnect: () => Promise<void>;
}

// --------------------------------------------------------------------------- //
// Remote (Supabase) backend — isolated schema per run
// --------------------------------------------------------------------------- //

function withSchema(baseUrl: string, schema: string): string {
  const u = new URL(baseUrl);
  u.searchParams.set("schema", schema);
  // Give concurrency tests enough pooled connections to exercise real row-lock
  // contention rather than hitting pool-exhaustion timeouts.
  u.searchParams.set("connection_limit", "20");
  u.searchParams.set("pool_timeout", "30");
  return u.toString();
}

async function createRemoteTestDb(baseUrl: string): Promise<TestDb> {
  const schema = `test_${randomUUID().replace(/-/gu, "")}`;

  // Build the DDL to run inside the isolated schema. The generated migration creates
  // enum TYPEs and TABLEs unqualified, so setting search_path to our schema places
  // every object inside it. We drop the migration's own `CREATE SCHEMA "public"` line
  // to avoid touching public.
  const migration = loadMigration()
    .split("\n")
    .filter((line) => !/CREATE SCHEMA IF NOT EXISTS "public"/u.test(line))
    .join("\n");

  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.query(`SET search_path TO "${schema}"`);
  await admin.query(migration);
  await admin.end();

  const databaseUrl = withSchema(baseUrl, schema);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await prisma.$connect();

  return {
    prisma,
    databaseUrl,
    label: `remote:${schema}`,
    disconnect: async () => {
      await prisma.$disconnect();
      const cleanup = new pg.Client({ connectionString: baseUrl });
      await cleanup.connect();
      await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await cleanup.end();
    },
  };
}

// --------------------------------------------------------------------------- //
// Embedded backend — fresh database per run on a shared local cluster
// --------------------------------------------------------------------------- //

interface EmbeddedCluster {
  pg: EmbeddedPostgres;
  baseAdminUrl: (db: string) => string;
}

let embedded: EmbeddedCluster | undefined;
let embeddedStarting: Promise<EmbeddedCluster> | undefined;

async function getEmbeddedCluster(): Promise<EmbeddedCluster> {
  if (embedded) return embedded;
  if (embeddedStarting) return embeddedStarting;

  embeddedStarting = (async () => {
    const databaseDir = mkdtempSync(join(tmpdir(), "sentinelpay-pg-"));
    const port = 55000 + Math.floor(Math.random() * 5000);
    const user = "postgres";
    const password = "postgres";
    const host = "127.0.0.1";

    const instance = new EmbeddedPostgres({
      databaseDir,
      port,
      user,
      password,
      authMethod: "password",
      persistent: false,
      // Force a UTF-8 cluster so Prisma-generated SQL is always representable.
      initdbFlags: ["--encoding=UTF8", "--locale=C"],
      onLog: () => {},
      onError: () => {},
    });

    await instance.initialise();
    await instance.start();

    embedded = {
      pg: instance,
      baseAdminUrl: (db: string) =>
        `postgresql://${user}:${password}@${host}:${port}/${db}?schema=public`,
    };
    return embedded;
  })();

  return embeddedStarting;
}

async function createEmbeddedTestDb(): Promise<TestDb> {
  const cluster = await getEmbeddedCluster();
  const databaseName = `t_${randomUUID().replace(/-/gu, "")}`;

  const admin = new pg.Client({ connectionString: cluster.baseAdminUrl("postgres") });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.end();

  const migrator = new pg.Client({ connectionString: cluster.baseAdminUrl(databaseName) });
  await migrator.connect();
  await migrator.query(loadMigration());
  await migrator.end();

  const databaseUrl = cluster.baseAdminUrl(databaseName);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await prisma.$connect();

  return {
    prisma,
    databaseUrl,
    label: `embedded:${databaseName}`,
    disconnect: async () => {
      await prisma.$disconnect();
    },
  };
}

// --------------------------------------------------------------------------- //
// Public API
// --------------------------------------------------------------------------- //

/** The base URL used for direct pg connections in concurrency tests. */
export function testBaseUrl(): string | undefined {
  return remoteUrl();
}

/**
 * Create an isolated test database (remote schema or embedded DB). Prefer the remote
 * server when configured because it exercises real network + multi-connection locking.
 */
export async function createTestDb(): Promise<TestDb> {
  const remote = remoteUrl();
  if (remote) return createRemoteTestDb(remote);
  return createEmbeddedTestDb();
}

/** Stop the embedded cluster if one was started. No-op for the remote backend. */
export async function stopCluster(): Promise<void> {
  if (embedded) {
    try {
      await embedded.pg.stop();
    } catch {
      // best-effort teardown
    }
    embedded = undefined;
    embeddedStarting = undefined;
  }
}
