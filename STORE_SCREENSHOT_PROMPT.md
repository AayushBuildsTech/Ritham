# Play Store Feature Screenshots (for ChatGPT image generation)

## ▼ FEATURE GRAPHIC PROMPT (1024x500, landscape, NO transparency)

Play REQUIRES a feature graphic, separate from screenshots. Landscape, no alpha.
Keep the logo/text slightly off dead-center (Play overlays a play button there if you
add a promo video). Optionally attach your logo and add "incorporate this exact logo".

```
Design a premium Google Play feature graphic, exactly 1024 x 500 px, landscape, NO
transparency (solid background), for an app called RITHAM — an AI Vedic astrology app.
Mood: calm, mystical, modern, luxurious — a high-end spiritual brand, not a cartoon
astrology app.

COMPOSITION:
- A wide cinematic banner. Deep near-black background #0D0D1A with a rich diagonal
  gradient from magenta #FF007F into deep violet/indigo (#7A1FA2 → #2A1B4A), glowing
  softly from one side.
- Centerpiece: the app name "Ritham" in an elegant display serif (Fraunces-like),
  large, white with a subtle magenta glow. Place it slightly left-of-center (keep the
  exact center clearer, as Play may overlay a play button there).
- Under the name, a short tagline in a clean sans-serif (Inter-like), light-grey:
  "Your AI Vedic Astrologer".
- Cosmic detailing: faint stars, soft nebula haze, delicate thin constellation lines,
  a low-opacity zodiac/mandala ring or subtle orbit arcs. Elegant negative space,
  never cluttered.
- Optional: a soft glowing crescent or single bright star on the right to balance the
  text on the left.

STYLE: high contrast, crisp, premium, magenta-and-violet cosmic theme. No emojis, no
stock-photo people, no cheesy clip-art planets. Legible at thumbnail size.

Output the finished 1024x500 image.
```

---



## ▼ GENERIC ONE-PASTE PROMPT (use this every time — just attach the screenshot)

```
Turn the attached app screenshot into a premium Google Play "feature screenshot"
for an app called RITHAM — an AI Vedic astrology app (kundli, horoscopes, AI
astrologer chat & voice calls, palm reading, numerology, panchang, reports). Mood:
calm, mystical, modern, premium — a high-end spiritual product, not a cartoon
astrology app.

STEP 1 — Look at the screenshot and identify which feature it shows. Then write a
SHORT caption yourself:
- Headline: 2–4 words, evocative and benefit-driven (e.g. "Your Kundli, Decoded",
  "Ask Anything", "Talk to the Stars", "Today, Written for You").
- Subline: ONE short sentence describing the value.
- No emojis. Keep it readable as a thumbnail.

STEP 2 — Compose the final image with these EXACT, FIXED specs so every screenshot
I make looks like one consistent set:

SCREENSHOT FIDELITY (critical):
- Treat the attached screenshot as a FIXED, UNEDITED layer. Do NOT redraw,
  re-render, translate, restyle, or change anything inside it.
- Place it pixel-exact inside a clean modern smartphone frame (thin bezel, rounded
  corners, no brand/logo on the phone). The screenshot is the hero.

CANVAS: single vertical image, 1080 x 1920 px (9:16), crisp 24-bit PNG look.

BRAND KIT (identical every time):
- Background: deep near-black #0D0D1A with a rich radial/diagonal gradient from
  magenta #FF007F into deep violet/indigo (#7A1FA2 → #2A1B4A). Dark, elegant — it
  glows, it doesn't overwhelm.
- Accent: vivid magenta-pink #FF007F for the caption underline/dot and thin lines.
- Subtle cosmic detailing: faint stars, soft nebula haze, delicate thin
  constellation lines, a faint low-opacity zodiac/mandala ring behind the phone.
  Tasteful, minimal, never cluttered.
- Soft magenta glow/halo behind the phone so it lifts off the background.
- Fonts: refined display serif (Fraunces-like) for the headline; clean sans-serif
  (Inter-like) for the subline. High contrast, white text.

LAYOUT (same placement every time):
- Top ~22%: centered caption — Headline (large serif, white, subtle magenta glow),
  a thin magenta accent line/dot, then the Subline (smaller, light-grey sans-serif).
- Bottom ~78%: the framed phone screenshot, centered, with the glow behind it.
- Generous padding. Balanced, premium, uncluttered.

Output the finished 1080x1920 image.
```

*Tip: if it warps your UI, reply "Keep the attached screenshot pixel-exact inside the
frame — do not redraw anything inside the phone." If a simple screen looks empty, add
"add more cosmic background detailing and a larger glow to fill the negative space."*

---

# Mega Master Prompt (alternative — you control the caption per screen)

**How to use:** Paste the MASTER PROMPT once. Then, for each screenshot, upload the
raw app screenshot and add one line: `Feature: <name>. Caption: "<headline>" / "<subline>"`
(pick from the Caption Bank below). Generate all 6–8 with the SAME settings so the set
looks consistent. Ask for 1080×1920 (9:16) PNG each.

> Fidelity note: image models tend to redraw UI. The prompt below explicitly tells it to
> treat your uploaded screenshot as a fixed, unedited layer inside the phone frame. If a
> result warps your UI text, reply: "Keep the uploaded screenshot pixel-exact inside the
> frame; do not redraw anything inside the phone." If it still struggles, a mockup tool
> (e.g. a device-frame generator) is the fallback — but this prompt gets 90% there.

---

## ▼ MASTER PROMPT (paste this first)

```
You are a senior mobile app store designer creating a cohesive set of Google Play
"feature screenshots" for a premium app called RITHAM — an AI Vedic astrology app
(kundli, horoscopes, AI astrologer chat & voice calls, palm reading, numerology,
panchang, reports). The mood is calm, mystical, modern, and premium — like a
high-end spiritual product, not a cartoonish astrology app.

I will upload one real app screenshot per message. Your job for each one:

CRITICAL — SCREENSHOT FIDELITY:
- Treat my uploaded screenshot as a FIXED, UNEDITED image layer.
- Do NOT redraw, re-render, translate, restyle, or alter anything inside it.
- Place it, pixel-exact, inside a clean modern smartphone frame (thin bezel,
  subtle rounded corners, no visible brand/logo on the phone).
- The screenshot is the hero. Everything else you generate is framing around it.

CANVAS & FORMAT:
- Output a single vertical image, 1080 x 1920 px (9:16 portrait).
- 24-bit PNG look, crisp, high resolution, no compression artifacts.

BRAND KIT (use consistently across ALL images):
- Background: deep near-black canvas #0D0D1A with a rich radial/diagonal gradient
  flowing from magenta #FF007F into deep violet/indigo (#7A1FA2 → #2A1B4A).
  Keep it dark and elegant — the gradient glows, it does not overwhelm.
- Accent color: vivid magenta-pink #FF007F for highlights, thin lines, and the
  caption underline/dot.
- Subtle cosmic detailing: faint stars, a soft nebula haze, delicate thin
  constellation lines, a faint zodiac/mandala ring watermark low-opacity behind
  the phone. Tasteful and minimal — never cluttered.
- Soft magenta glow / halo behind the phone so it lifts off the background.
- Typography: a refined display serif (like Fraunces) for the big headline; a
  clean sans-serif (like Inter) for the smaller subline. High contrast, legible.
- NO emojis anywhere. No stock-photo people. No cheesy clip-art planets.

LAYOUT (identical placement on every screenshot for a uniform set):
- Top ~22%: the CAPTION block, centered.
  - Headline: 2–5 words, large serif, white with a subtle magenta glow.
  - Subline: one short sentence, smaller, light-grey/white, sans-serif.
  - A thin magenta accent line or dot between headline and phone.
- Middle/bottom ~78%: the framed phone screenshot, centered, slightly larger than
  half the height, with the soft glow behind it. Phone may be perfectly upright.
- Generous padding and breathing room. Balanced, premium, uncluttered.

CONSISTENCY RULES:
- Same background gradient direction, same caption position, same phone size,
  same fonts, same glow on every image, so the 6–8 screenshots feel like one
  designed series.
- When I give you the feature name + caption text, use exactly that caption.

Confirm you understand, and I'll start uploading screenshots one by one with a
feature name and caption for each.
```

---

## ▼ CAPTION BANK (feed one per screenshot)

Pick the ones that match the screenshots you have. Headline is the big serif line;
subline is the small sentence under it.

| Feature (screen) | Headline | Subline |
|---|---|---|
| Home / dashboard | Your Cosmos, Daily | Personal Vedic guidance the moment you open the app. |
| Kundli / birth chart | Your Kundli, Decoded | A precise Vedic birth chart, explained in plain language. |
| Daily horoscope | Today, Written for You | A horoscope from your own chart — not a generic sun sign. |
| AI astrologer chat | Ask Anything | Chat with your AI jyotishi about love, career, and timing. |
| Voice call | Talk to the Stars | Live voice calls with your AI astrologer, day or night. |
| Palm reading | Read Your Palm | Snap a photo for an instant AI-guided palm reading. |
| Numerology | The Power of Numbers | Discover your core numbers and what they reveal. |
| Panchang / Muhurat | Perfect Timing | Today's tithi, nakshatra, and auspicious muhurat. |
| Dream Oracle | Decode Your Dreams | Free Swapna Shastra meanings for the dreams that linger. |
| Reports | Your Life, In Depth | Rich, personalised reports on you, your year, and beyond. |
| Puja booking | Sacred Remedies | Book a guided puja and traditional remedies with ease. |
| Language / EN-HI | English or हिंदी | Your whole cosmic journey, in the language you love. |

---

## ▼ TIPS FOR A GREAT SET
- **Order matters:** put your 2 strongest shots first (Play shows the first 2–3 most).
  Recommended lead: **Home** → **AI Chat/Call** → **Kundli** → **Horoscope** → **Palm/Reports**.
- **Do 6–8**, not just 2 — more polished shots increase installs.
- Keep **captions short** — they must be readable as a thumbnail.
- After generating, verify each is **1080×1920** and under Play's limits (max 3840px,
  max 2:1 ratio, JPEG or 24-bit PNG).
- If a small/simple screen looks empty, tell ChatGPT: "add more cosmic background
  detailing and a larger glow to fill the negative space."
```
