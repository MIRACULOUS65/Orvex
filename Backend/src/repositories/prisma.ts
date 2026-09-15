/**
 * Prisma client accessor — Phase 3.
 *
 * A single lazily-instantiated PrismaClient for the process. Domain services receive a
 * client (or a transaction handle) rather than importing this directly, so tests can
 * inject an isolated client bound to a per-run schema/database (see tests/db/harness).
 *
 * The client is the ONLY place raw database access is created; per the architecture
 * (§42/§74) domain services go through repositories, and repositories go through this
 * client. Business policy never lives here.
 */
import { PrismaClient, Prisma } from "@prisma/client";

let client: PrismaClient | undefined;

/** Get the process-wide PrismaClient, creating it on first use. */
export function getPrisma(): PrismaClient {
  if (!client) {
    client = new PrismaClient();
  }
  return client;
}

/** Disconnect the process-wide client (graceful shutdown). */
export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}

/**
 * A client-or-transaction handle. Repositories accept this so the same method works
 * inside an interactive `$transaction` (row locking) or standalone.
 */
export type Db = PrismaClient | Prisma.TransactionClient;

// Re-export the Prisma namespace types callers need (Decimal, TransactionClient).
export { Prisma };
