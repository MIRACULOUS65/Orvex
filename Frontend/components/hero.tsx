"use client";

/**
 * Orvix hero — built to the exact hero spec (structure, attributes, rise indices,
 * mobile-menu behavior all matched). Brand is Orvix; all copy is adapted to our
 * project: an execution-safe autonomous finance control plane where AI may reason
 * about a financial goal but never defines its own authority.
 */
import { useEffect, useRef } from "react";

export function Hero() {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const toggle = toggleRef.current;
    const menu = menuRef.current;
    if (!toggle || !menu) return;

    const isOpen = () => toggle.getAttribute("aria-expanded") === "true";
    const setMenu = (open: boolean) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      menu.classList.toggle("is-open", open);
      document.body.classList.toggle("menu-open", open);
    };

    const onToggle = () => setMenu(!isOpen());
    const onMenuClick = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t.closest("a")) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen()) {
        setMenu(false);
        toggle.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth > 900 && isOpen()) setMenu(false);
    };

    toggle.addEventListener("click", onToggle);
    menu.addEventListener("click", onMenuClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      toggle.removeEventListener("click", onToggle);
      menu.removeEventListener("click", onMenuClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <section className="hero">
      {/* 3 — background video, no overlay */}
      <div className="hero__bg">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260831_223518_f11bfa03-4e65-47e1-a4a7-30e42a7a8c2f.png&w=1920&q=85"
        >
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260831_232706_43757be4-2250-4f09-8cd7-23aebbf147ad.mp4"
            type="video/mp4"
          />
        </video>
      </div>

      <div className="hero__inner">
        {/* 5 — nav bar */}
        <header className="nav">
          {/* brand (left) */}
          <a className="brand" href="#">
            <svg viewBox="0 0 32 32" fill="none" aria-hidden className="rise" style={{ ["--i" as string]: 0 }}>
              <path
                d="M16 2.5 29.5 16 16 29.5 2.5 16 16 2.5Z"
                stroke="#141414"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path d="M16 9.5 22.5 16 16 22.5 9.5 16 16 9.5Z" fill="#141414" />
            </svg>
            <span className="rise" style={{ ["--i" as string]: 1 }}>
              Orvix
            </span>
          </a>

          {/* centre menu */}
          <nav className="nav__nav" id="site-menu" ref={menuRef}>
            <ul className="nav__links">
              <li className="rise" style={{ ["--i" as string]: 2 }}>
                <a href="#">Platform</a>
              </li>
              <li className="rise" style={{ ["--i" as string]: 3 }}>
                <a href="#">Security</a>
              </li>
              <li className="rise" style={{ ["--i" as string]: 4 }}>
                <a href="#">Docs</a>
              </li>
              <li className="rise" style={{ ["--i" as string]: 5 }}>
                <a href="#">Audit</a>
              </li>
            </ul>
            <a className="btn-dark menu__cta" href="/demo">
              Launch ORVEX
            </a>
          </nav>

          {/* cta (right) */}
          <div className="nav__cta rise" style={{ ["--i" as string]: 6 }}>
            <a className="btn-dark" href="/demo">
              Launch ORVEX
            </a>
          </div>

          {/* hamburger (mobile) */}
          <button
            className="nav__toggle rise"
            id="menu-toggle"
            type="button"
            aria-label="Open menu"
            aria-expanded="false"
            aria-controls="site-menu"
            ref={toggleRef}
            style={{ ["--i" as string]: 6 }}
          >
            <span className="nav__toggle-box" aria-hidden="true">
              <span className="bar bar--top" />
              <span className="bar bar--bot" />
            </span>
          </button>
        </header>

        {/* 7 — centre stack */}
        <div className="stage">
          <div className="badge rise" style={{ ["--i" as string]: 8 }}>
            <span className="badge__tag">Now</span>
            <span>ORVEX 1.0 — the trust boundary is live</span>
          </div>

          <h1 className="headline rise" style={{ ["--i" as string]: 10 }}>
            Let AI reason about money.
            <br className="brk" /> Never let it define what it can spend.
          </h1>

          <p className="sub rise" style={{ ["--i" as string]: 12 }}>
            ORVEX is the control plane between autonomous AI and real financial execution.
            <br className="brk" />
            Every proposed action is checked against your policy, simulated, and verified on-chain before money moves.
          </p>

          {/* 8 — prompt card */}
          <form className="prompt rise" style={{ ["--i" as string]: 14 }} onSubmit={(e) => e.preventDefault()}>
            <label className="sr-only" htmlFor="prompt-input">
              Ask ORVEX
            </label>
            <textarea
              id="prompt-input"
              className="prompt__input"
              rows={3}
              placeholder="Buy a chair under 1 USDC — ask me before anything over budget."
            />
            <div className="prompt__bar">
              <button className="icon-btn rise" type="button" aria-label="Add attachment" style={{ ["--i" as string]: 16 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M12 5v14M5 12h14" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </button>
              <div className="prompt__right">
                <button className="icon-btn icon-btn--bare rise" type="button" aria-label="Use microphone" style={{ ["--i" as string]: 17 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <rect x="9" y="2.5" width="6" height="11" rx="3" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button className="icon-btn icon-btn--send rise" type="submit" aria-label="Send message" style={{ ["--i" as string]: 18 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M4 12h15M13 6l6 6-6 6" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
