// sadeSatiPhases — STATIC, pre-written, deliberately CALM and NON-ALARMIST copy for
// the Sade Sati Tracker. Written ONCE, never AI-generated. Sade Sati causes real
// anxiety, so every line here is constructive and matter-of-fact: "a period of change
// and growth," never "suffering." No remedies-for-purchase, no gemstones, no products.

export type SadePhase = 1 | 2 | 3; // 1 = rising (12th from Moon), 2 = peak (1st), 3 = setting (2nd)

export const PHASE_LABEL: Record<SadePhase, string> = {
  1: 'Rising phase',
  2: 'Peak phase',
  3: 'Setting phase',
};

// Which house-from-Moon each phase corresponds to (for the sub-line).
export const PHASE_HOUSE: Record<SadePhase, string> = {
  1: 'Shani in the 12th from your Chandra',
  2: 'Shani over your Chandra (1st)',
  3: 'Shani in the 2nd from your Chandra',
};

export const PHASE_MEANING: Record<SadePhase, string> = {
  1:
    'This is the opening phase, as Shani enters the sign before your Moon. Life often asks ' +
    'you to slow down, let go of what is no longer needed and become more self-reliant. It ' +
    'can feel like a quieter, more inward time — think of it as clearing space and building ' +
    'patience for the years ahead. Steady routines and honest reflection carry you through it well.',
  2:
    'This is the central phase, with Shani moving over your Moon sign itself. It tends to be ' +
    'the most significant stretch — a period of change, responsibility and real personal ' +
    'growth. Shani rewards discipline, sincerity and hard work, so effort you put in now tends ' +
    'to build lasting foundations. Be kind to yourself, keep your commitments simple, and lean ' +
    'on the people who support you.',
  3:
    'This is the closing phase, as Shani moves into the sign after your Moon. The intensity ' +
    'gradually eases and the lessons of the past years begin to settle into wisdom and ' +
    'stability. It is a time to consolidate, tie up loose ends and appreciate how much you ' +
    'have matured. Better rhythm and lighter energy return as this phase completes.',
};

// Shown when the user is NOT in Sade Sati.
export const NOT_IN_SADE_SATI =
  'You are not in Sade Sati right now. Shani is not transiting the signs around your ' +
  'Chandra (Moon), so this particular cycle is not active for you at present.';

// General one-liner shown under the title on the detail screen.
export const SADE_SATI_INTRO =
  'Sade Sati is the roughly seven-and-a-half year transit of Shani through the sign before ' +
  'your Moon, your Moon sign, and the sign after — traditionally a time of change, ' +
  'responsibility and steady growth. Here is exactly where you stand in the cycle.';

// ── Hindi (Devanagari) variants ──────────────────────────────────────────────
export const PHASE_HOUSE_HI: Record<SadePhase, string> = {
  1: 'शनि आपके चंद्रमा से 12वें भाव में',
  2: 'शनि आपके चंद्रमा पर (पहला भाव)',
  3: 'शनि आपके चंद्रमा से दूसरे भाव में',
};

export const PHASE_MEANING_HI: Record<SadePhase, string> = {
  1:
    'यह आरंभिक चरण है, जब शनि आपके चंद्रमा से पहले वाली राशि में प्रवेश करते हैं। जीवन अक्सर आपसे ' +
    'गति धीमी करने, जो अब आवश्यक नहीं उसे छोड़ने और अधिक आत्मनिर्भर बनने को कहता है। यह एक शांत, ' +
    'अधिक अंतर्मुखी समय जैसा लग सकता है — इसे आने वाले वर्षों के लिए स्थान बनाने और धैर्य विकसित करने ' +
    'के रूप में देखें। स्थिर दिनचर्या और ईमानदार आत्मचिंतन आपको इससे अच्छी तरह पार ले जाते हैं।',
  2:
    'यह केंद्रीय चरण है, जब शनि स्वयं आपकी चंद्र राशि पर से गुज़रते हैं। यह आमतौर पर सबसे महत्वपूर्ण ' +
    'दौर होता है — परिवर्तन, ज़िम्मेदारी और वास्तविक व्यक्तिगत विकास की अवधि। शनि अनुशासन, ईमानदारी और ' +
    'परिश्रम को पुरस्कृत करते हैं, इसलिए अभी किया गया प्रयास स्थायी नींव बनाता है। स्वयं के प्रति दयालु ' +
    'रहें, अपने वादे सरल रखें, और उन लोगों का सहारा लें जो आपका साथ देते हैं।',
  3:
    'यह समापन चरण है, जब शनि आपके चंद्रमा के बाद वाली राशि में जाते हैं। तीव्रता धीरे-धीरे कम होती है ' +
    'और बीते वर्षों के अनुभव ज्ञान और स्थिरता में ढलने लगते हैं। यह समेटने, अधूरे कार्य पूरे करने और यह ' +
    'सराहने का समय है कि आप कितना परिपक्व हुए हैं। इस चरण के पूरा होते ही बेहतर लय और हल्की ऊर्जा लौटती है।',
};

export const NOT_IN_SADE_SATI_HI =
  'अभी आप साढ़े साती में नहीं हैं। शनि आपके चंद्रमा के आस-पास की राशियों से गोचर नहीं कर रहे, इसलिए ' +
  'यह विशेष चक्र वर्तमान में आपके लिए सक्रिय नहीं है।';

export const SADE_SATI_INTRO_HI =
  'साढ़े साती शनि का लगभग साढ़े सात वर्ष का गोचर है — आपके चंद्रमा से पहले वाली राशि, आपकी चंद्र राशि, ' +
  'और उसके बाद वाली राशि से — परंपरागत रूप से परिवर्तन, ज़िम्मेदारी और स्थिर विकास का समय। यहाँ देखें कि ' +
  'आप इस चक्र में ठीक कहाँ खड़े हैं।';
