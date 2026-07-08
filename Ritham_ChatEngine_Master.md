# Ritham — AI Astrologer Chat Engine (Master Spec)

The chat is the hero feature: a warm, specific Vedic astrologer (Jyotishi) that answers plain-language
life questions ("meri shaadi kab hogi", "career kaisa rahega") entirely from the user's computed chart.
Its quality is capped by one thing — **the richness and correctness of the chart it is grounded on**
(the "#1 accuracy lever"). This document is the source of truth for how that grounding works.

Implementation: `supabase/functions/chat/index.ts` (deployed as `bright-processor`). Model: Claude
Sonnet 5, thinking disabled. The stable system prefix (persona + chart) is prompt-cached for ~90%
input-cost savings across a session.

## §1 — The grounding data (from VedAstro, via kundliService)

The chart is computed **once at profile creation** by the `kundli` Edge Function (VedAstro primary,
local Lahiri engine fallback — see `Ritham_BuildSpec.md` → "Vedic data engine") and cached on
`profiles.kundli_chart` as `chart_facts` (`engine_version: 3`, `source: 'vedastro'`), with a dense
`summary_text` in `kundli_summary`. The chat function **reads this stored chart only — it NEVER calls
VedAstro live** (single integration point; rule #1).

On every message the system prompt injects, from the stored chart:
- **Static (from `chart_facts` / `summary_text`):** Lagna + its lord's placement, Rashi, Nakshatra +
  pada, Sun sign; all 9 grahas (house + sign + dignity, retrograde/combust flags); the 12 house lords;
  natal yogas; natal doshas (Manglik/Kaal Sarp/Nadi); Navamsa (D9) signs.
- **Time-dependent (computed FRESH each turn by `kundliSummary.currentDynamics`, never cached):**
  running Mahadasha + Antardasha with dates, the next upcoming periods, current gochar transits of
  Shani/Guru/Rahu-Ketu (by house from Lagna and from the Moon), and Sade Sati status + phase.

## §2 — The pre-send assertion (why the AI never says "I don't have your details")

A paid chat must never start on an incomplete chart. Two guards:
1. **Client (`app/(tabs)/chat.tsx`):** before starting a conversation, if the active profile's chart
   lacks a `dasha_timeline` (thin/legacy), it re-fetches via `kundliService.getKundli` (which pulls
   VedAstro, falling back to the local engine) so the stored chart is complete first.
2. **Server (`chat/index.ts`):** self-heals a *thin* chart with the local engine (it cannot call
   VedAstro), but **never downgrades** a rich VedAstro (v3) or local (v2) chart. It then asserts the
   assembled chart has **lagna, rashi, AND a non-empty dasha timeline** — if not, it returns
   `kundli_incomplete` and refuses rather than answering blind.

Because the chart always carries dasha + nakshatra + transits, and the system prompt explicitly forbids
asking the user for any technical data, the astrologer answers directly from the chart. Verified: for a
bare "meri shaadi kab hogi", the injected block already contains the running dasha, nakshatra, current
transits and doshas (see `scripts/vedastro-sample.mjs` → "CHAT GROUNDING PROOF"). If the AI ever *does*
say it lacks a detail, the `summary_text` render is dropping a field — check `renderSummaryText` in
`_shared/vedastro.ts` and `buildSystemPrompt` in `chat/index.ts`.

## §3 — Persona & rules (in `buildSystemPrompt`)

Warm, confident family-pandit voice; answers from the chart with specific dasha/transit/bhaav
references and concrete timing. Language mirrors the user (default Hindi in romanised script; clean
English on English input; Devanagari on Devanagari) — see `Ritham_BuildSpec.md` → Chat language.
AI **narrates** the computed facts; it never invents placements, dates, or scores (rule #2). Safety:
no death/lifespan predictions, no fear, no product/gemstone selling (non-commercial remedies only),
stays strictly in the astrologer role.

## §4 — Modes & cost

`session.kind` drives length: **paid_questions** → complete, detailed answer (`max_tokens` 1024);
timed (free minute / time packs) → warm, conversational (512). History is capped to the last 20 turns.
