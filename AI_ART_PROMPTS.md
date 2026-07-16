# Ritham — AI Image Master Prompts (ChatGPT-ready)

**How to use:** Each image below has a heading (filename + where it goes, for me) and
one fenced code block. **Copy the whole code block, paste it into ChatGPT, generate.**
Every block is self-contained — style, colours, orientation and the "no text" rule are
already inside it, so ChatGPT needs no other context.

Notes:
- ChatGPT makes **square**, **tall (portrait)**, or **wide (landscape)** images. I ask for
  the right orientation in each prompt; I'll crop/upscale to the exact app size on my side.
- Where a **transparent** background is needed, the prompt says so. If ChatGPT gives a
  flat dark background instead, that's fine — I'll cut it out.
- Save each result at the **filename** in its heading.
- **Temples (#8–#15) are NOT AI-generated — they use REAL photographs.** For those, the
  block is not a ChatGPT prompt: it lists where to download a genuine licensed photo of the
  actual temple and how to process it to fit the app. See the "Temple photo — how to do it"
  box just below the TIER 2 heading before starting any temple.

---

# TIER 1 — first impressions + store

### 1. Login hero → `assets/auth/login-hero.png`
```
Create a tall portrait (vertical) image for a mobile app's login screen background.
Scene: a mystical Vedic night sky over a softly silhouetted Himalayan mountain
horizon. In the upper third, a glowing magenta-and-violet nebula with a luminous
crescent moon and a faint golden zodiac constellation wheel dissolving into stardust
and delicate gold sacred-geometry lines. The lower two-thirds fades into smooth, dark,
near-empty deep space (this area must stay dark and uncluttered so app text can sit on
it). Colour palette: cyber magenta #FF007F, neon violet #7B2CBF, warm gold, on a
near-black #0D0D1A base. Mood: premium, calm, aspirational, cinematic, soft glow.
Do NOT include any text, letters, words, logos, watermark, UI elements, or borders.
```

### 2. Guru portrait (call screen) → `assets/guru/guru-portrait.png`
```
Create a photorealistic portrait of a serene, warm young Indian woman astrologer in her
late 20s, on a fully TRANSPARENT background (PNG cutout, no background). She has a gentle,
knowing smile and looks directly at the camera as if about to speak. She wears a
deep-magenta silk saree with a fine gold zari border, a small red bindi, delicate gold
jhumka earrings, and a gold Om pendant. Soft magenta-and-violet rim light glows on her
hair and shoulders; natural, flawless skin. She is framed from the mid-chest up, centered
with a little padding around her. Mood: elegant, trustworthy, spiritual. Colour accents in
magenta #FF007F and violet #7B2CBF with warm gold. Do NOT include any text, words, logos,
watermark, UI, or borders.
```

<!-- #3 (guru seated / chat welcome) removed — the chat screen no longer shows a guru
     image; the seated portrait looked out of place. Slot 3 intentionally left empty. -->

### 4. Store hero → `assets/store/store-hero.png`
```
Create a square 3D-render image on a fully TRANSPARENT background (PNG cutout, no
background): a luxurious floating arrangement of sacred Vedic remedy items grouped
together — a strand of dark rudraksha beads, a crystal gemstone bracelet, and a blue
evil-eye (nazar) charm — with a magenta-and-violet neon rim glow, warm gold sparkles, and
a few scattered marigold petals. Colour palette: cyber magenta #FF007F, neon violet
#7B2CBF, warm gold. Mood: premium, mystical, product-hero. Do NOT include any text, words,
logos, watermark, UI, or borders.
```

### 5. Rudraksha → `assets/store/rudraksha.png`
```
Create a square 3D product-render image on a fully TRANSPARENT background (PNG cutout, no
background): a single strand of dark rudraksha-bead mala coiled elegantly, energised with a
soft magenta-and-gold glow, one bead catching neon violet light, and a single marigold
flower beside it. Colour palette: cyber magenta #FF007F, neon violet #7B2CBF, warm gold, on
nothing (transparent). Mood: sacred, premium. Do NOT include any text, words, logos,
watermark, UI, or borders.
```

### 6. Gemstone bracelet → `assets/store/gemstone.png`
```
Create a square 3D product-render image on a fully TRANSPARENT background (PNG cutout, no
background): an elegant crystal-gemstone bracelet made of amethyst and rose-quartz beads
with gold spacer beads, floating and refracting magenta and violet neon light, with a soft
glow and sparkles. Colour palette: cyber magenta #FF007F, neon violet #7B2CBF, warm gold.
Mood: premium, mystical jewellery. Do NOT include any text, words, logos, watermark, UI, or
borders.
```

### 7. Evil Eye (Nazar) → `assets/store/evil-eye.png`
```
Create a square 3D product-render image on a fully TRANSPARENT background (PNG cutout, no
background): a deep-blue nazar evil-eye charm hanging on a fine gold chain, floating and
glowing with a protective magenta-and-violet aura, surrounded by tiny gold stars and one
marigold flower. Colour palette: cyber magenta #FF007F, neon violet #7B2CBF, warm gold.
Mood: protective, sacred, premium. Do NOT include any text, words, logos, watermark, UI, or
borders.
```

---

# TIER 2 — feature screens

## Temples (#8–#15) — REAL PHOTOS, not AI

These eight are **genuine photographs of the real temples**, not generated art. For each one
below: download a real, licence-clear photo from one of the sources, then run the same simple
processing so it fits the app. Don't paste these blocks into ChatGPT.

**Temple photo — how to do it (same steps for all 8):**
1. **Find a real photo.** Best free, licence-clear sources, in order:
   - **Wikimedia Commons** (`commons.wikimedia.org`) — most of these temples have several
     high-res photos under Public Domain / CC0 / CC-BY / CC-BY-SA. Prefer PD or CC0; CC-BY /
     CC-BY-SA are fine if I keep the attribution (see step 4).
   - **Unsplash** / **Pexels** / **Pixabay** — free to use commercially, no attribution
     required. Good fallback when Commons is thin.
   - Use the **search terms** given in each entry. Pick a sharp, well-lit, wide shot of the
     temple exterior — daytime or golden-hour/twilight both work.
2. **Check the licence** before downloading. Avoid anything marked "editorial only",
   "all rights reserved", or a stock watermark. When unsure, skip it and pick another.
3. **Process to fit the app:**
   - Crop to a **wide landscape ~16:9** (e.g. 1600×900), temple as the clear subject.
   - Darken the **lower ~third** with a black→transparent gradient so app text stays readable.
   - Optional, keep it subtle (10–15%): a soft magenta/violet grade in the sky/shadows to
     nod to the app palette (magenta #FF007F, violet #7B2CBF, warm gold). Do **not**
     over-process — it must still read as a real photograph.
   - Export as PNG at the **filename** in the heading.
4. **Save attribution.** If the photo is CC-BY / CC-BY-SA, record the author, title, source
   URL and licence in `assets/temples/CREDITS.md` so a credits screen can show them.

### 8. Tirupati temple → `assets/temples/tirupati.png`
```
REAL PHOTO. Temple: Sri Venkateswara Temple, Tirumala (Tirupati), Andhra Pradesh.
Search terms: "Tirumala temple", "Sri Venkateswara temple gopuram", "Tirupati temple".
Want: a wide exterior shot of the gopuram / vimana tower. Then crop 16:9, darken the lower
third for text, optional subtle magenta/violet grade. Save to assets/temples/tirupati.png.
```

### 9. Vaishno Devi → `assets/temples/vaishno_devi.png`
```
REAL PHOTO. Temple: Vaishno Devi shrine, Trikuta mountains, Katra, Jammu & Kashmir.
Search terms: "Vaishno Devi Bhawan", "Vaishno Devi temple Katra", "Trikuta mountains shrine".
Want: the shrine building or the lit pilgrim path up the mountain. Then crop 16:9, darken the
lower third for text, optional subtle magenta/violet grade. Save to assets/temples/vaishno_devi.png.
```

### 10. Shirdi Sai Baba → `assets/temples/shirdi.png`
```
REAL PHOTO. Temple: Shirdi Sai Baba Samadhi Mandir, Shirdi, Maharashtra.
Search terms: "Shirdi Sai Baba temple", "Samadhi Mandir Shirdi", "Sai Baba temple Shirdi".
Want: a wide exterior of the white-marble temple. Then crop 16:9, darken the lower third for
text, optional subtle magenta/violet grade. Save to assets/temples/shirdi.png.
```

### 11. Kashi Vishwanath → `assets/temples/kashi_vishwanath.png`
```
REAL PHOTO. Temple: Kashi Vishwanath Temple / Varanasi Ganga ghats, Uttar Pradesh.
Search terms: "Kashi Vishwanath temple golden spire", "Varanasi Ganga aarti Dashashwamedh
ghat", "Varanasi ghats evening". Want: the golden spire, or the ghats during Ganga aarti with
the temple behind. Then crop 16:9, darken the lower third for text, optional subtle
magenta/violet grade. Save to assets/temples/kashi_vishwanath.png.
```

### 12. Mahakaleshwar → `assets/temples/mahakaleshwar.png`
```
REAL PHOTO. Temple: Mahakaleshwar Jyotirlinga Temple, Ujjain, Madhya Pradesh.
Search terms: "Mahakaleshwar temple Ujjain", "Mahakaleshwar Jyotirlinga shikhara",
"Ujjain Mahakal temple". Want: a wide exterior of the temple / shikhara (choose an exterior
shot, not the inner sanctum). Then crop 16:9, darken the lower third for text, optional subtle
magenta/violet grade. Save to assets/temples/mahakaleshwar.png.
```

### 13. Somnath → `assets/temples/somnath.png`
```
REAL PHOTO. Temple: Somnath Temple, Prabhas Patan, Gujarat (seaside Shiva temple).
Search terms: "Somnath temple", "Somnath temple sea", "Somnath Jyotirlinga shikhara".
Want: the tall shikhara against the Arabian Sea, ideally at sunset. Then crop 16:9, darken the
lower third for text, optional subtle magenta/violet grade. Save to assets/temples/somnath.png.
```

### 14. Siddhivinayak → `assets/temples/siddhivinayak.png`
```
REAL PHOTO. Temple: Siddhivinayak Ganapati Temple, Prabhadevi, Mumbai, Maharashtra.
Search terms: "Siddhivinayak temple Mumbai", "Siddhivinayak temple dome", "Shree
Siddhivinayak temple". Want: a wide exterior with the gold dome. Then crop 16:9, darken the
lower third for text, optional subtle magenta/violet grade. Save to assets/temples/siddhivinayak.png.
```

### 15. Golden Temple → `assets/temples/golden_temple.png`
```
REAL PHOTO. Temple: Golden Temple (Harmandir Sahib), Amritsar, Punjab.
Search terms: "Golden Temple Amritsar", "Harmandir Sahib", "Golden Temple reflection sarovar".
Want: the gold temple reflected in the sarovar pool, dawn or night both look great. Then crop
16:9, darken the lower third for text, optional subtle magenta/violet grade. Save to
assets/temples/golden_temple.png.
```

### 16. Dream Oracle hero → `assets/dream/dream-hero.png`
> DONE — final image already supplied and in place (1535×1024, ~3:2, matches the screen's
> aspectRatio). Prompt kept below for reference only; no need to regenerate.
```
Create a wide landscape (horizontal) image: a sleeping person's silhouette dissolving into a
swirl of dream symbols — a crescent moon, an owl, a serpent, a lotus and a flowing river —
all rendered as luminous magenta-and-gold constellations against a deep-violet night sky with
stardust. Ethereal, calm, dreamlike (Swapna Shastra dream mysticism). Keep the edges darker.
Colour palette: cyber magenta #FF007F, neon violet #7B2CBF, warm gold, near-black #0D0D1A.
Cinematic, soft glow. Do NOT include any text, words, logos, watermark, UI, or borders.
```

### 17. Numerology hero → `assets/numerology/numerology-hero.png`
```
Create a square image: glowing warm-gold numerals 1 through 9 arranged around a sacred
circular yantra, each number on a softly lit node connected by luminous gold lines, with a
magenta-and-pink nebula core and tiny orbiting planets, all on a deep near-black #0D0D1A
cosmic background with stardust. Colour palette: cyber magenta #FF007F, neon violet #7B2CBF,
warm gold. Mood: mystical, premium, sacred-geometry. Do NOT include any text or letters other
than the numerals 1-9, and no words, logos, watermark, UI, or borders.
```

### 18. Panchang banner → `assets/banners/panchang.png`
```
Create a wide landscape (horizontal) banner image with a lot of empty dark space: an open
glowing celestial almanac with a warm-gold sun-and-moon dial at its center, a faint row of
moon phases, and delicate constellation lines, over a magenta-and-violet cosmic wash on a
near-black #0D0D1A background. Keep detail low and centered so app text stays readable.
Colour palette: cyber magenta #FF007F, neon violet #7B2CBF, warm gold. Mood: mystical,
premium. Do NOT include any text, words, logos, watermark, UI, or borders.
```

### 19. Muhurat banner → `assets/banners/muhurat.png`
```
Create a wide landscape (horizontal) banner image with a lot of empty dark space: a luminous
warm-gold cosmic clock / sundial marking auspicious planetary hours, with a soft magenta glow
and faint stars aligning, over a near-black #0D0D1A cosmic background. Keep detail low and
centered so app text stays readable. Colour palette: cyber magenta #FF007F, neon violet
#7B2CBF, warm gold. Mood: auspicious, mystical, premium. Do NOT include any text, words,
logos, watermark, UI, or borders.
```

### 20. Sade Sati banner → `assets/banners/sadesati.png`
```
Create a wide landscape (horizontal) banner image with a lot of empty dark space: the planet
Saturn with amber-gold glowing rings, wrapped in a slow violet-and-magenta orbital spiral
divided into three phases, over a near-black #0D0D1A cosmic background with stardust. Keep
detail low and centered so app text stays readable. Colour palette: cyber magenta #FF007F,
neon violet #7B2CBF, warm gold. Mood: solemn, dignified, mystical. Do NOT include any text,
words, logos, watermark, UI, or borders.
```

### 21. Vakri (retrograde) banner → `assets/banners/vakri.png`
```
Create a wide landscape (horizontal) banner image with a lot of empty dark space: several
planets on looping orbital paths, with one planet glowing magenta and reversing along a
warm-gold retrograde loop, over a dark near-black #0D0D1A cosmic field with stardust. Keep
detail low and centered so app text stays readable. Colour palette: cyber magenta #FF007F,
neon violet #7B2CBF, warm gold. Mood: cosmic, mystical, premium. Do NOT include any text,
words, logos, watermark, UI, or borders.
```

---

# TIER 3 — per-sign horoscope banners + paywall

*(All 12 signs share the same look — only the constellation animal/figure changes.)*

### 22. Aries → `assets/horoscope/mesha.png`
```
Create a wide landscape (horizontal) image: a luminous warm-gold constellation of a charging
ram, formed from bright stars and fine gold linework, set against a deep magenta-and-violet
nebula on near-black #0D0D1A space, with stardust, soft bloom, and one glowing planet nearby.
Keep the LOWER edge darker for app text. Colour palette: cyber magenta #FF007F, neon violet
#7B2CBF, warm gold. Elegant, cosmic, premium. Do NOT include any text, words, logos,
watermark, UI, or borders.
```

### 23. Taurus → `assets/horoscope/vrishabha.png`
```
Create a wide landscape (horizontal) image: a luminous warm-gold constellation of a powerful
bull, formed from bright stars and fine gold linework, set against a deep magenta-and-violet
nebula on near-black #0D0D1A space, with stardust, soft bloom, and one glowing planet nearby.
Keep the LOWER edge darker for app text. Colour palette: cyber magenta #FF007F, neon violet
#7B2CBF, warm gold. Elegant, cosmic, premium. Do NOT include any text, words, logos,
watermark, UI, or borders.
```

### 24. Gemini → `assets/horoscope/mithuna.png`
```
Create a wide landscape (horizontal) image: a luminous warm-gold constellation of twin
figures standing side by side, formed from bright stars and fine gold linework, set against a
deep magenta-and-violet nebula on near-black #0D0D1A space, with stardust, soft bloom, and one
glowing planet nearby. Keep the LOWER edge darker for app text. Colour palette: cyber magenta
#FF007F, neon violet #7B2CBF, warm gold. Elegant, cosmic, premium. Do NOT include any text,
words, logos, watermark, UI, or borders.
```

### 25. Cancer → `assets/horoscope/karka.png`
```
Create a wide landscape (horizontal) image: a luminous warm-gold constellation of a crab,
formed from bright stars and fine gold linework, set against a deep magenta-and-violet nebula
on near-black #0D0D1A space, with stardust, soft bloom, and one glowing planet nearby. Keep
the LOWER edge darker for app text. Colour palette: cyber magenta #FF007F, neon violet
#7B2CBF, warm gold. Elegant, cosmic, premium. Do NOT include any text, words, logos,
watermark, UI, or borders.
```

### 26. Leo → `assets/horoscope/simha.png`
```
Create a wide landscape (horizontal) image: a luminous warm-gold constellation of a majestic
lion, formed from bright stars and fine gold linework, set against a deep magenta-and-violet
nebula on near-black #0D0D1A space, with stardust, soft bloom, and one glowing planet nearby.
Keep the LOWER edge darker for app text. Colour palette: cyber magenta #FF007F, neon violet
#7B2CBF, warm gold. Elegant, cosmic, premium. Do NOT include any text, words, logos,
watermark, UI, or borders.
```

### 27. Virgo → `assets/horoscope/kanya.png`
```
Create a wide landscape (horizontal) image: a luminous warm-gold constellation of a graceful
maiden holding a sheaf of wheat, formed from bright stars and fine gold linework, set against
a deep magenta-and-violet nebula on near-black #0D0D1A space, with stardust, soft bloom, and
one glowing planet nearby. Keep the LOWER edge darker for app text. Colour palette: cyber
magenta #FF007F, neon violet #7B2CBF, warm gold. Elegant, cosmic, premium. Do NOT include any
text, words, logos, watermark, UI, or borders.
```

### 28. Libra → `assets/horoscope/tula.png`
```
Create a wide landscape (horizontal) image: a luminous warm-gold constellation of a balanced
pair of scales, formed from bright stars and fine gold linework, set against a deep
magenta-and-violet nebula on near-black #0D0D1A space, with stardust, soft bloom, and one
glowing planet nearby. Keep the LOWER edge darker for app text. Colour palette: cyber magenta
#FF007F, neon violet #7B2CBF, warm gold. Elegant, cosmic, premium. Do NOT include any text,
words, logos, watermark, UI, or borders.
```

### 29. Scorpio → `assets/horoscope/vrishchika.png`
```
Create a wide landscape (horizontal) image: a luminous warm-gold constellation of a poised
scorpion, formed from bright stars and fine gold linework, set against a deep
magenta-and-violet nebula on near-black #0D0D1A space, with stardust, soft bloom, and one
glowing planet nearby. Keep the LOWER edge darker for app text. Colour palette: cyber magenta
#FF007F, neon violet #7B2CBF, warm gold. Elegant, cosmic, premium. Do NOT include any text,
words, logos, watermark, UI, or borders.
```

### 30. Sagittarius → `assets/horoscope/dhanu.png`
```
Create a wide landscape (horizontal) image: a luminous warm-gold constellation of an archer
centaur drawing a bow, formed from bright stars and fine gold linework, set against a deep
magenta-and-violet nebula on near-black #0D0D1A space, with stardust, soft bloom, and one
glowing planet nearby. Keep the LOWER edge darker for app text. Colour palette: cyber magenta
#FF007F, neon violet #7B2CBF, warm gold. Elegant, cosmic, premium. Do NOT include any text,
words, logos, watermark, UI, or borders.
```

### 31. Capricorn → `assets/horoscope/makara.png`
```
Create a wide landscape (horizontal) image: a luminous warm-gold constellation of a mythical
sea-goat (makara) creature, formed from bright stars and fine gold linework, set against a
deep magenta-and-violet nebula on near-black #0D0D1A space, with stardust, soft bloom, and one
glowing planet nearby. Keep the LOWER edge darker for app text. Colour palette: cyber magenta
#FF007F, neon violet #7B2CBF, warm gold. Elegant, cosmic, premium. Do NOT include any text,
words, logos, watermark, UI, or borders.
```

### 32. Aquarius → `assets/horoscope/kumbha.png`
```
Create a wide landscape (horizontal) image: a luminous warm-gold constellation of a
water-bearer pouring a pot of water, formed from bright stars and fine gold linework, set
against a deep magenta-and-violet nebula on near-black #0D0D1A space, with stardust, soft
bloom, and one glowing planet nearby. Keep the LOWER edge darker for app text. Colour palette:
cyber magenta #FF007F, neon violet #7B2CBF, warm gold. Elegant, cosmic, premium. Do NOT
include any text, words, logos, watermark, UI, or borders.
```

### 33. Pisces → `assets/horoscope/meena.png`
```
Create a wide landscape (horizontal) image: a luminous warm-gold constellation of two fish
circling each other, formed from bright stars and fine gold linework, set against a deep
magenta-and-violet nebula on near-black #0D0D1A space, with stardust, soft bloom, and one
glowing planet nearby. Keep the LOWER edge darker for app text. Colour palette: cyber magenta
#FF007F, neon violet #7B2CBF, warm gold. Elegant, cosmic, premium. Do NOT include any text,
words, logos, watermark, UI, or borders.
```

<!-- #34 (paywall unlock relic) removed — the paywall no longer shows a relic image; it
     looked out of place. The paywall now opens straight to the eyebrow + title. -->

