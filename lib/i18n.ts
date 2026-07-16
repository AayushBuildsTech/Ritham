// i18n — the app's bilingual (English / Hindi) string table.
//
// Design:
// - `Lang` is the app language chosen at first launch (before login) and in Settings.
// - Every user-facing UI string lives here keyed by a stable dotted key.
// - Screens read strings via `useT()` (context/LanguageContext) → `t('some.key')`.
// - Missing Hindi falls back to English; a missing key falls back to the key itself
//   (so a forgotten string is visible in dev, never a crash).
// - `{var}` placeholders are filled from the optional `vars` map.
//
// NOTE: This governs the app CHROME/UI only. The AI chat is unchanged — it still
// auto-detects the user's script and mirrors it (English → English, Hinglish →
// Hinglish, Devanagari → Devanagari). Horoscopes and paid reports are generated in
// the chosen app language (the client passes `lang` to those Edge Functions).

export type Lang = 'en' | 'hi';

export const LANGUAGES: { id: Lang; label: string; native: string }[] = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'hi', label: 'Hindi', native: 'हिन्दी' },
];

type Dict = Record<string, string>;

const en: Dict = {
  // ── App-wide / common ──────────────────────────────────────────────
  'common.continue': 'Continue',
  'common.cancel': 'Cancel',
  'common.back': 'Back',
  'common.retry': 'Try again',
  'common.loading': 'Loading…',
  'common.save': 'Save',
  'common.done': 'Done',
  'common.close': 'Close',
  'common.next': 'Next',
  'common.error': 'Something went wrong. Please try again.',
  'common.free': 'Free',
  'common.comingSoon': 'Coming soon',

  // ── Language selection (pre-login) ─────────────────────────────────
  'lang.title': 'Choose your language',
  'lang.subtitle': 'You can change this anytime in Settings.',
  'lang.english': 'English',
  'lang.hindi': 'हिन्दी (Hindi)',
  'lang.continue': 'Continue',

  // ── Auth / sign-in ─────────────────────────────────────────────────
  'auth.tagline': 'VEDIC WISDOM · REFINED',
  'auth.beginJourney': 'Begin your journey',
  'auth.subtitle': 'Sign in to create your account and unlock your chart, horoscopes, and readings.',
  'auth.continueGoogle': 'Continue with Google',
  'auth.cancelled': 'Google sign-in was cancelled.',
  'auth.playServices': 'Google Play Services is required to sign in. Please update it and try again.',
  'auth.agreePre': 'By continuing, you agree to our ',
  'auth.terms': 'Terms of Service',
  'auth.and': ' and ',
  'auth.privacy': 'Privacy Policy',

  // ── Tab bar ────────────────────────────────────────────────────────
  'tab.home': 'Home',
  'tab.chat': 'Ask',
  'tab.call': 'Call',
  'tab.reports': 'Reports',
  'tab.store': 'Store',

  // ── Home ───────────────────────────────────────────────────────────
  'home.greeting.morning': 'Good morning',
  'home.greeting.afternoon': 'Good afternoon',
  'home.greeting.evening': 'Good evening',
  'home.moonIn': 'Moon in {sign}',
  'home.horoscope': 'Your Horoscope',
  'home.daily': 'Daily',
  'home.weekly': 'Weekly',
  'home.monthly': 'Monthly',
  'home.readMore': 'Read more',
  'home.needKundli': 'Create your Kundli to see your personalised horoscope.',
  'home.createKundli': 'Create Kundli',
  'home.myKundli': 'My Kundli',
  'home.explore': 'Explore',
  'home.horoscopeError': "The stars are quiet just now — please try again.",

  // ── Home feature tiles ─────────────────────────────────────────────
  'feature.chat.title': 'Ask the Astrologer',
  'feature.chat.desc': 'Chat with your personal AI Jyotishi',
  'feature.call.title': 'Talk to the Astrologer',
  'feature.call.desc': 'A real spoken call, anchored to your chart',
  'feature.panchang.title': 'Panchang',
  'feature.panchang.desc': "Today's tithi, nakshatra & timings",
  'feature.muhurat.title': 'Shubh Muhurat',
  'feature.muhurat.desc': 'Find auspicious timings',
  'feature.numerology.title': 'Numerology',
  'feature.numerology.desc': 'Your numbers & their meaning',
  'feature.retrograde.title': 'Retrograde (Vakri)',
  'feature.retrograde.desc': 'Which planets are retrograde now',
  'feature.sadesati.title': 'Sade Sati',
  'feature.sadesati.desc': 'Your Shani phase & timeline',
  'feature.reports.title': 'Reports',
  'feature.reports.desc': 'In-depth PDF readings',

  // ── Chat ───────────────────────────────────────────────────────────
  'chat.title': 'Ask the Astrologer',
  'chat.placeholder': 'Ask about your life, career, marriage…',
  'chat.send': 'Send',
  'chat.freeMinute': 'Your first minute is free',
  'chat.freeLeft': '{sec}s free left',
  'chat.questionsLeft': '{n} questions left',
  'chat.timeLeft': '{time} left',
  'chat.outOfQuestions': "You're out of questions. Buy a pack to continue.",
  'chat.expired': 'Your free minute is over. Buy a pack to keep chatting.',
  'chat.needsPurchase': 'Buy a pack to start chatting.',
  'chat.buyPack': 'Buy a pack',
  'chat.thinking': 'The astrologer is reflecting…',
  'chat.emptyTitle': 'Your personal Jyotishi',
  'chat.emptyDesc': 'Ask anything — your chart is already in front of me.',

  // ── Call ───────────────────────────────────────────────────────────
  'call.title': 'Talk to the Astrologer',
  'call.subtitle': 'A real spoken call with your AI Jyotishi.',
  'call.firstFree': 'First 60 seconds free',
  'call.start': 'Start call',
  'call.connecting': 'Connecting…',
  'call.live': 'In call',
  'call.end': 'End call',
  'call.ended': 'Call ended',
  'call.secondsLeft': '{sec}s left',
  'call.buyMinutes': 'Buy call minutes',
  'call.perMin': 'from {price}/min',

  // ── Reports ────────────────────────────────────────────────────────
  'reports.title': 'Reports',
  'reports.subtitle': 'In-depth, personalised PDF readings.',
  'reports.group.flagship': 'Comprehensive',
  'reports.group.personal': 'Focused Readings',
  'reports.group.home': 'Home & Compatibility',
  'reports.group.karmic': 'Karmic & Spiritual',
  'reports.generate': 'Create report',
  'reports.buy': 'Get report',
  'reports.myReports': 'My reports',
  'reports.generating': 'Preparing your report…',
  'reports.ready': 'Ready',
  'reports.failed': "We couldn't finish this report. Please try again.",
  'reports.view': 'View report',
  'report.life.title': 'Complete Kundli Analysis',
  'report.career.title': 'Career & Finance',
  'report.love.title': 'Love & Relationship',
  'report.health.title': 'Health & Wellbeing',
  'report.education.title': 'Education & Career (Students)',
  'report.vastu.title': 'Vaastu Report',
  'report.matchmaking.title': 'Matchmaking Report',
  'report.pastlife.title': 'Past Life Predictions',
  'report.palm.title': 'Palm Reading',

  // ── Store ──────────────────────────────────────────────────────────
  'store.title': 'Store',
  'store.comingSoon': 'Coming soon',
  'store.desc': 'Curated Rudraksha, gemstone bracelets, and nazar charms — arriving shortly.',

  // ── Settings ───────────────────────────────────────────────────────
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.languageValue.en': 'English',
  'settings.languageValue.hi': 'हिन्दी',
  'settings.theme': 'Theme',
  'settings.themeDark': 'Dark',
  'settings.themeLight': 'Light',
  'settings.profiles': 'Family profiles',
  'settings.about': 'About',
  'settings.privacy': 'Privacy Policy',
  'settings.terms': 'Terms of Service',
  'settings.disclaimer': 'Disclaimer',
  'settings.signOut': 'Sign out',
  'settings.deleteAccount': 'Delete account',
  'settings.myKundli': 'Kundli',
  'settings.yourKundli': 'Your Kundli',
  'settings.personKundli': "{name}'s Kundli",

  // ── Paywall ────────────────────────────────────────────────────────
  'paywall.title': 'Continue your reading',
  'paywall.questions': 'Questions',
  'paywall.time': 'Time',
  'paywall.mostPopular': 'Most popular',
  'paywall.pay': 'Pay {price}',
  'paywall.perQuestion': '{n} questions',
  'paywall.perMinutes': '{min} min',

  // ── Panchang ───────────────────────────────────────────────────────
  'panchang.title': 'Panchang',
  'panchang.tithi': 'Tithi',
  'panchang.nakshatra': 'Nakshatra',
  'panchang.yoga': 'Yoga',
  'panchang.karana': 'Karana',
  'panchang.vaara': 'Weekday',
  'panchang.sunrise': 'Sunrise',
  'panchang.sunset': 'Sunset',

  // ── Muhurat ────────────────────────────────────────────────────────
  'muhurat.title': 'Shubh Muhurat',
  'muhurat.subtitle': 'Find an auspicious time for what matters.',
  'muhurat.find': 'Find muhurat',

  // ── Numerology ─────────────────────────────────────────────────────
  'numerology.title': 'Numerology',
  'numerology.lifePath': 'Life Path',
  'numerology.destiny': 'Destiny',
  'numerology.soul': 'Soul Urge',

  // ── Retrograde / Sade Sati ─────────────────────────────────────────
  'retrograde.title': 'Retrograde (Vakri)',
  'retrograde.none': 'No planets are retrograde right now.',
  'sadesati.title': 'Sade Sati',
  'sadesati.active': 'Sade Sati is active',
  'sadesati.inactive': 'Sade Sati is not active right now',

  // ── Profile / Kundli form ──────────────────────────────────────────
  'profile.title': 'Your birth details',
  'profile.name': 'Full name',
  'profile.gender': 'Gender',
  'profile.dob': 'Date of birth',
  'profile.tob': 'Time of birth',
  'profile.place': 'Place of birth',
  'profile.male': 'Male',
  'profile.female': 'Female',
  'profile.other': 'Other',
  'profile.save': 'Save & continue',
  'profile.chart': 'Birth chart',
  'profile.lagna': 'Ascendant (Lagna)',
  'profile.moonSign': 'Moon sign (Rashi)',
  'profile.sunSign': 'Sun sign',
  'profile.nakshatra': 'Nakshatra',
  'profile.generateDetailed': 'Generate detailed Kundli',
};

const hi: Dict = {
  // ── सामान्य ─────────────────────────────────────────────────────────
  'common.continue': 'आगे बढ़ें',
  'common.cancel': 'रद्द करें',
  'common.back': 'वापस',
  'common.retry': 'फिर कोशिश करें',
  'common.loading': 'लोड हो रहा है…',
  'common.save': 'सहेजें',
  'common.done': 'पूर्ण',
  'common.close': 'बंद करें',
  'common.next': 'आगे',
  'common.error': 'कुछ गड़बड़ हो गई। कृपया फिर कोशिश करें।',
  'common.free': 'निःशुल्क',
  'common.comingSoon': 'जल्द आ रहा है',

  // ── भाषा चयन ───────────────────────────────────────────────────────
  'lang.title': 'अपनी भाषा चुनें',
  'lang.subtitle': 'आप इसे कभी भी सेटिंग्स में बदल सकते हैं।',
  'lang.english': 'English',
  'lang.hindi': 'हिन्दी',
  'lang.continue': 'आगे बढ़ें',

  // ── साइन-इन ────────────────────────────────────────────────────────
  'auth.tagline': 'वैदिक ज्ञान · परिष्कृत',
  'auth.beginJourney': 'अपनी यात्रा शुरू करें',
  'auth.subtitle': 'अपना खाता बनाने और अपनी कुंडली, राशिफल और रिपोर्ट पाने के लिए साइन इन करें।',
  'auth.continueGoogle': 'Google से जारी रखें',
  'auth.cancelled': 'Google साइन-इन रद्द कर दिया गया।',
  'auth.playServices': 'साइन इन करने के लिए Google Play Services आवश्यक है। कृपया इसे अपडेट करके फिर कोशिश करें।',
  'auth.agreePre': 'जारी रखकर, आप हमारी ',
  'auth.terms': 'सेवा की शर्तें',
  'auth.and': ' और ',
  'auth.privacy': 'गोपनीयता नीति',

  // ── टैब ────────────────────────────────────────────────────────────
  'tab.home': 'होम',
  'tab.chat': 'पूछें',
  'tab.call': 'कॉल',
  'tab.reports': 'रिपोर्ट',
  'tab.store': 'स्टोर',

  // ── होम ─────────────────────────────────────────────────────────────
  'home.greeting.morning': 'सुप्रभात',
  'home.greeting.afternoon': 'नमस्कार',
  'home.greeting.evening': 'शुभ संध्या',
  'home.moonIn': 'चंद्रमा {sign} में',
  'home.horoscope': 'आपका राशिफल',
  'home.daily': 'दैनिक',
  'home.weekly': 'साप्ताहिक',
  'home.monthly': 'मासिक',
  'home.readMore': 'और पढ़ें',
  'home.needKundli': 'अपना व्यक्तिगत राशिफल देखने के लिए अपनी कुंडली बनाएं।',
  'home.createKundli': 'कुंडली बनाएं',
  'home.myKundli': 'मेरी कुंडली',
  'home.explore': 'खोजें',
  'home.horoscopeError': 'तारे इस समय शांत हैं — कृपया फिर कोशिश करें।',

  // ── होम फ़ीचर ───────────────────────────────────────────────────────
  'feature.chat.title': 'ज्योतिषी से पूछें',
  'feature.chat.desc': 'अपने निजी AI ज्योतिषी से बात करें',
  'feature.call.title': 'ज्योतिषी से बात करें',
  'feature.call.desc': 'आपकी कुंडली पर आधारित असली आवाज़ में कॉल',
  'feature.panchang.title': 'पंचांग',
  'feature.panchang.desc': 'आज की तिथि, नक्षत्र और समय',
  'feature.muhurat.title': 'शुभ मुहूर्त',
  'feature.muhurat.desc': 'शुभ समय जानें',
  'feature.numerology.title': 'अंक ज्योतिष',
  'feature.numerology.desc': 'आपके अंक और उनका अर्थ',
  'feature.retrograde.title': 'वक्री ग्रह',
  'feature.retrograde.desc': 'अभी कौन-से ग्रह वक्री हैं',
  'feature.sadesati.title': 'साढ़े साती',
  'feature.sadesati.desc': 'आपका शनि चरण और समयरेखा',
  'feature.reports.title': 'रिपोर्ट',
  'feature.reports.desc': 'विस्तृत PDF रिपोर्ट',

  // ── चैट ─────────────────────────────────────────────────────────────
  'chat.title': 'ज्योतिषी से पूछें',
  'chat.placeholder': 'अपने जीवन, करियर, विवाह के बारे में पूछें…',
  'chat.send': 'भेजें',
  'chat.freeMinute': 'आपका पहला मिनट निःशुल्क है',
  'chat.freeLeft': '{sec} सेकंड निःशुल्क शेष',
  'chat.questionsLeft': '{n} प्रश्न शेष',
  'chat.timeLeft': '{time} शेष',
  'chat.outOfQuestions': 'आपके प्रश्न समाप्त हो गए हैं। जारी रखने के लिए एक पैक खरीदें।',
  'chat.expired': 'आपका निःशुल्क मिनट समाप्त हो गया। बातचीत जारी रखने के लिए पैक खरीदें।',
  'chat.needsPurchase': 'बातचीत शुरू करने के लिए एक पैक खरीदें।',
  'chat.buyPack': 'पैक खरीदें',
  'chat.thinking': 'ज्योतिषी विचार कर रहे हैं…',
  'chat.emptyTitle': 'आपके निजी ज्योतिषी',
  'chat.emptyDesc': 'कुछ भी पूछें — आपकी कुंडली मेरे सामने है।',

  // ── कॉल ─────────────────────────────────────────────────────────────
  'call.title': 'ज्योतिषी से बात करें',
  'call.subtitle': 'अपने AI ज्योतिषी के साथ असली आवाज़ में कॉल।',
  'call.firstFree': 'पहले 60 सेकंड निःशुल्क',
  'call.start': 'कॉल शुरू करें',
  'call.connecting': 'जुड़ रहे हैं…',
  'call.live': 'कॉल जारी है',
  'call.end': 'कॉल समाप्त करें',
  'call.ended': 'कॉल समाप्त',
  'call.secondsLeft': '{sec} सेकंड शेष',
  'call.buyMinutes': 'कॉल मिनट खरीदें',
  'call.perMin': '{price}/मिनट से',

  // ── रिपोर्ट ─────────────────────────────────────────────────────────
  'reports.title': 'रिपोर्ट',
  'reports.subtitle': 'विस्तृत, व्यक्तिगत PDF रिपोर्ट।',
  'reports.group.flagship': 'सम्पूर्ण',
  'reports.group.personal': 'विशेष रिपोर्ट',
  'reports.group.home': 'घर और अनुकूलता',
  'reports.group.karmic': 'कर्म और आध्यात्म',
  'reports.generate': 'रिपोर्ट बनाएं',
  'reports.buy': 'रिपोर्ट लें',
  'reports.myReports': 'मेरी रिपोर्ट',
  'reports.generating': 'आपकी रिपोर्ट तैयार हो रही है…',
  'reports.ready': 'तैयार',
  'reports.failed': 'हम यह रिपोर्ट पूरी नहीं कर सके। कृपया फिर कोशिश करें।',
  'reports.view': 'रिपोर्ट देखें',
  'report.life.title': 'सम्पूर्ण कुंडली विश्लेषण',
  'report.career.title': 'करियर और धन',
  'report.love.title': 'प्रेम और संबंध',
  'report.health.title': 'स्वास्थ्य और कल्याण',
  'report.education.title': 'शिक्षा और करियर (विद्यार्थी)',
  'report.vastu.title': 'वास्तु रिपोर्ट',
  'report.matchmaking.title': 'मिलान (कुंडली मिलान) रिपोर्ट',
  'report.pastlife.title': 'पूर्व जन्म भविष्यवाणी',
  'report.palm.title': 'हस्तरेखा पठन',

  // ── स्टोर ───────────────────────────────────────────────────────────
  'store.title': 'स्टोर',
  'store.comingSoon': 'जल्द आ रहा है',
  'store.desc': 'चुनिंदा रुद्राक्ष, रत्न ब्रेसलेट और नज़र रक्षा — जल्द ही उपलब्ध।',

  // ── सेटिंग्स ─────────────────────────────────────────────────────────
  'settings.title': 'सेटिंग्स',
  'settings.language': 'भाषा',
  'settings.languageValue.en': 'English',
  'settings.languageValue.hi': 'हिन्दी',
  'settings.theme': 'थीम',
  'settings.themeDark': 'गहरा',
  'settings.themeLight': 'हल्का',
  'settings.profiles': 'परिवार की कुंडलियां',
  'settings.about': 'ऐप के बारे में',
  'settings.privacy': 'गोपनीयता नीति',
  'settings.terms': 'सेवा की शर्तें',
  'settings.disclaimer': 'अस्वीकरण',
  'settings.signOut': 'साइन आउट',
  'settings.deleteAccount': 'खाता हटाएं',
  'settings.myKundli': 'कुंडली',
  'settings.yourKundli': 'आपकी कुंडली',
  'settings.personKundli': '{name} की कुंडली',

  // ── पेवॉल ───────────────────────────────────────────────────────────
  'paywall.title': 'अपनी बातचीत जारी रखें',
  'paywall.questions': 'प्रश्न',
  'paywall.time': 'समय',
  'paywall.mostPopular': 'सबसे लोकप्रिय',
  'paywall.pay': '{price} भुगतान करें',
  'paywall.perQuestion': '{n} प्रश्न',
  'paywall.perMinutes': '{min} मिनट',

  // ── पंचांग ──────────────────────────────────────────────────────────
  'panchang.title': 'पंचांग',
  'panchang.tithi': 'तिथि',
  'panchang.nakshatra': 'नक्षत्र',
  'panchang.yoga': 'योग',
  'panchang.karana': 'करण',
  'panchang.vaara': 'वार',
  'panchang.sunrise': 'सूर्योदय',
  'panchang.sunset': 'सूर्यास्त',

  // ── मुहूर्त ──────────────────────────────────────────────────────────
  'muhurat.title': 'शुभ मुहूर्त',
  'muhurat.subtitle': 'जो महत्वपूर्ण है उसके लिए शुभ समय जानें।',
  'muhurat.find': 'मुहूर्त खोजें',

  // ── अंक ज्योतिष ──────────────────────────────────────────────────────
  'numerology.title': 'अंक ज्योतिष',
  'numerology.lifePath': 'जीवन पथ अंक',
  'numerology.destiny': 'भाग्य अंक',
  'numerology.soul': 'आत्मा अंक',

  // ── वक्री / साढ़े साती ────────────────────────────────────────────────
  'retrograde.title': 'वक्री ग्रह',
  'retrograde.none': 'अभी कोई ग्रह वक्री नहीं है।',
  'sadesati.title': 'साढ़े साती',
  'sadesati.active': 'साढ़े साती सक्रिय है',
  'sadesati.inactive': 'अभी साढ़े साती सक्रिय नहीं है',

  // ── कुंडली फ़ॉर्म ─────────────────────────────────────────────────────
  'profile.title': 'आपका जन्म विवरण',
  'profile.name': 'पूरा नाम',
  'profile.gender': 'लिंग',
  'profile.dob': 'जन्म तिथि',
  'profile.tob': 'जन्म समय',
  'profile.place': 'जन्म स्थान',
  'profile.male': 'पुरुष',
  'profile.female': 'महिला',
  'profile.other': 'अन्य',
  'profile.save': 'सहेजें और आगे बढ़ें',
  'profile.chart': 'जन्म कुंडली',
  'profile.lagna': 'लग्न',
  'profile.moonSign': 'चंद्र राशि',
  'profile.sunSign': 'सूर्य राशि',
  'profile.nakshatra': 'नक्षत्र',
  'profile.generateDetailed': 'विस्तृत कुंडली बनाएं',
};

const TABLES: Record<Lang, Dict> = { en, hi };

/** Translate `key` for `lang`, filling `{var}` placeholders. Falls back to
 *  English, then to the key itself, so a missing string is never a crash. */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const table = TABLES[lang] ?? en;
  let str = table[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}
