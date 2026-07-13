// temples — SINGLE SOURCE OF TRUTH for the Live Darshan directory.
//
// Zero-cost, zero-risk (v1): each temple links OUT to its OFFICIAL live-darshan
// source (the temple's own YouTube channel, or its official government/trust
// website where no official YouTube channel exists). Ritham does NOT host, embed,
// download or re-stream any content — YouTube/the temple bears all streaming cost
// and owns the stream. There is NO AI/LLM anywhere in this feature.
//
// ════════════════════════════════════════════════════════════════════════════
// CRITICAL RULE — OFFICIAL SOURCES ONLY.
// Only include a temple's OFFICIAL, VERIFIED source (the shrine board / trust /
// devasthanam's own channel or website). NEVER a fan re-upload, aggregator,
// mirror, or unofficial re-stream. Set `verified: true` only after a human has
// opened the URL and confirmed it is official.
//
// URLs below were verified against official sources on 2026-07-04 (channel names /
// handles confirmed via each temple board's own channel or site). Re-check
// periodically — handles can change.
// ════════════════════════════════════════════════════════════════════════════
//
// The `/live` suffix opens the channel's CURRENT live stream if one is running,
// otherwise the channel page — so we never hardcode a video id that will expire.
//
// UPGRADE PATH (v2, do NOT build yet): once a temple grants WRITTEN permission,
// flip its `mode` to 'embed' to show the official YouTube IFrame player in-app.
// Everything is 'link' for now.

export type DarshanMode = 'link' | 'embed';

export interface Temple {
  id: string;
  name: string;
  location: string;
  deity: string;
  icon: string;        // emoji icon (no bundled image asset needed in v1)
  timings: string;     // typical aarti / darshan timings (local time)
  streamUrl: string;   // OFFICIAL live-darshan URL (YouTube channel, or official site)
  source: 'youtube' | 'website';
  mode: DarshanMode;   // 'link' for every temple in v1; 'embed' reserved for v2
  verified: boolean;   // has a human confirmed this is the official source?
}

export const TEMPLES: Temple[] = [
  {
    id: 'tirupati',
    name: 'Tirumala Tirupati (Sri Venkateswara)',
    location: 'Tirumala, Andhra Pradesh',
    deity: 'Lord Venkateswara (Balaji)',
    icon: '🛕',
    timings: 'Suprabhatam ~3:00 AM · darshan through the day',
    // SVBC TTD Live — TTD's official Sri Venkateswara Bhakti Channel.
    streamUrl: 'https://www.youtube.com/channel/UCTboTRX74UydvU_cBdm_cCQ/live',
    source: 'youtube',
    mode: 'link',
    verified: true,
  },
  {
    id: 'vaishno_devi',
    name: 'Shri Mata Vaishno Devi',
    location: 'Katra, Jammu & Kashmir',
    deity: 'Mata Vaishno Devi',
    icon: '🔱',
    timings: 'Atka Aarti ~ dawn & dusk · darshan through the day',
    // Shri Mata Vaishno Devi Shrine Board (SMVDSB) — official channel.
    streamUrl: 'https://www.youtube.com/@Official.SMVDSB/live',
    source: 'youtube',
    mode: 'link',
    verified: true,
  },
  {
    id: 'shirdi',
    name: 'Shirdi Sai Baba',
    location: 'Shirdi, Maharashtra',
    deity: 'Sai Baba',
    icon: '🪔',
    timings: 'Kakad Aarti ~4:30 AM · Shej Aarti ~10:30 PM',
    // Shree Saibaba Sansthan Trust, Shirdi — official channel.
    streamUrl: 'https://www.youtube.com/@saibabasansthantrust/live',
    source: 'youtube',
    mode: 'link',
    verified: true,
  },
  {
    id: 'kashi_vishwanath',
    name: 'Kashi Vishwanath',
    location: 'Varanasi, Uttar Pradesh',
    deity: 'Lord Shiva',
    icon: '🕉️',
    timings: 'Mangala Aarti ~3:00 AM · Sapt Rishi Aarti ~7:00 PM',
    // Shree Kashi Vishwanath Mandir Trust — official channel.
    streamUrl: 'https://www.youtube.com/@ShreeKashiVishwanathMandir/live',
    source: 'youtube',
    mode: 'link',
    verified: true,
  },
  {
    id: 'mahakaleshwar',
    name: 'Mahakaleshwar Jyotirlinga',
    location: 'Ujjain, Madhya Pradesh',
    deity: 'Lord Shiva (Mahakal)',
    icon: '🔥',
    timings: 'Bhasma Aarti ~4:00 AM · darshan through the day',
    // No official YouTube channel — the temple's OFFICIAL live darshan is hosted on
    // its MP-Government site. Links out to the official live-darshan page.
    streamUrl: 'https://www.shrimahakaleshwar.mp.gov.in/live-darshan',
    source: 'website',
    mode: 'link',
    verified: true,
  },
  {
    id: 'somnath',
    name: 'Somnath Jyotirlinga',
    location: 'Prabhas Patan, Gujarat',
    deity: 'Lord Shiva (Somnath)',
    icon: '🌊',
    timings: 'Aarti ~7:00 AM, 12:00 PM & 7:00 PM',
    // Somnath Temple - Official Channel (Shree Somnath Trust).
    streamUrl: 'https://www.youtube.com/@SomnathTempleOfficialChannel/live',
    source: 'youtube',
    mode: 'link',
    verified: true,
  },
  {
    id: 'siddhivinayak',
    name: 'Shree Siddhivinayak',
    location: 'Prabhadevi, Mumbai',
    deity: 'Lord Ganesha',
    icon: '🐘',
    timings: 'Kakad Aarti ~5:30 AM · darshan through the day',
    // Shree Siddhivinayak Ganapati Mandir Trust — official channel handle linked
    // from the temple's own site (siddhivinayak.org footer).
    streamUrl: 'https://www.youtube.com/@ShreeSiddhivinayakTemple/live',
    source: 'youtube',
    mode: 'link',
    verified: true,
  },
  {
    id: 'golden_temple',
    name: 'Golden Temple (Harmandir Sahib)',
    location: 'Amritsar, Punjab',
    deity: 'Sri Guru Granth Sahib',
    icon: '☬',
    timings: 'Live kirtan from early morning to late night',
    // SGPC, Sri Amritsar — official SGPC channel (live Gurbani kirtan).
    streamUrl: 'https://www.youtube.com/@SGPCSriAmritsar/live',
    source: 'youtube',
    mode: 'link',
    verified: true,
  },
];

// ── Hindi (Devanagari) labels, keyed by temple id ────────────────────────────
export interface TempleHi { name: string; location: string; deity: string; timings: string }
export const TEMPLE_HI: Record<string, TempleHi> = {
  tirupati: {
    name: 'तिरुमला तिरुपति (श्री वेंकटेश्वर)', location: 'तिरुमला, आंध्र प्रदेश',
    deity: 'भगवान वेंकटेश्वर (बालाजी)', timings: 'सुप्रभातम ~3:00 पूर्वाह्न · दिन भर दर्शन',
  },
  vaishno_devi: {
    name: 'श्री माता वैष्णो देवी', location: 'कटरा, जम्मू और कश्मीर',
    deity: 'माता वैष्णो देवी', timings: 'अटका आरती ~ भोर व संध्या · दिन भर दर्शन',
  },
  shirdi: {
    name: 'शिरडी साईं बाबा', location: 'शिरडी, महाराष्ट्र',
    deity: 'साईं बाबा', timings: 'काकड़ आरती ~4:30 पूर्वाह्न · शेज आरती ~10:30 अपराह्न',
  },
  kashi_vishwanath: {
    name: 'काशी विश्वनाथ', location: 'वाराणसी, उत्तर प्रदेश',
    deity: 'भगवान शिव', timings: 'मंगला आरती ~3:00 पूर्वाह्न · सप्त ऋषि आरती ~7:00 अपराह्न',
  },
  mahakaleshwar: {
    name: 'महाकालेश्वर ज्योतिर्लिंग', location: 'उज्जैन, मध्य प्रदेश',
    deity: 'भगवान शिव (महाकाल)', timings: 'भस्म आरती ~4:00 पूर्वाह्न · दिन भर दर्शन',
  },
  somnath: {
    name: 'सोमनाथ ज्योतिर्लिंग', location: 'प्रभास पाटन, गुजरात',
    deity: 'भगवान शिव (सोमनाथ)', timings: 'आरती ~7:00 पूर्वाह्न, 12:00 अपराह्न व 7:00 अपराह्न',
  },
  siddhivinayak: {
    name: 'श्री सिद्धिविनायक', location: 'प्रभादेवी, मुंबई',
    deity: 'भगवान गणेश', timings: 'काकड़ आरती ~5:30 पूर्वाह्न · दिन भर दर्शन',
  },
  golden_temple: {
    name: 'स्वर्ण मंदिर (हरमंदिर साहिब)', location: 'अमृतसर, पंजाब',
    deity: 'श्री गुरु ग्रंथ साहिब', timings: 'सुबह से देर रात तक लाइव कीर्तन',
  },
};
