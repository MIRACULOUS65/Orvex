/**
 * Test env bootstrap. Loads Orvex/Backend/.env.local (gitignored) so tests can reach
 * the real Supabase Postgres / Upstash Redis when available, without hardcoding
 * secrets into the test code. If the file is absent, tests fall back to embedded
 * Postgres and skip remote-only paths.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const envLocal = join(here, "..", ".env.local");

if (existsSync(envLocal)) {
  const text = readFileSync(envLocal, "utf8");
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Do not clobber values explicitly provided by the environment.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
