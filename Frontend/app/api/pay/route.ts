/**
 * POST /api/pay — the REAL payment. On the user's "Yes", this runs the proven Node
 * orchestration (Backend/scripts/live-e2e.mjs): real Core decision + FinalRevalidation
 * on the real Supabase project (isolated schema) + BaseSepoliaExecutionClient broadcasting
 * a REAL on-chain USDC transfer on Base Sepolia, then verifying the receipt.
 *
 * The signer key + DB creds are passed via env to the child process only; never returned
 * to the browser, never logged in the response. The route parses the child's
 * `LIVE_E2E_OK tx=0x...` line and returns the tx hash + explorer link.
 *
 * SAFETY: this triggers a real testnet payment. It is only reachable after the firewall
 * produced an assessment and the user explicitly confirmed.
 */
import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { ORVEX } from "@/lib/orvex-config";

export const runtime = "nodejs";
export const maxDuration = 300;

const BACKEND_DIR = join(process.cwd(), "..", "Backend");

interface PayResult {
  ok: boolean;
  status?: string;
  txHash?: string;
  explorer?: string;
  raw?: string;
  error?: string;
}

function runLiveE2E(env: NodeJS.ProcessEnv): Promise<PayResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/live-e2e.mjs"], {
      cwd: BACKEND_DIR,
      env,
      windowsHide: true,
    });

    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));

    const kill = setTimeout(() => {
      child.kill();
      resolve({ ok: false, error: "payment orchestration timed out", raw: (out + err).slice(-1500) });
    }, 280_000);

    child.on("close", () => {
      clearTimeout(kill);
      const okLine = out.match(/LIVE_E2E_OK tx=(0x[0-9a-fA-F]{64})/);
      const explorer = out.match(/LIVE_E2E_EXPLORER (\S+)/);
      const statusLine = out.match(/execution result:\s*(\w+)/);
      // Classify a DB-connectivity failure distinctly (the Supabase pooler port is
      // intermittently blocked from some networks) so the UI can explain it clearly.
      const dbTimeout = /ETIMEDOUT|timeout expired|ENOTFOUND .*supabase/.test(out + err) && !okLine;
      // Never echo secrets: only forward the sanitized tail of stdout.
      const tail = out.split("\n").filter((l) => !/PRIVATE_KEY|DATABASE_URL/i.test(l)).slice(-14).join("\n");
      if (okLine) {
        resolve({
          ok: true,
          status: "CONFIRMED",
          txHash: okLine[1],
          explorer: explorer?.[1] ?? `https://sepolia.basescan.org/tx/${okLine[1]}`,
          raw: tail,
        });
      } else {
        resolve({
          ok: false,
          status: dbTimeout ? "DB_UNREACHABLE" : statusLine?.[1] ?? "UNKNOWN",
          error: dbTimeout
            ? "Core database (Supabase pooler) is unreachable from this network right now — the authorization step could not run. The on-chain path is unaffected; retry when connectivity is restored."
            : "payment did not confirm",
          raw: (tail + "\n" + err).slice(-1500),
        });
      }
    });
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { amountUsdc?: string; recipient?: string };
    const amount = body.amountUsdc ?? "1.00";

    // Only the chain creds are mandatory; the DB falls back to embedded Postgres.
    const required = ["BASE_SEPOLIA_RPC_URL", "EXECUTION_SIGNER_PRIVATE_KEY"];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) {
      return NextResponse.json(
        { ok: false, error: `server not configured for real payment (missing ${missing.join(", ")})` },
        { status: 503 },
      );
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CORE_ENV: "test",
      EXECUTION_MODE: "TESTNET",
      // Prefer remote Supabase; live-e2e falls back to embedded Postgres automatically
      // if the DB port is blocked. ORVEX_DB=embedded forces local (this network blocks 6543).
      ORVEX_DB: process.env.ORVEX_DB ?? "embedded",
      CORE_NETWORK: ORVEX.network,
      BASE_SEPOLIA_USDC_ADDRESS: process.env.BASE_SEPOLIA_USDC_ADDRESS ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      LIVE_RECIPIENT: body.recipient ?? ORVEX.payoutRecipient,
      LIVE_AMOUNT: amount,
    };

    const result = await runLiveE2E(env);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
