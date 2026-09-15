/**
 * POST /api/intent — Intent layer. Turns the user's natural-language goal into a
 * structured intent using the REAL ML gateway (/intent/parse).
 */
import { NextResponse } from "next/server";
import { parseIntent } from "@/lib/ml-client";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { goal?: string; budgetUsdc?: string };
    const goal = (body.goal ?? "").trim();
    if (!goal) {
      return NextResponse.json({ error: "goal is required" }, { status: 400 });
    }
    const intent = await parseIntent(goal);
    return NextResponse.json({
      ok: true,
      status: intent.status,
      intent: intent.data,
      budgetUsdc: body.budgetUsdc ?? "1.00",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
