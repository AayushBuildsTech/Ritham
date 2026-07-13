// numerology — FIXED, pre-written interpretation library.
//
// This is a static table, NOT AI output. The numerology feature computes a
// number (1–9, 11, 22, 33) in plain code (lib/numerology.ts) and serves the
// matching entry below. No Claude/OpenAI call is ever made for these meanings.
//
// One entry per possible number. `keyword` is a one-line essence; `life_path`
// and `expression` give the reading framed for each core number.

export interface NumerologyMeaning {
  title: string;    // e.g. 'The Leader'
  keyword: string;  // short essence
  life_path: string;
  expression: string;
}

export const NUMEROLOGY_MEANINGS: Record<number, NumerologyMeaning> = {
  1: {
    title: 'The Pioneer',
    keyword: 'Independence · initiative · leadership',
    life_path:
      'Your path is one of self-reliance and new beginnings. You are here to lead rather than follow — ' +
      'to start things others only talk about. Cultivate patience with those who move slower, and let ' +
      'confidence, not ego, guide your ambition.',
    expression:
      'You express yourself with originality and drive. People sense a natural authority in you and look ' +
      'to you to set direction. Your gift is turning ideas into action.',
  },
  2: {
    title: 'The Peacemaker',
    keyword: 'Harmony · sensitivity · partnership',
    life_path:
      'Your path flows through relationship, cooperation and quiet diplomacy. You sense what others feel ' +
      'and bring balance where there is tension. Guard against losing yourself in others’ needs — your ' +
      'gentleness is a strength, not a weakness.',
    expression:
      'You express yourself through tact, warmth and the ability to unite people. You are the trusted ' +
      'confidant and the steady hand behind harmonious teams.',
  },
  3: {
    title: 'The Communicator',
    keyword: 'Creativity · expression · joy',
    life_path:
      'Your path is lit by creativity and self-expression. Words, art and warmth flow through you, and ' +
      'you lift the spirits of those around you. Focus your many talents rather than scattering them, and ' +
      'your light becomes a beacon.',
    expression:
      'You express yourself with charm, humour and imagination. You are a natural storyteller who makes ' +
      'others feel seen and uplifted.',
  },
  4: {
    title: 'The Builder',
    keyword: 'Stability · discipline · foundation',
    life_path:
      'Your path is one of patient building — laying strong foundations others can rely on. Order, effort ' +
      'and integrity are your tools. Allow room for flexibility and rest; your steadiness is what makes ' +
      'lasting things possible.',
    expression:
      'You express yourself through diligence, structure and dependability. When you commit, it is built ' +
      'to last, and people trust you to see it through.',
  },
  5: {
    title: 'The Explorer',
    keyword: 'Freedom · change · adventure',
    life_path:
      'Your path is movement, curiosity and change. You are here to experience life fully and to adapt ' +
      'with grace. Channel your restlessness into meaningful discovery rather than distraction, and ' +
      'freedom becomes wisdom.',
    expression:
      'You express yourself with versatility, wit and a love of new experience. You bring energy and fresh ' +
      'perspective wherever you go.',
  },
  6: {
    title: 'The Nurturer',
    keyword: 'Responsibility · love · service',
    life_path:
      'Your path centres on care, family and responsibility. You are drawn to heal, protect and beautify ' +
      'the lives around you. Remember to receive as generously as you give, and your home becomes a source ' +
      'of strength for many.',
    expression:
      'You express yourself through compassion, loyalty and a natural sense of duty. People feel safe and ' +
      'cared for in your presence.',
  },
  7: {
    title: 'The Seeker',
    keyword: 'Wisdom · introspection · spirituality',
    life_path:
      'Your path turns inward — toward knowledge, reflection and the search for deeper truth. Solitude ' +
      'renews you and insight is your gift. Share what you learn rather than withdrawing, and you become ' +
      'a quiet teacher.',
    expression:
      'You express yourself through depth, analysis and a contemplative mind. You see beneath the surface ' +
      'and value substance over show.',
  },
  8: {
    title: 'The Achiever',
    keyword: 'Power · abundance · mastery',
    life_path:
      'Your path is one of ambition, material mastery and influence. You are here to achieve and to manage ' +
      'resources wisely. Balance drive with generosity and ethics, and success flows naturally and ' +
      'sustainably.',
    expression:
      'You express yourself through leadership, resilience and a talent for turning vision into results. ' +
      'You command respect and handle responsibility with confidence.',
  },
  9: {
    title: 'The Humanitarian',
    keyword: 'Compassion · idealism · completion',
    life_path:
      'Your path is broad and giving — service to humanity and the wisdom of letting go. You feel deeply ' +
      'and dream of a better world. Learn to release what has run its course, and your compassion touches ' +
      'many lives.',
    expression:
      'You express yourself through generosity, artistry and a wide, embracing heart. You inspire others ' +
      'toward their higher potential.',
  },
  11: {
    title: 'The Visionary (Master)',
    keyword: 'Intuition · inspiration · illumination',
    life_path:
      'As a master number, 11 carries the sensitivity of 2 raised to a spiritual octave. Your path is one ' +
      'of intuition, inspiration and inner light — you are here to uplift and illuminate. Ground your ' +
      'high sensitivity in daily practice, and you become a source of guidance for others.',
    expression:
      'You express yourself through intuition, idealism and an almost electric inspiration. People are ' +
      'moved and awakened by your presence.',
  },
  22: {
    title: 'The Master Builder (Master)',
    keyword: 'Vision · manifestation · legacy',
    life_path:
      'As a master number, 22 unites the dreamer and the builder. Your path is to turn great visions into ' +
      'concrete reality that serves many. The potential is vast — meet it with discipline and patience, ' +
      'and you can build something that outlasts you.',
    expression:
      'You express yourself through large-scale vision matched with practical mastery. You can architect ' +
      'lasting institutions and ideas.',
  },
  33: {
    title: 'The Master Teacher (Master)',
    keyword: 'Compassion · healing · devotion',
    life_path:
      'As the rarest master number, 33 is the number of selfless love and spiritual teaching. Your path ' +
      'is one of nurturing on a wide scale — healing, guiding and giving without seeking reward. Care for ' +
      'yourself as devotedly as you care for others.',
    expression:
      'You express yourself through profound compassion, wisdom and the gift of uplifting whole ' +
      'communities. You teach most powerfully by example.',
  },
};

export function meaningFor(n: number): NumerologyMeaning | null {
  return NUMEROLOGY_MEANINGS[n] ?? null;
}

// ── Hindi (Devanagari) meanings ──────────────────────────────────────────────
export const NUMEROLOGY_MEANINGS_HI: Record<number, NumerologyMeaning> = {
  1: {
    title: 'अग्रणी',
    keyword: 'स्वतंत्रता · पहल · नेतृत्व',
    life_path:
      'आपका पथ आत्मनिर्भरता और नई शुरुआत का है। आप अनुसरण करने के बजाय नेतृत्व करने आए हैं — वह शुरू करने ' +
      'के लिए जो दूसरे केवल सोचते हैं। धीमे चलने वालों के प्रति धैर्य रखें, और अहंकार नहीं बल्कि आत्मविश्वास ' +
      'को अपनी महत्वाकांक्षा का मार्गदर्शक बनने दें।',
    expression:
      'आप मौलिकता और प्रेरणा से स्वयं को व्यक्त करते हैं। लोग आप में स्वाभाविक अधिकार महसूस करते हैं और ' +
      'दिशा के लिए आपकी ओर देखते हैं। आपकी देन विचारों को कर्म में बदलना है।',
  },
  2: {
    title: 'शांतिदूत',
    keyword: 'सामंजस्य · संवेदनशीलता · साझेदारी',
    life_path:
      'आपका पथ संबंध, सहयोग और शांत कूटनीति से बहता है। आप दूसरों की भावनाएं भाँपते हैं और तनाव में ' +
      'संतुलन लाते हैं। दूसरों की ज़रूरतों में स्वयं को खोने से बचें — आपकी कोमलता एक शक्ति है, कमज़ोरी नहीं।',
    expression:
      'आप चातुर्य, गर्मजोशी और लोगों को जोड़ने की क्षमता से स्वयं को व्यक्त करते हैं। आप विश्वसनीय ' +
      'सलाहकार और सामंजस्यपूर्ण टीमों के पीछे का स्थिर हाथ हैं।',
  },
  3: {
    title: 'संवादकर्ता',
    keyword: 'रचनात्मकता · अभिव्यक्ति · आनंद',
    life_path:
      'आपका पथ रचनात्मकता और आत्म-अभिव्यक्ति से प्रकाशित है। शब्द, कला और गर्मजोशी आप में बहती है, और ' +
      'आप अपने आस-पास के लोगों का उत्साह बढ़ाते हैं। अपनी अनेक प्रतिभाओं को बिखेरने के बजाय केंद्रित करें, ' +
      'और आपकी रोशनी एक दीपस्तंभ बन जाती है।',
    expression:
      'आप आकर्षण, हास्य और कल्पना से स्वयं को व्यक्त करते हैं। आप एक स्वाभाविक कहानीकार हैं जो दूसरों को ' +
      'महसूस कराते और उत्साहित करते हैं।',
  },
  4: {
    title: 'निर्माता',
    keyword: 'स्थिरता · अनुशासन · नींव',
    life_path:
      'आपका पथ धैर्यपूर्वक निर्माण का है — मज़बूत नींव रखने का जिन पर दूसरे भरोसा कर सकें। व्यवस्था, प्रयास ' +
      'और सत्यनिष्ठा आपके साधन हैं। लचीलेपन और विश्राम के लिए स्थान रखें; आपकी दृढ़ता ही स्थायी चीज़ों को ' +
      'संभव बनाती है।',
    expression:
      'आप परिश्रम, संरचना और विश्वसनीयता से स्वयं को व्यक्त करते हैं। जब आप प्रतिबद्ध होते हैं, तो वह ' +
      'टिकाऊ बनता है, और लोग उसे पूरा करने के लिए आप पर भरोसा करते हैं।',
  },
  5: {
    title: 'अन्वेषक',
    keyword: 'स्वतंत्रता · परिवर्तन · साहस',
    life_path:
      'आपका पथ गति, जिज्ञासा और परिवर्तन है। आप जीवन को पूरी तरह अनुभव करने और सहजता से ढलने आए हैं। ' +
      'अपनी बेचैनी को विचलन के बजाय सार्थक खोज में लगाएं, और स्वतंत्रता ज्ञान बन जाती है।',
    expression:
      'आप बहुमुखी प्रतिभा, चतुराई और नए अनुभव के प्रेम से स्वयं को व्यक्त करते हैं। आप जहाँ भी जाते हैं ' +
      'ऊर्जा और नया दृष्टिकोण लाते हैं।',
  },
  6: {
    title: 'पोषक',
    keyword: 'ज़िम्मेदारी · प्रेम · सेवा',
    life_path:
      'आपका पथ देखभाल, परिवार और ज़िम्मेदारी पर केंद्रित है। आप अपने आस-पास के जीवन को सँवारने, बचाने और ' +
      'सुंदर बनाने की ओर आकर्षित होते हैं। जितनी उदारता से देते हैं उतनी ही उदारता से पाना भी सीखें, और ' +
      'आपका घर अनेकों के लिए शक्ति का स्रोत बन जाता है।',
    expression:
      'आप करुणा, निष्ठा और कर्तव्य की स्वाभाविक भावना से स्वयं को व्यक्त करते हैं। लोग आपकी उपस्थिति में ' +
      'सुरक्षित और देखभाल में महसूस करते हैं।',
  },
  7: {
    title: 'साधक',
    keyword: 'ज्ञान · आत्मचिंतन · आध्यात्मिकता',
    life_path:
      'आपका पथ भीतर की ओर मुड़ता है — ज्ञान, चिंतन और गहरे सत्य की खोज की ओर। एकांत आपको नवीन करता है ' +
      'और अंतर्दृष्टि आपकी देन है। जो सीखते हैं उसे अपने भीतर समेटने के बजाय बाँटें, और आप एक शांत शिक्षक ' +
      'बन जाते हैं।',
    expression:
      'आप गहराई, विश्लेषण और चिंतनशील मन से स्वयं को व्यक्त करते हैं। आप सतह के नीचे देखते हैं और दिखावे ' +
      'से अधिक सार को महत्व देते हैं।',
  },
  8: {
    title: 'सफलता प्राप्तकर्ता',
    keyword: 'शक्ति · समृद्धि · निपुणता',
    life_path:
      'आपका पथ महत्वाकांक्षा, भौतिक निपुणता और प्रभाव का है। आप उपलब्धि हासिल करने और संसाधनों को ' +
      'बुद्धिमानी से संभालने आए हैं। प्रेरणा को उदारता और नैतिकता के साथ संतुलित करें, और सफलता स्वाभाविक ' +
      'और स्थायी रूप से बहती है।',
    expression:
      'आप नेतृत्व, दृढ़ता और दृष्टि को परिणाम में बदलने की प्रतिभा से स्वयं को व्यक्त करते हैं। आप सम्मान ' +
      'अर्जित करते हैं और ज़िम्मेदारी को आत्मविश्वास से संभालते हैं।',
  },
  9: {
    title: 'मानवतावादी',
    keyword: 'करुणा · आदर्शवाद · पूर्णता',
    life_path:
      'आपका पथ व्यापक और उदार है — मानवता की सेवा और त्याग का ज्ञान। आप गहराई से महसूस करते हैं और एक ' +
      'बेहतर संसार का सपना देखते हैं। जो समाप्त हो चुका है उसे छोड़ना सीखें, और आपकी करुणा अनेक जीवनों को ' +
      'छूती है।',
    expression:
      'आप उदारता, कलात्मकता और विशाल, समावेशी हृदय से स्वयं को व्यक्त करते हैं। आप दूसरों को उनकी उच्च ' +
      'संभावना की ओर प्रेरित करते हैं।',
  },
  11: {
    title: 'दूरदर्शी (मास्टर)',
    keyword: 'अंतर्ज्ञान · प्रेरणा · प्रकाश',
    life_path:
      'एक मास्टर अंक के रूप में, 11 अंक 2 की संवेदनशीलता को आध्यात्मिक ऊँचाई तक ले जाता है। आपका पथ ' +
      'अंतर्ज्ञान, प्रेरणा और भीतरी प्रकाश का है — आप उत्थान और प्रकाश देने आए हैं। अपनी उच्च संवेदनशीलता ' +
      'को दैनिक अभ्यास में स्थिर करें, और आप दूसरों के लिए मार्गदर्शन का स्रोत बन जाते हैं।',
    expression:
      'आप अंतर्ज्ञान, आदर्शवाद और लगभग विद्युत जैसी प्रेरणा से स्वयं को व्यक्त करते हैं। लोग आपकी उपस्थिति ' +
      'से प्रभावित और जागृत होते हैं।',
  },
  22: {
    title: 'महान निर्माता (मास्टर)',
    keyword: 'दृष्टि · साकार · विरासत',
    life_path:
      'एक मास्टर अंक के रूप में, 22 स्वप्नदर्शी और निर्माता को जोड़ता है। आपका पथ महान दृष्टियों को ठोस ' +
      'वास्तविकता में बदलना है जो अनेकों की सेवा करे। संभावना विशाल है — इसे अनुशासन और धैर्य से पूरा करें, ' +
      'और आप कुछ ऐसा बना सकते हैं जो आपके बाद भी बना रहे।',
    expression:
      'आप बड़े पैमाने की दृष्टि को व्यावहारिक निपुणता के साथ मिलाकर स्वयं को व्यक्त करते हैं। आप स्थायी ' +
      'संस्थान और विचार गढ़ सकते हैं।',
  },
  33: {
    title: 'महान शिक्षक (मास्टर)',
    keyword: 'करुणा · उपचार · समर्पण',
    life_path:
      'सबसे दुर्लभ मास्टर अंक के रूप में, 33 निःस्वार्थ प्रेम और आध्यात्मिक शिक्षण का अंक है। आपका पथ ' +
      'व्यापक स्तर पर पोषण का है — उपचार, मार्गदर्शन और बिना प्रतिफल की चाह के देने का। जितने समर्पण से ' +
      'दूसरों की देखभाल करते हैं उतने ही समर्पण से अपनी भी करें।',
    expression:
      'आप गहन करुणा, ज्ञान और पूरे समुदायों को उत्थान देने की देन से स्वयं को व्यक्त करते हैं। आप उदाहरण ' +
      'से सबसे प्रभावी शिक्षा देते हैं।',
  },
};

export function meaningForHi(n: number): NumerologyMeaning | null {
  return NUMEROLOGY_MEANINGS_HI[n] ?? null;
}
