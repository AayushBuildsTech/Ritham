# Ritham — Product Requirements (PRD)

> Note: This file was created to document the two free Home features requested
> (Panchang + Numerology). The project's living product/build docs are
> `PROGRESS.md` (status/handoff) and `DECISIONS.md` (architecture rationale);
> this PRD and `Ritham_BuildSpec.md` capture these two features specifically.

## Chat — Hindi or English (auto language-mirroring)

Users can chat with the astrologer in **Hindi or English** (most naturally mix the two). The AI
automatically **mirrors the user's language, script, and register** on every reply — no language menu,
selector, or setting. Authentic Jyotisha terms (kundli, rashi, graha, dasha, Shani, Mangal…) stay in
their original form. The **app UI stays in English.**

**Voice — a real Indian jyotishi; Hindi is the default:**
- **Default is Hindi.** Unless the user's message is clearly in English, the astrologer replies in
  **natural, predominantly-Hindi romanised script** — Hindi-first sentence structure and flow, the way a
  warm family jyotishi actually speaks. This default covers Hindi, romanised Hindi, **and** Hindi-English
  mixes — all get a Hindi reply. English words appear **only when genuinely necessary** (words Hindi
  speakers naturally say in English — "job", "career", "problem", "time" — or terms with no natural Hindi
  equivalent); replies are **not** peppered with unnecessary English.
- **English only when the user writes in English:** if the user's message is in English, the astrologer
  replies **fully in clean English and keeps conversing in English** for as long as the user stays in
  English — switching straight back to Hindi the moment the user does.
- When the user writes in **Devanagari Hindi**, the reply is in Devanagari.
- This behaviour lives entirely in the **server-side system prompt**; the chat function passes user
  messages through unchanged so the model detects language naturally.

Language freedom is made discoverable with three small, in-chat touches only — no banners, popups, or
extra screens:
- **Opening greeting** (astrologer's first message, server-side with the system prompt) leads in the
  warm Hindi-leaning jyotishi style and mentions "Hindi ya English — jaise aapko theek lage" exactly once.
- **Input placeholder**: "Apna sawaal poochein... (Hindi ya English)".
- **Starter chips** on an empty chat (weighted Hindi with one plain-English example); they disappear
  once the user starts chatting.

## Chat History

Users can revisit their **past conversations**. A **history icon in the Chat tab header** (no new
bottom-nav tab) opens a list of previous sessions, **newest first**, each showing the date/time, a short
preview (the first question asked), and — when the account has multiple family profiles — **which person
the chat was for**. Tapping a session opens the **full transcript, read-only**. A user only ever sees
their **own** history (enforced by row-level security). Persistence reuses the existing `chat_sessions` +
`chat_messages` tables — no new data model. From a past conversation the user can start a fresh chat, but
editing/continuing an old one is intentionally not offered (history is immutable).

**Delete:** users can remove conversations they no longer want. A **Select** action in the history
header enters a multi-select mode (tap to check, "Select all", or long-press a card to start selecting);
a **Delete (N)** bar then removes the chosen chats after a confirm dialog. Deletion is permanent, scoped
to the user's own chats (RLS), and takes each conversation's messages with it.

## Free Home features: Panchang & Numerology

### Why
Grow the free, daily-return surface of Home to build habit and gently funnel users
into the paid Chat — **without adding any per-user runtime cost**. Both features are
computed and cached; neither uses the AI/LLM.

### Feature 1 — Panchang (daily Hindu almanac)
- **What:** tithi, vaara (weekday), nakshatra, yoga, karana, sunrise, sunset, Rahu Kaal,
  and the day's auspicious / inauspicious timings.
- **Who/scope:** GENERIC — the same for all users in the same city on the same day. Not
  personalised to the chart.
- **Cost:** ₹0 — computed once per city per day and cached; everyone nearby reads the same row.
- **Free.**

### Feature 2 — Numerology (from name + DOB)
- **What:** Life Path number and Destiny/Expression number (master numbers 11/22/33 preserved),
  each with a pre-written interpretation.
- **Who/scope:** personal — derived from the profile's name + date of birth.
- **Cost:** ₹0 — computed once per profile in plain code; interpretations come from a fixed
  static library, never the AI.
- **Free.**

### Home placement
- The daily/weekly/monthly **horoscope remains the hero** of Home.
- Panchang and Numerology appear as clean, tappable **secondary cards below** the horoscope
  (under a "More for you" label) — present, on-brand (deep indigo/gold, celestial, premium),
  and not competing with the hero. Home is not overcrowded.
- Each card opens a full detail screen.

### Soft funnel into Chat (gentle, not pushy)
- The Panchang detail ends with an optional nudge: *"Curious what today holds for you
  specifically? Ask the astrologer."*
- The Numerology detail ends with: *"See how your birth chart shapes this — start a chat."*
- These are subtle invitations, not upsell pressure.

### Analytics
- `panchang_viewed`, `numerology_viewed` (on detail open).
- `home_hook_clicked { source: 'panchang' | 'numerology' }` (on the soft-hook tap).

### Hard rules
- **Zero runtime AI cost** for both — computed + cached only. No Claude/OpenAI calls, ever.
- Panchang cached per city/day; Numerology computed once per profile.
- Any astrology-provider calls (none needed here) route only through `kundliService`.

## Free Home tool: Shubh Muhurat Finder

### Why
Give users a practical, daily-useful tool (auspicious timing for life events) that costs nothing
to run and naturally funnels the relevant intent (a housewarming, a wedding) toward the matching
paid product — all computed, never AI.

### What it does
- User picks an activity from a fixed list (v1: **Griha Pravesh/Housewarming, Marriage/Vivah,
  Vehicle Purchase, Business/Shop Opening, Naming/Namkaran, Property Purchase, Travel/Yatra**),
  shown in Hindi + English.
- Optional date range (default: next 45 days) and city (defaults to the profile's city).
- Returns a list of upcoming auspicious dates, each with weekday, the auspicious time window
  (Abhijit Muhurta), and the Panchang factors (nakshatra, tithi, yoga) that make it favourable.

### How (zero-cost)
- Each activity has a FIXED rule set (favourable nakshatras + weekdays) in
  `config/muhuratRules.ts` — the single source of truth.
- The finder computes each day's Panchang (reusing the Panchang engine) and matches the rules in
  plain code. Pure rule-matching — **no AI**. Results cached per (activity, city, date-range).

### Placement & brand
- A "Shubh Muhurat Finder" **secondary card** in the Home section (below the horoscope hero),
  on-brand (deep indigo/gold, celestial, premium).

### Soft funnel (gentle, not pushy)
- Griha Pravesh / Property → **Vastu report**.
- Marriage → **Matchmaking report**.
- Others → **Chat** ("Want to know if this timing suits YOUR chart? Ask the astrologer").

### Analytics
- `muhurat_opened`, `muhurat_activity_selected {activity}`, `muhurat_results_viewed {activity}`,
  `muhurat_funnel_clicked {target}`.

### Disclaimer
- Muhurat suggestions are for guidance; users should confirm important events with a
  priest/astrologer.

### Hard rules
- **Zero runtime AI cost** — computed + cached only, no LLM calls anywhere.
- Any astrology-provider calls route through `kundliService`.

## Free Home tool: Live Darshan (deep-link directory)

### Why
Add devotional daily-return value (live temple darshan) at zero runtime cost and zero
content-risk by linking out to temples' own official streams.

### What it does (v1: deep-link, not embed)
- A curated list of major temples, each a card with name, location, deity, icon, and typical
  aarti/darshan timings.
- "Watch Live Darshan" opens the temple's OFFICIAL YouTube live page in the external YouTube
  app/browser. We do NOT embed or host video in v1 (deliberate legal-safety choice).
- No "live now" indicator in v1 (can't be determined cheaply/statically) — timings shown instead.

### Data (static, zero-cost)
- `config/temples.ts` — single source of truth. **Official, verified channels only** — never fan
  re-uploads/aggregators (enforced by a CRITICAL-RULE comment + a `verified` flag). 5–8 well-known
  temples to start; easy to extend.

### Placement & brand
- A "Live Darshan" secondary card in Home (below the horoscope hero), devotional/calm/respectful,
  on-brand (deep indigo/gold).

### Legal / safety
- Links OUT only; no hosting/embedding/downloading/re-streaming.
- Visible disclaimer: streams belong to the temples' official YouTube channels; Ritham does not
  own or host the content and is not affiliated with/endorsed by any temple.
- Free & non-monetised — no Ritham ads around/over darshan links; no implied partnership.

### Analytics
- `darshan_opened`, `darshan_temple_clicked {temple}`.

### Upgrade path (v2, not built)
- Per-temple `mode: 'link' | 'embed'` (all `'link'` now). After WRITTEN temple permission, a
  temple can switch to `'embed'` (official YouTube IFrame player). Embedding is not built in v1.

### Hard rules
- **Zero runtime cost** — static config + external links only; no AI, no hosting, no bandwidth
  cost to us (YouTube bears streaming).

---

## Premium Reports (7 total: 2 existing + 5 new)

### Why
Reports are the highest-value paid layer — branded, multi-page PDF readings the user keeps and
re-downloads forever. Each must feel genuinely worth its price: detailed, specific to the user's
own chart, well-structured. Never thin or generic.

### The catalogue (fixed, fair pricing — do NOT overcharge)
**Comprehensive (flagship)**
- **Complete Kundli Analysis (Life Report) — ₹399.** The deepest report: full birth chart, all 12
  houses, planetary positions, key yogas, complete Mahadasha/Antardasha timeline with
  interpretation, life-area outlook (career, wealth, marriage, health, family), personality,
  strengths/challenges, remedies, overall life-path summary. Clearly the longest & most complete.

**Focused single-person readings (from the user's own chart)**
- **Career & Finance — ₹149.** 10th-house & wealth analysis, suitable fields, job-vs-business,
  wealth yogas, favourable/weak financial periods, practical guidance.
- **Love & Relationship — ₹129.** 5th/7th-house reading of an *individual's* love life (not
  two-person matching): patterns, timing, what to seek in a partner, guidance.
- **Health & Wellbeing — ₹99.** Constitutional tendencies, areas to care for, periods needing
  care, lifestyle guidance. Gentle, non-alarming; explicit "not medical advice" note.
- **Education & Career for Students — ₹99.** Favourable fields, academic strengths, exam/competition
  timing, guidance for students & parents.

**Home & compatibility (existing, unchanged)**
- **Vaastu — ₹149** (property-based, floor-plan + Claude vision).
- **Matchmaking — ₹199** (two-person Ashtakoot Guna Milan).

### Fair-value rules
- Prices are FIXED as above; no hidden charges, no aggressive in-report upsell.
- Content depth must match price — the ₹399 flagship is substantially more comprehensive than the
  ₹99–149 focused reports. Real chart-based depth, never padding.
- One purchase = one report, saved to the account for **unlimited re-download** (no re-payment).

### How (reuses the Phase 7 pipeline)
Pay (server-verified Razorpay) → the `report` Edge Function **computes** the astrology deterministically
(houses, house lords, Vimshottari dasha, yogas, thematic strength — rule #2) → Claude **narrates** around
the computed facts → branded HTML → stored in `public.reports` → viewed in-app → exported to PDF via
`expo-print`. The chart itself always comes from `kundliService` (rule #1). Mock narration until
`ANTHROPIC_API_KEY` is set (scores, houses, dasha and yogas are real regardless).

### UI
Reports tab groups cards as **Comprehensive** (flagship, badged), **Focused Readings**, and
**Home & Compatibility**. The five chart reports share one intake screen (`app/report-chart.tsx`)
that shows the report's scope and a single "Continue · ₹price" button (fill-first, pay-at-end).

### Analytics (`lib/analytics.ts`)
Added `report_started {type}`, `report_purchased {type}`, `report_downloaded {type}` (plus the
existing `report_generated`). Free-text `events.name`; no analytics migration.

### Hard rules
- AI narrates only; every score, house, yoga and dasha date is computed in code (rule #2).
- All chart data flows through `kundliService` (rule #1).
- Generation only after server-side payment verification (rule #3); each grant is one ledger row (rule #7).
