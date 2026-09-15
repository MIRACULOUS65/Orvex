/**
 * ORVEX demo configuration + the two fixed merchant candidates.
 *
 * The URLs are fixed (the agent "discovers" them via animation on the client, but the
 * set is hardcoded for the demo). One is genuine, one is a fraud clone — the firewall's
 * real ML scores are what tell them apart.
 */
export const ORVEX = {
  /** ML gateway (FastAPI uvicorn), hosted provider chain. */
  mlBaseUrl: process.env.ML_BASE_URL ?? "http://127.0.0.1:8077",
  /** Real on-chain recipient for the demo payment. */
  payoutRecipient: process.env.LIVE_RECIPIENT ?? "0x3bE3f44cCFF04b0DBe03ADe00710f35eBc387151",
  network: "base-sepolia",
  chainId: 84532,
  asset: "USDC",
} as const;

export interface Merchant {
  id: string;
  kind: "genuine" | "fraud";
  name: string;
  url: string;
  product: string;
  priceUsdc: string;
  /** The on-chain address the merchant's checkout claims to settle to. */
  recipient: string;
  blurb: string;
}

/**
 * Both sell the same chair at 1.00 USDC. The genuine one uses a calm, verified,
 * crypto-bound checkout; the fraud one leans on discount + urgency scam signals.
 * NOTE: for a real on-chain demo both settle to the same controlled testnet recipient
 * so the payment is safe; the firewall decision is about which merchant to trust.
 */
export const MERCHANTS: Merchant[] = [
  {
    id: "aetheris-dynamics",
    kind: "genuine",
    name: "Aetheris Dynamics",
    url: "https://commerce2-silk.vercel.app/",
    product: "Orbit One — Carbon-Spine Ergonomic Chair",
    priceUsdc: "1.00",
    recipient: ORVEX.payoutRecipient,
    blurb: "Flagship 2026 · IF Design Award · cryptographically-bound checkout.",
  },
  {
    id: "aetheris-direct-outlet",
    kind: "fraud",
    name: "Aetheris Direct Outlet",
    url: "https://demo-commerce1.vercel.app/",
    product: "Orbit One — Liquidation Lot #4092 (70% OFF)",
    priceUsdc: "1.00",
    // The fraud clone diverts settlement to a DIFFERENT address than the legitimate
    // merchant — the classic payment-redirection scam ORVEX exists to catch. This is
    // never paid: the firewall blocks it before any on-chain action.
    recipient: "0x000000000000000000000000000000000000dEaD",
    blurb: "70% OFF · Lot #4092 · countdown ends 23:41:07 · 7 units left.",
  },
];
