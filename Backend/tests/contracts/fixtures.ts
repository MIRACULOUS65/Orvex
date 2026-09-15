/**
 * Fixture loader for Phase 2 contract tests.
 *
 * Reads the canonical JSON fixtures from tests/contracts/fixtures/ at runtime so the
 * fixtures stay language-neutral (they mirror the JSON shapes in CONTRACTS.md) and can
 * be shared/diffed independently of the TypeScript test code.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export function loadFixture(name: string): unknown {
  const path = join(here, "fixtures", name);
  return JSON.parse(readFileSync(path, "utf8"));
}
