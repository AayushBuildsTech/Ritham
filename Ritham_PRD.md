# Ritham — Product Requirements (PRD)

> Note: This file was created to document the two free Home features requested
> (Panchang + Numerology). The project's living product/build docs are
> `PROGRESS.md` (status/handoff) and `DECISIONS.md` (architecture rationale);
> this PRD and `Ritham_BuildSpec.md` capture these two features specifically.

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
