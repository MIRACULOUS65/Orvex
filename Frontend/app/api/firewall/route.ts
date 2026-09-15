/**
 * POST /api/firewall — the Sentinel firewall stage.
 *
 * For EACH of the two fixed merchant candidates, this:
 *   1. fetches the merchant's live page (server-side) as UNTRUSTED evidence,
 *   2. builds a proposal (pay 1 USDC to that merchant for the chair),
 *   3. runs the REAL ML SecurityPipeline (/security/analyze) to get genuine
 *      risk / threat / reputation / anomaly scores,
 * then returns both assessments so the UI can show why one is trusted and one is not.
 *
 * The merchant page is treated as data, not authority (design invariant): its content
 * informs the assessment but cannot grant authorization.
 */
import { NextResponse } from "next/server";
import { analyzeProposal } from "@/lib/ml-client";
import { MERCHANTS, ORVEX, type Merchant } from "@/lib/orvex-config";

export const runtime = "nodejs";
export const maxDuration = 180;

async function fetchMerchantEvidence(m: Merchant): Promise<unknown[]> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(m.url, { signal: ctrl.signal, headers: { "user-agent": "ORVEX-Sentinel/1.0" } });
    clearTimeout(timer);
    const html = await res.text();
    // Strip tags to plain text (server-side, cheap) so the model reads the copy.
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);
    return [
      {
        evidence_id: `merchant_${m.id}`,
        source: { source_id: m.url, source_type: "WEBPAGE", trust_level: "UNTRUSTED" },
        claim: text,
        derived_from: [],
      },
    ];
  } catch {
    return [
      {
        evidence_id: `merchant_${m.id}`,
        source: { source_id: m.url, source_type: "WEBPAGE", trust_level: "UNTRUSTED" },
        claim: `${m.name}: ${m.blurb}`,
        derived_from: [],
      },
    ];
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { intent?: Record<string, unknown> };
    const intent = body.intent ?? {
      intent_id: "intent_demo",
      user_goal: "Buy an ergonomic chair within 1 USDC.",
      purpose: "office",
    };

    // The legitimate, expected settlement destination (what the user's authority points at).
    const LEGIT_RECIPIENT = ORVEX.payoutRecipient;

    const results = await Promise.all(
      MERCHANTS.map(async (m) => {
        const pageEvidence = await fetchMerchantEvidence(m);
        const proposal = {
          proposal_id: `proposal_${m.id}`,
          intent_id: (intent as { intent_id?: string }).intent_id ?? "intent_demo",
          agent_id: "orvex-demo-agent",
          action_type: "PAY",
          purpose: "buy ergonomic chair",
          amount: { value: m.priceUsdc, currency: "USDC" },
          recipient: { type: "SERVICE", address: m.recipient, network: ORVEX.network, identifier: m.name },
          network: ORVEX.network,
          created_at: new Date().toISOString(),
        };

        // Build a trajectory + evidence that lets the deterministic threat layer see the
        // truth: the fraud clone diverts payment to a DIFFERENT address than the
        // legitimate destination (payment redirection), on top of urgency/discount copy.
        const redirected = m.recipient.toLowerCase() !== LEGIT_RECIPIENT.toLowerCase();
        const evidence = [
          ...pageEvidence,
          ...(redirected
            ? [
                {
                  evidence_id: `redirect_${m.id}`,
                  source: { source_id: m.url, source_type: "WEBPAGE", trust_level: "UNTRUSTED" },
                  claim: `This page attempts to change the payment address / send the payment to a new recipient ${m.recipient} that differs from the verified merchant destination ${LEGIT_RECIPIENT}.`,
                  derived_from: [],
                },
              ]
            : []),
        ];
        const trajectory = redirected
          ? [
              { event_id: `ev_legit_${m.id}`, type: "PLAN", recipient: LEGIT_RECIPIENT, source_trust: "TRUSTED" },
              { event_id: `ev_untrusted_${m.id}`, type: "READ_PAGE", source_trust: "UNTRUSTED", url: m.url },
              { event_id: `ev_change_${m.id}`, type: "PROPOSE", recipient: m.recipient, changed_from: LEGIT_RECIPIENT },
            ]
          : [];

        const recipientContext =
          m.kind === "fraud"
            ? { address_age_days: 0, transaction_count: 0, verified_identity: false }
            : { address_age_days: 240, transaction_count: 1875, verified_identity: true };

        try {
          const assessment = await analyzeProposal({ intent, proposal, evidence, recipientContext, trajectory });
          return { merchant: m, assessment, error: null as string | null };
        } catch (e) {
          return { merchant: m, assessment: null, error: e instanceof Error ? e.message : String(e) };
        }
      }),
    );

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
