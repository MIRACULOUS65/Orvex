"use client";

/**
 * ORVEX /demo — the timeline of authority.
 *
 * Flow: INPUT (goal + budget + rulebook PDF) → INTENT (real ML parse) → BRAIN (plan) →
 * FIREWALL (both merchants scored by the real ML SecurityPipeline; genuine vs fraud) →
 * DECISION (summary + Yes/No) → PAY (real on-chain USDC via Core + BaseSepolia).
 *
 * Every stage renders the real backend result. The merchant preview opens the live site
 * in a new tab. "Yes" triggers a real testnet payment and shows the tx hash.
 */
import { useRef, useState } from "react";
import { MERCHANTS, type Merchant } from "@/lib/orvex-config";
import type { SecurityAssessment } from "@/lib/ml-client";
import { toChecks, toDecision, riskPercent, type Decision } from "@/lib/firewall-view";

type Stage = "input" | "intent" | "brain" | "firewall" | "decision" | "done";

interface FirewallEntry {
  merchant: Merchant;
  assessment: SecurityAssessment | null;
  error: string | null;
}

const PLAN_STEPS = [
  "Normalize the goal into a bounded purchase objective",
  "Discover candidate merchants for the item",
  "Extract price, recipient and checkout for each candidate",
  "Hand each concrete transaction to the Sentinel firewall",
];

export function DemoWorkflow() {
  const [stage, setStage] = useState<Stage>("input");
  const [goal, setGoal] = useState("Buy an ergonomic office chair. Budget 1 USDC. Ask me before paying.");
  const [budget, setBudget] = useState("1.00");
  const [ruleFile, setRuleFile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [intent, setIntent] = useState<Record<string, unknown> | null>(null);
  const [firewall, setFirewall] = useState<FirewallEntry[]>([]);
  const [chosen, setChosen] = useState<FirewallEntry | null>(null);

  const [payBusy, setPayBusy] = useState(false);
  const [payResult, setPayResult] = useState<{ ok: boolean; txHash?: string; explorer?: string; error?: string; status?: string } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  async function runIntent() {
    setError(null);
    setBusy(true);
    setStage("intent");
    try {
      const res = await fetch("/api/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal, budgetUsdc: budget }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "intent parse failed");
      setIntent(data.intent);
      // Brief brain stage, then firewall.
      setStage("brain");
      await runFirewall(data.intent);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("input");
    } finally {
      setBusy(false);
    }
  }

  async function runFirewall(intentObj: Record<string, unknown>) {
    setBusy(true);
    setStage("firewall");
    try {
      const res = await fetch("/api/firewall", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: intentObj }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "firewall failed");
      const entries: FirewallEntry[] = data.results;
      setFirewall(entries);
      // Pick the best (an ALLOW/genuine) candidate for the decision summary.
      const ranked = [...entries].sort((a, b) => rank(a) - rank(b));
      setChosen(ranked[0] ?? null);
      setStage("decision");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmPay() {
    if (!chosen) return;
    setPayBusy(true);
    setPayResult(null);
    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountUsdc: chosen.merchant.priceUsdc, recipient: chosen.merchant.recipient }),
      });
      const data = await res.json();
      setPayResult(data);
      setStage("done");
    } catch (e) {
      setPayResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
      setStage("done");
    } finally {
      setPayBusy(false);
    }
  }

  return (
    <main className="demo">
      <div className="demo__grid" aria-hidden />
      <header className="demo__bar">
        <a className="demo__brand" href="/">
          <svg viewBox="0 0 32 32" fill="none" aria-hidden>
            <path d="M16 2.5 29.5 16 16 29.5 2.5 16 16 2.5Z" stroke="#f5f5f5" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M16 9.5 22.5 16 16 22.5 9.5 16 16 9.5Z" fill="#f5f5f5" />
          </svg>
          ORVEX
        </a>
        <span className="demo__mode">
          <span className="dot" /> Live · Base Sepolia · Testnet
        </span>
      </header>

      <div className="demo__main">
        {/* INPUT */}
        <section className="composer">
          <h2>What should ORVEX handle?</h2>
          <p className="hint">
            State a goal and a budget, and attach your rulebook. The agent will reason and propose; the Sentinel firewall
            independently decides whether the action is authorized before any money moves.
          </p>
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Buy a chair under 1 USDC…" disabled={stage !== "input"} />
          <div className="composer__row">
            <div className="field">
              <label htmlFor="budget">Budget (USDC)</label>
              <input id="budget" value={budget} onChange={(e) => setBudget(e.target.value)} disabled={stage !== "input"} />
            </div>
            <label className={`rulebook${ruleFile ? " has-file" : ""}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
                <path d="M14 2v6h6" strokeLinejoin="round" />
              </svg>
              {ruleFile ? ruleFile : "Attach rulebook (PDF)"}
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                onChange={(e) => setRuleFile(e.target.files?.[0]?.name ?? null)}
                disabled={stage !== "input"}
              />
            </label>
            <button className="btn btn--primary btn--send" onClick={runIntent} disabled={busy || stage !== "input" || !goal.trim()}>
              {busy && stage === "input" ? <span className="spin" /> : "Run through ORVEX →"}
            </button>
          </div>
          {error && <div className="err">Error: {error}</div>}
        </section>

        {/* INTENT */}
        {intent && (
          <EventCard actor="Intent" meta="structured" glyph="target">
            <dl className="kv">
              <dt>Goal</dt>
              <dd>{String((intent as Record<string, unknown>).user_goal ?? goal)}</dd>
              <dt>Purpose</dt>
              <dd>{String((intent as Record<string, unknown>).purpose ?? "purchase")}</dd>
              <dt>Budget</dt>
              <dd>{budget} USDC</dd>
              <dt>Network</dt>
              <dd>Base Sepolia (84532)</dd>
            </dl>
          </EventCard>
        )}

        {/* BRAIN */}
        {(stage === "brain" || stage === "firewall" || stage === "decision" || stage === "done") && (
          <EventCard actor="Agent" meta="reasoning" glyph="brain">
            <div className="plan">
              {PLAN_STEPS.map((s, i) => (
                <div key={i} className={`plan__step${stage !== "brain" ? " done" : ""}`}>
                  <span className="n">{String(i + 1).padStart(2, "0")}</span>
                  {s}
                </div>
              ))}
            </div>
          </EventCard>
        )}

        {/* FIREWALL */}
        {(stage === "firewall" || stage === "decision" || stage === "done") && (
          <EventCard actor="Sentinel" meta="firewall / real ML" glyph="shield">
            {busy && stage === "firewall" ? (
              <span className="working">
                <span className="spin" /> Discovering candidates and scoring each transaction…
              </span>
            ) : firewall.length === 0 ? (
              <span className="working">Awaiting assessments…</span>
            ) : (
              <div className="merchants">
                {firewall.map((entry) => (
                  <MerchantCard key={entry.merchant.id} entry={entry} isChosen={chosen?.merchant.id === entry.merchant.id} />
                ))}
              </div>
            )}
          </EventCard>
        )}

        {/* DECISION + PAY */}
        {(stage === "decision" || stage === "done") && chosen && (
          <section className="decision">
            <h3>Summary · authorize execution?</h3>
            {chosen.assessment ? (
              <>
                <dl className="kv">
                  <dt>Recommended</dt>
                  <dd>
                    <DecisionBadge decision={toDecision(chosen.assessment).decision} label={toDecision(chosen.assessment).label} />
                  </dd>
                  <dt>Merchant</dt>
                  <dd>{chosen.merchant.name}</dd>
                  <dt>Pay</dt>
                  <dd>{chosen.merchant.priceUsdc} USDC → {short(chosen.merchant.recipient)}</dd>
                  <dt>Reason</dt>
                  <dd>{toDecision(chosen.assessment).reason}</dd>
                </dl>

                {!payResult && (
                  <div className="decision__actions">
                    <button className="btn btn--primary" onClick={confirmPay} disabled={payBusy}>
                      {payBusy ? <><span className="spin" /> Authorizing + paying on-chain…</> : "Yes — authorize & pay"}
                    </button>
                    <button className="btn btn--ghost" onClick={() => setStage("done")} disabled={payBusy}>
                      No — cancel
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="err">No assessment available for the selected merchant.</div>
            )}

            {payResult && (
              <div className={`pay-result${payResult.ok ? "" : " pay-fail"}`}>
                {payResult.ok ? (
                  <>
                    <strong>Payment CONFIRMED & VERIFIED on Base Sepolia.</strong>
                    <div style={{ marginTop: 6 }}>
                      Tx:{" "}
                      <a href={payResult.explorer} target="_blank" rel="noreferrer">
                        {payResult.txHash}
                      </a>
                    </div>
                  </>
                ) : (
                  <>
                    <strong>Payment not completed{payResult.status ? ` (${payResult.status})` : ""}.</strong>
                    <div style={{ marginTop: 6 }}>{payResult.error ?? "See server logs."}</div>
                  </>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

/* rank: genuine ALLOW first (lower is better) */
function rank(e: FirewallEntry): number {
  if (!e.assessment) return 9;
  const d = toDecision(e.assessment).decision;
  const base = d === "allow" ? 0 : d === "review" ? 1 : 2;
  return base + (e.merchant.kind === "genuine" ? 0 : 0.5);
}

function short(a: string): string {
  return a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a;
}

function MerchantCard({ entry, isChosen }: { entry: FirewallEntry; isChosen: boolean }) {
  const { merchant, assessment, error } = entry;
  const decision = assessment ? toDecision(assessment) : null;
  const checks = assessment ? toChecks(assessment) : [];
  const risk = assessment ? riskPercent(assessment) : 0;
  const pickClass = decision ? (decision.decision === "allow" ? "pick-genuine" : "pick-fraud") : "";

  return (
    <article className={`merchant ${pickClass}`}>
      <div className="merchant__top">
        <div>
          <div className="merchant__name">{merchant.name}</div>
          <div className="merchant__url">{merchant.url.replace("https://", "")}</div>
        </div>
        {decision && <DecisionBadge decision={decision.decision} label={decision.label} />}
      </div>
      <div className="merchant__product">
        {merchant.product} · {merchant.priceUsdc} USDC
      </div>

      {error ? (
        <div className="err">Assessment error: {error}</div>
      ) : assessment ? (
        <>
          <div>
            <div className="check__label" style={{ marginBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--txt-3)" }}>
              Risk {risk}%
            </div>
            <div className="meter">
              <span
                style={{
                  width: `${risk}%`,
                  background: risk < 34 ? "var(--allow)" : risk < 67 ? "var(--review)" : "var(--block)",
                }}
              />
            </div>
          </div>
          <div className="checks">
            {checks.map((c) => (
              <div className="check" key={c.label}>
                <span className="check__label">{c.label}</span>
                <span className={`check__val v-${c.verdict}`}>{c.value}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <span className="working"><span className="spin" /> scoring…</span>
      )}

      <a className="merchant__preview" href={merchant.url} target="_blank" rel="noreferrer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 3h6v6M10 14 21 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Open site preview
      </a>
    </article>
  );
}

function DecisionBadge({ decision, label }: { decision: Decision; label: string }) {
  return (
    <span className={`decision-badge is-${decision}`}>
      <span className="d" />
      {label}
    </span>
  );
}

function EventCard({
  actor,
  meta,
  glyph,
  children,
}: {
  actor: string;
  meta: string;
  glyph: "target" | "brain" | "shield";
  children: React.ReactNode;
}) {
  return (
    <section className="evt">
      <div className="evt__head">
        <span className="evt__glyph">{glyphSvg(glyph)}</span>
        <span className="evt__actor">{actor}</span>
        <span className="evt__meta">{meta}</span>
      </div>
      <div className="evt__body">{children}</div>
    </section>
  );
}

function glyphSvg(g: "target" | "brain" | "shield") {
  if (g === "target")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
      </svg>
    );
  if (g === "brain")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V15a3 3 0 0 0 4 2.8A3 3 0 0 0 12 20V4a3 3 0 0 0-3-1Z" strokeLinejoin="round" />
        <path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V15a3 3 0 0 1-4 2.8A3 3 0 0 1 12 20" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 3 5 6v5c0 4.2 2.8 7.6 7 9 4.2-1.4 7-4.8 7-9V6l-7-3Z" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
