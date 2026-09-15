# SWYFTPAY — Design.md

## 1. Purpose
This document defines the full design system and page-level UI direction for **SWYFTPAY**, a premium monochrome fintech and crypto payment product.

([vercel.com](https://vercel.com/kb/guide/agent-skills-creating-installing-and-sharing-reusable-agent-context?utm_source=chatgpt.com)) app experience that feels:
- premium, sharp, and modern
- black-background first
- monochrome only, with disciplined contrast
- highly polished, with subtle motion and glassmorphism
- trustworthy, fast, and product-led
- designed for conversion, not decoration

This document should be treated as the single source of truth for all web and product design decisions.

---

## 2. Design Philosophy
SWYFTPAY must feel like a high-end financial operating system, not a generic crypto landing page.

### Core principles
1. **Monochrome discipline**
   - Use black, off-black, charcoal, white, and grayscale only.
   - No colorful accents unless explicitly approved later.
   - Visual hierarchy must come from contrast, spacing, opacity, blur, scale, and motion.

2. **Premium restraint**
   - Every effect must feel intentional.
   - Do not overuse gradients, glows, shadows, or animated noise.
   - Luxury comes from control, not complexity.

3. **Product clarity**
   - The user must immediately understand what SWYFTPAY does.
   - Every page should answer: what is it, how it works, why trust it, why use it now.

4. **Glassmorphism with discipline**
   - Use frosted cards on dark surfaces.
   - Glass must support structure, not become the entire design.
   - Blur, translucency, and border highlights should remain subtle.

5. **Motion with purpose**
   - Use fade in, fade out, slight upward motion, parallax drift, and soft hover transitions.
   - Avoid aggressive bouncing, spinning, or gimmicky transitions.
   - Motion should guide attention and signal state changes.

6. **Design for confidence**
   - The product handles money, so it must feel secure, precise, and calm.
   - Use dense information only where needed and keep the layout breathable.

---

## 3. Vercel Skill Style Rules
This document should behave like a Vercel skill: concise entry rules, modular page guidance, and reusable design logic.

### Skill-style structure
- Keep the rules here as the root instructions.
- Put page-specific guidance under the page sections below.
- Keep reusable components and visual patterns consistent across the product.
- Prefer system-level decisions over one-off styling choices.

### Skill activation logic
Use this design language whenever building:
- landing pages
- onboarding
- dashboard screens
- payment flows
- wallet screens
- vault and social payment screens
- marketing sections

---

## 4. Visual Identity

### Color system
Primary palette:
- Background: #000000
- Surface 1: #0A0A0A
- Surface 2: #101010
- Elevated surface: #151515
- Border subtle: rgba(255,255,255,0.08)
- Border strong: rgba(255,255,255,0.16)
- Text primary: #F5F5F5
- Text secondary: #B7B7B7
- Text tertiary: #7A7A7A
- Divider: rgba(255,255,255,0.06)

Optional metallic grayscale accents only:
- Soft white glow: rgba(255,255,255,0.12)
- Deep shadow: rgba(0,0,0,0.55)

### Forbidden colors
- Blue, purple, green, red, yellow, neon tints, rainbow gradients
- Do not use bright accent colors in buttons, tags, highlights, charts, or icons

### Surface behavior
- Background should stay nearly pure black.
- Sections may alternate between black and slightly lifted charcoal layers.
- Use thin borders and subtle blur to create depth.

### Typography
Use a clean geometric or modern grotesk font system.

Hierarchy:
- H1: 64–84px desktop, 40–52px mobile, bold, tight tracking
- H2: 40–56px desktop, 28–36px mobile
- H3: 24–32px
- Body: 16–18px, high readability
- Small text: 13–14px, restrained use

Typography rules:
- Use crisp, confident headings.
- Keep paragraphs short.
- Favor line length around 60–80 characters.
- Use uppercase sparingly, only for labels or microcopy.

---

## 5. Layout System

### Grid
- Desktop: 12-column grid
- Tablet: 8-column grid
- Mobile: 4-column grid
- Max content width: 1200–1320px
- Maintain generous outer padding on all breakpoints

### Spacing scale
Use a consistent spacing scale:
- 4, 8, 12, 16, 24, 32, 48, 64, 96, 128

Rules:
- Never cram multiple hero elements together.
- Preserve visual breathing room.
- Large black areas are part of the premium look.

### Structure
Each page should follow this logic:
1. Hero or page title
2. Core promise or action
3. Feature blocks
4. Proof / trust / metrics
5. Deep explanation or workflow
6. Final conversion section

---

## 6. Component Language

### Cards
Cards should be the primary building block.

Card style:
- black or near-black glass background
- 1px subtle border
- 20–28px radius
- soft inner highlight
- mild shadow, never heavy
- slight blur where appropriate

Card content:
- short headline
- supporting description
- icon or metric if needed
- one clear action only

### Buttons
Primary button:
- monochrome inverse style
- black background on light surfaces or white background on black surfaces depending on context
- no bright colors
- strong hover lift and subtle glow

Secondary button:
- transparent or outlined
- low contrast but readable

Tertiary action:
- text link with understated underline or arrow

### Chips / pills
- Use for status, labels, currency, network, or feature categories
- Soft border, low-opacity fill, tiny text
- Keep them sparse

### Carousels
Use carousels only where there is meaningful browsing value:
- testimonials
- onboarding steps
- feature showcases
- cards for family vault or group payments

Carousel rules:
- Smooth horizontal motion
- Snap alignment
- Visible partial previews
- No noisy pagination dots unless necessary

### Stats blocks
- Big number
- short label
- supporting microcopy
- aligned in a clean grid

### Glass panels
- Use for dashboard summaries, wallet balance, payment preview, vault overview
- Keep blur subtle and edges crisp

---

## 7. Motion System

### Motion principles
- Motion must be slow enough to feel premium.
- Motion must reveal structure, not distract from it.
- Use easing that feels soft and controlled.

### Standard motion patterns
- Fade in with slight upward translation
- Fade out with slight downward translation
- Hover scale: minimal, around 1.01–1.03
- Card reveal: staggered entrance
- Section transitions: subtle opacity and blur changes
- Button hover: slight lift and border brighten
- Scroll reveal: gentle fade and slide

### Prohibited motion
- bouncy cartoon transitions
- abrupt zooms
- over-animated text
- continuous flashing
- spinning icons unless functional

---

## 8. Imagery and Iconography

### Imagery
- Prefer abstract, high-end, monochrome visuals
- Use wallet abstractions, QR frames, transaction flows, network lines, vault geometry
- Avoid stock-photo people unless absolutely necessary
- If people are used, keep them minimal and editorial

### Iconography
- Thin line icons
- consistent stroke width
- monochrome only
- no colorful fills
- no overly playful icon set

### Background detail
- Subtle grain is allowed
- Very soft shadow layers are allowed
- Do not use loud textures or visual clutter

---

## 9. Landing Page Design Rules

The landing page must feel like a premium product launch and a serious financial product.

### Hero section
Must include:
- strong product name
- concise one-line value proposition
- a clear CTA
- optional waitlist or login action
- visual product frame or UI preview

Hero rules:
- Large negative space
- Centered or left-aligned depending on composition
- One dominant idea only
- No crowded badge stacks

### Hero copy style
Use direct and confident language.
Examples of tone:
- Fast. Secure. Non-custodial.
- One QR. Any currency.
- Payments, redefined for the new internet.

### Feature sections
Split into focused blocks:
- QR payments
- wallet login
- crypto to INR flow
- INR to crypto flow
- family vault
- social payments
- settlement safety
- SDK / API concept if included

Each block should have:
- clear heading
- one strong sentence
- supporting explanation
- a visual frame or mini diagram

### Trust section
Must include:
- security explanation
- non-custodial positioning
- escrow or settlement logic
- audit-friendly language
- reliability cues

### Social proof / numbers
Use sparingly:
- settlement speed
- fee efficiency
- number of active users
- vault usage metrics

### Final CTA section
- Short, sharp, premium
- Repeat the strongest promise
- Use a simple sign-up or early access action

---

## 10. App Page Design Rules

### Home dashboard
Show at a glance:
- total balance
- active currency buckets
- recent transactions
- quick actions
- QR scan action
- vault summary

Dashboard design:
- top summary card
- mid-level action grid
- recent activity feed
- lower trust/security area

### Wallet page
Must show:
- connected wallet
- network status
- balances by currency
- transaction history
- send/receive actions

### Scan QR page
Must be highly focused.
- large scan frame
- minimal distractions
- strong center alignment
- subtle instruction text

### Send flow
Structure:
1. scan recipient
2. choose currency in
3. choose currency out
4. confirm rate
5. confirm escrow
6. show progress
7. success or refund state

### Receive flow
Structure:
- incoming notification
- preview amount
- destination currency
- confirmation state
- balance update

### Family vault
Should feel like a premium shared control center.
Show:
- vault name
- members
- limits
- permissions
- activity timeline
- approval states

### Social payments
Show:
- group card
- shared balance or split tracker
- request history
- pending approvals
- settle action

---

## 11. Information Hierarchy Rules

### Priority order
1. Action
2. Value proposition
3. Safety
4. Speed
5. Trust
6. Secondary features

### Content density
- Landing pages: low to medium density
- Dashboard: medium density
- Transaction screens: high clarity, low noise
- Vault and social views: medium density with strong structure

### Readability rules
- Never place too much text inside one card.
- Keep one idea per card.
- Use whitespace as a design element.

---

## 12. UI States
Every meaningful component must support these states:
- default
- hover
- pressed
- loading
- success
- failure
- disabled
- empty
- pending

### Transaction states
Must be visually distinct:
- pending escrow
- sent
- confirmed
- settled
- refunded
- failed

State language should feel calm and factual, not alarmist.

---

## 13. Accessibility Rules
- Maintain strong contrast on black backgrounds
- Never rely on color alone to communicate status
- Ensure focus states are visible and elegant
- Keep tap targets large enough for mobile
- Avoid tiny text for critical actions
- Use meaningful labels for buttons, forms, and toggles

---

## 14. Responsive Behavior

### Desktop
- Rich multi-column layouts
- strong hero framing
- layered dashboards
- side-by-side explanations and visuals

### Tablet
- Collapse to fewer columns
- preserve card hierarchy
- avoid over-compression

### Mobile
- Stack everything vertically
- keep primary CTA visible
- avoid dense multi-column blocks
- make QR and payment actions dominant

Mobile must still feel premium, not simplified in a cheap way.

---

## 15. Page Inventory
Build these pages in the first version:
1. Landing page
2. Login / wallet connect page
3. Dashboard
4. Send payment flow
5. Receive payment flow
6. QR scan page
7. Family vault page
8. Social payments page
9. Transaction detail page
10. Settings / security page
11. Waitlist / onboarding page
12. Error / failed payment / refund page

---

## 16. Section-by-Section Landing Page Blueprint

### Section 1: Hero
- Product name
- one sentence promise
- CTA
- preview UI frame

### Section 2: Proof strip
- speed
- non-custodial
- secure settlement
- minimal fees

### Section 3: How it works
- scan QR
- choose currency
- escrow and settle
- receiver balance updates

### Section 4: Feature grid
- dashboard
- family vault
- social payments
- QR transfers

### Section 5: Trust and safety
- escrow model
- failure handling
- non-custodial architecture

### Section 6: Product visuals
- large card mockups
- carousel of core screens

### Section 7: Final CTA
- early access / waitlist / login

---

## 17. Final Art Direction
SWYFTPAY should look like:
- a luxury fintech brand
- a crypto-native payment system
- a calm, premium operating environment
- a monochrome product with serious trust signals

It should not look like:
- a meme coin page
- a neon crypto dashboard
- a crowded startup template
- a loud marketing landing page

---

## 18. Implementation Reminder
When designing any new page or component, check these in order:
1. Is it monochrome?
2. Is the hierarchy obvious?
3. Does it feel premium?
4. Is motion subtle and useful?
5. Does it support trust and clarity?
6. Does it match the SWYFTPAY brand?

If the answer to any of those is no, simplify the design.

---

## 19. Final Rule
Black background. Clean monochrome. Premium glass. Sharp hierarchy. Calm motion. No visual noise.

This is the SWYFTPAY standard.


make it Orvex not swyftpay