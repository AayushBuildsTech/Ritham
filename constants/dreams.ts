// dreams — FIXED, pre-written Swapna Shastra (dream-omen) library.
//
// This is a static, curated table drawn from classical Indian dream lore
// (swapna phala) — NOT AI output. The Dream feature lets a user pick the symbol
// they saw; we serve the matching entry below and layer on the prahar (quarter
// of the night) timing rule and the day's Panchang. No Claude/OpenAI call is
// ever made, and there is no per-use cost.
//
// Tone follows the rest of the app (see vedastro.ts): hopeful framing, cautions
// worded gently and never fear-mongering. `nature` colours the card; `omen` is a
// one-line essence; `reading` is the fuller traditional interpretation.

import type { IconName } from '../components/Icon';
import type { AccentName } from './theme';

export type DreamNature = 'auspicious' | 'caution' | 'neutral';

export interface DreamSymbol {
  id: string;
  en: string;          // display name, English
  hi: string;          // display name, Hindi
  keywords: string[];  // extra search terms (lowercase, English + transliterations)
  nature: DreamNature;
  omen: string;        // one-line essence (EN)
  omenHi: string;      // one-line essence (HI)
  reading: string;     // fuller interpretation (EN)
  readingHi: string;   // fuller interpretation (HI)
}

// ── The symbol library ──────────────────────────────────────────────────────
export const DREAM_SYMBOLS: DreamSymbol[] = [
  {
    id: 'snake', en: 'Snake', hi: 'साँप', keywords: ['serpent', 'naag', 'cobra', 'bite', 'saap'],
    nature: 'auspicious',
    omen: 'Hidden gain and unexpected money',
    omenHi: 'गुप्त लाभ और अप्रत्याशित धन',
    reading: 'In classical swapna phala a snake — even one that bites — is a fortunate sign, pointing to hidden wealth, a rise in status, or the shedding of an old fear. What looks threatening in the dream often brings gain in waking life.',
    readingHi: 'शास्त्रों में साँप — काटने वाला भी — शुभ माना गया है। यह गुप्त धन, मान-सम्मान में वृद्धि या किसी पुराने भय के त्याग का संकेत देता है।',
  },
  {
    id: 'water_clear', en: 'Clear water / River', hi: 'स्वच्छ जल / नदी', keywords: ['river', 'lake', 'ocean', 'sea', 'jal', 'nadi', 'clean water'],
    nature: 'auspicious',
    omen: 'Emotional cleansing and prosperity',
    omenHi: 'भावनात्मक शुद्धि और समृद्धि',
    reading: 'Clear, flowing water is one of the most favourable dream signs — it foretells peace of mind, prosperity and a fresh emotional start. Bathing in or crossing it safely doubles the good omen.',
    readingHi: 'स्वच्छ बहता जल सबसे शुभ स्वप्न-संकेतों में से एक है — यह मन की शांति, समृद्धि और नई शुरुआत का प्रतीक है। उसमें स्नान या सुरक्षित पार होना और भी शुभ है।',
  },
  {
    id: 'water_muddy', en: 'Muddy / dirty water', hi: 'गंदा जल', keywords: ['dirty water', 'flood', 'murky', 'ganda pani'],
    nature: 'caution',
    omen: 'Passing confusion — guard your calm',
    omenHi: 'क्षणिक भ्रम — अपनी शांति की रक्षा करें',
    reading: 'Murky or stormy water suggests a spell of confusion or a small worry around money or relationships. It is a passing tide — keep your decisions simple until the water clears.',
    readingHi: 'गंदा या उफनता जल किसी उलझन या धन-संबंध की छोटी चिंता का संकेत है। यह क्षणिक है — जब तक स्थिति स्पष्ट न हो, निर्णय सरल रखें।',
  },
  {
    id: 'elephant', en: 'Elephant', hi: 'हाथी', keywords: ['hathi', 'gajah', 'tusker'],
    nature: 'auspicious',
    omen: 'Dignity, status and steady rise',
    omenHi: 'गरिमा, प्रतिष्ठा और स्थिर उन्नति',
    reading: 'An elephant is a royal, deeply auspicious symbol — Gajalakshmi herself. It foretells honour, a rise in standing and slow but unshakeable success. Riding one is especially fortunate.',
    readingHi: 'हाथी अत्यंत शुभ और राजसी प्रतीक है — गजलक्ष्मी का रूप। यह सम्मान, प्रतिष्ठा में वृद्धि और स्थिर सफलता का संकेत है। उस पर सवारी विशेष शुभ है।',
  },
  {
    id: 'temple', en: 'Temple / deity', hi: 'मंदिर / देवता', keywords: ['god', 'goddess', 'mandir', 'darshan', 'bhagwan', 'deity', 'idol'],
    nature: 'auspicious',
    omen: 'Blessings and divine protection',
    omenHi: 'आशीर्वाद और दैवीय रक्षा',
    reading: 'Darshan of a temple or deity in a dream is a blessing — a sign of grace, protection and that a prayer is being answered. It often comes before a turn for the better.',
    readingHi: 'स्वप्न में मंदिर या देवता का दर्शन आशीर्वाद है — कृपा, रक्षा और किसी प्रार्थना के फलित होने का संकेत। यह प्रायः शुभ परिवर्तन से पहले आता है।',
  },
  {
    id: 'fire', en: 'Fire', hi: 'अग्नि', keywords: ['agni', 'flame', 'aag', 'burning'],
    nature: 'neutral',
    omen: 'Transformation and rising energy',
    omenHi: 'परिवर्तन और बढ़ती ऊर्जा',
    reading: 'A steady, contained fire is auspicious — it signals purification, energy and a powerful transformation ahead. A wild, spreading fire asks you to channel that intensity carefully.',
    readingHi: 'शांत, सीमित अग्नि शुभ है — यह शुद्धि, ऊर्जा और आने वाले सशक्त परिवर्तन का संकेत है। बेकाबू फैलती आग उस तीव्रता को संभलकर दिशा देने को कहती है।',
  },
  {
    id: 'flying', en: 'Flying', hi: 'उड़ना', keywords: ['fly', 'floating', 'sky', 'udna'],
    nature: 'auspicious',
    omen: 'Freedom and rising ambition',
    omenHi: 'स्वतंत्रता और बढ़ती महत्वाकांक्षा',
    reading: 'To fly is to rise above limits — a sign of ambition finding its wings, of freedom from something that held you down, and of goals coming within reach.',
    readingHi: 'उड़ना सीमाओं से ऊपर उठना है — यह महत्वाकांक्षा को पंख मिलने, किसी बंधन से मुक्ति और लक्ष्यों के निकट आने का संकेत है।',
  },
  {
    id: 'falling', en: 'Falling', hi: 'गिरना', keywords: ['fall', 'drop', 'girna'],
    nature: 'caution',
    omen: 'A passing loss of footing',
    omenHi: 'क्षणिक असंतुलन',
    reading: 'Falling reflects a moment of insecurity or a fear of losing control. It is rarely literal — steady one area of life that feels shaky and the ground firms up again quickly.',
    readingHi: 'गिरना असुरक्षा या नियंत्रण खोने के भय को दर्शाता है। यह प्रायः शाब्दिक नहीं होता — जीवन के जिस हिस्से में डगमगाहट है उसे संभालें, ज़मीन शीघ्र स्थिर हो जाती है।',
  },
  {
    id: 'teeth', en: 'Teeth falling out', hi: 'दांत गिरना', keywords: ['tooth', 'teeth', 'daant'],
    nature: 'caution',
    omen: 'Worry over a change at home',
    omenHi: 'घर में किसी बदलाव की चिंता',
    reading: 'Losing teeth traditionally mirrors anxiety about a change among family or a fear of ageing. The worry usually proves larger in the dream than in life — tend to loved ones and it eases.',
    readingHi: 'दांत गिरना परिवार में किसी बदलाव की चिंता या उम्र के भय को दर्शाता है। यह चिंता स्वप्न में जितनी बड़ी लगती है, जीवन में उतनी नहीं — अपनों का ध्यान रखें, यह शांत हो जाती है।',
  },
  {
    id: 'death_self', en: 'Your own death', hi: 'स्वयं की मृत्यु', keywords: ['dying', 'death', 'mrityu', 'die'],
    nature: 'auspicious',
    omen: 'Long life and a fresh chapter',
    omenHi: 'दीर्घायु और नया अध्याय',
    reading: 'Contrary to fear, dreaming of your own death is a good omen — it signals long life, the end of a difficult phase and rebirth into a new chapter. Something old is making room for something better.',
    readingHi: 'भय के विपरीत, अपनी मृत्यु का स्वप्न शुभ है — यह दीर्घायु, किसी कठिन दौर के अंत और नए अध्याय में पुनर्जन्म का संकेत है। कुछ पुराना, कुछ बेहतर के लिए जगह बना रहा है।',
  },
  {
    id: 'wedding', en: 'Wedding', hi: 'विवाह', keywords: ['marriage', 'shaadi', 'vivah', 'bride', 'groom'],
    nature: 'neutral',
    omen: 'Union, celebration and new duty',
    omenHi: 'मिलन, उत्सव और नया दायित्व',
    reading: 'A wedding points to union, joyful news or the joining of two paths. Occasionally it hints at a new responsibility arriving — welcome, but asking for your care.',
    readingHi: 'विवाह मिलन, आनंददायक समाचार या दो राहों के जुड़ने का संकेत है। कभी-कभी यह किसी नए दायित्व के आने का भी संकेत देता है।',
  },
  {
    id: 'cow', en: 'Cow', hi: 'गाय', keywords: ['gaay', 'cattle', 'calf'],
    nature: 'auspicious',
    omen: 'Nourishment, wealth and grace',
    omenHi: 'पोषण, धन और कृपा',
    reading: 'The cow is sacred and wholly auspicious — a sign of abundance, nourishment, motherly grace and steady prosperity. A cow with a calf multiplies the blessing.',
    readingHi: 'गाय पवित्र और पूर्णतः शुभ है — यह प्रचुरता, पोषण, मातृवत कृपा और स्थिर समृद्धि का संकेत है। बछड़े सहित गाय आशीर्वाद को बढ़ा देती है।',
  },
  {
    id: 'gold', en: 'Gold / jewels', hi: 'सोना / आभूषण', keywords: ['jewellery', 'jewelry', 'ornament', 'sona', 'gehna', 'diamond'],
    nature: 'auspicious',
    omen: 'Gain — held with a light hand',
    omenHi: 'लाभ — पर संयम के साथ',
    reading: 'Gold and jewels foretell gain, recognition and good fortune. Receiving them is auspicious; the one caution is to hold the coming abundance lightly and share it well.',
    readingHi: 'सोना और आभूषण लाभ, प्रतिष्ठा और सौभाग्य का संकेत हैं। इन्हें पाना शुभ है; बस आने वाली समृद्धि को संयम से थामें और बाँटें।',
  },
  {
    id: 'money', en: 'Money', hi: 'धन / पैसा', keywords: ['cash', 'paisa', 'dhan', 'coins', 'wealth'],
    nature: 'auspicious',
    omen: 'Resources flowing toward you',
    omenHi: 'संसाधनों का आपकी ओर प्रवाह',
    reading: 'Handling or receiving money signals a flow of resources and opportunity coming your way. Even finding coins is a small, encouraging omen of increase.',
    readingHi: 'धन पाना या संभालना संसाधनों और अवसरों के आपकी ओर आने का संकेत है। सिक्के मिलना भी वृद्धि का छोटा शुभ संकेत है।',
  },
  {
    id: 'mountain', en: 'Climbing a mountain', hi: 'पर्वत चढ़ना', keywords: ['hill', 'climb', 'parvat', 'pahad', 'summit'],
    nature: 'auspicious',
    omen: 'Progress toward a hard-won goal',
    omenHi: 'कठिन लक्ष्य की ओर प्रगति',
    reading: 'Climbing high ground is a classic sign of ambition and steady progress. Reaching a summit foretells a goal achieved after real effort — keep going, the climb is worth it.',
    readingHi: 'ऊँचाई पर चढ़ना महत्वाकांक्षा और स्थिर प्रगति का प्रतीक है। शिखर तक पहुँचना परिश्रम के बाद लक्ष्य-प्राप्ति का संकेत है — चलते रहें।',
  },
  {
    id: 'tree', en: 'Tree / fruit', hi: 'वृक्ष / फल', keywords: ['fruit', 'plant', 'ped', 'vriksh', 'phal', 'garden'],
    nature: 'auspicious',
    omen: 'Growth and reward for patience',
    omenHi: 'वृद्धि और धैर्य का फल',
    reading: 'A green, fruit-laden tree is deeply auspicious — a promise that patience is about to bear fruit, and that growth in family or work is taking root.',
    readingHi: 'हरा, फलों से लदा वृक्ष अत्यंत शुभ है — यह संकेत कि धैर्य शीघ्र फल देने वाला है और परिवार या कार्य में वृद्धि जड़ पकड़ रही है।',
  },
  {
    id: 'sun', en: 'Sun', hi: 'सूर्य', keywords: ['surya', 'sunrise', 'sunlight'],
    nature: 'auspicious',
    omen: 'Vitality, fame and clarity',
    omenHi: 'ओज, यश और स्पष्टता',
    reading: 'The sun is power, health and recognition. A bright rising sun foretells success coming into the open, renewed vitality and a clear path forward.',
    readingHi: 'सूर्य शक्ति, स्वास्थ्य और प्रतिष्ठा है। उगता तेजस्वी सूर्य सफलता के प्रकट होने, नए ओज और स्पष्ट मार्ग का संकेत है।',
  },
  {
    id: 'moon', en: 'Moon', hi: 'चंद्रमा', keywords: ['chandra', 'chand', 'moonlight'],
    nature: 'auspicious',
    omen: 'A calm mind and quiet fortune',
    omenHi: 'शांत मन और मौन सौभाग्य',
    reading: 'A full, clear moon soothes — it signals emotional calm, good fortune arriving gently, and support from women or elders in your life.',
    readingHi: 'पूर्ण, स्वच्छ चंद्रमा शांति देता है — यह भावनात्मक स्थिरता, कोमलता से आते सौभाग्य और जीवन में स्त्रियों या बड़ों के सहयोग का संकेत है।',
  },
  {
    id: 'lamp', en: 'Lamp / diya', hi: 'दीपक', keywords: ['diya', 'deepak', 'light', 'candle', 'flame'],
    nature: 'auspicious',
    omen: 'Knowledge, hope and an auspicious turn',
    omenHi: 'ज्ञान, आशा और शुभ मोड़',
    reading: 'A lit lamp dispels darkness — a sign of knowledge, hope and an auspicious beginning. Lighting one yourself foretells a wish moving toward fulfilment.',
    readingHi: 'जलता दीपक अंधकार हरता है — यह ज्ञान, आशा और शुभ आरंभ का संकेत है। स्वयं दीप जलाना किसी कामना के पूर्ण होने की ओर बढ़ने का संकेत है।',
  },
  {
    id: 'crying', en: 'Crying', hi: 'रोना', keywords: ['weeping', 'tears', 'rona', 'aansu'],
    nature: 'auspicious',
    omen: 'Release, and the relief that follows',
    omenHi: 'विमोचन और उसके बाद की राहत',
    reading: 'Weeping in a dream is, surprisingly, a relieving sign — it releases held grief and often precedes genuine happiness or the lifting of a burden.',
    readingHi: 'स्वप्न में रोना आश्चर्यजनक रूप से राहत का संकेत है — यह संचित पीड़ा को बहा देता है और प्रायः सच्चे सुख या किसी बोझ के हटने से पहले आता है।',
  },
  {
    id: 'chased', en: 'Being chased', hi: 'पीछा किया जाना', keywords: ['chase', 'running', 'pursued', 'peecha'],
    nature: 'caution',
    omen: 'A task you are avoiding',
    omenHi: 'कोई कार्य जिसे आप टाल रहे हैं',
    reading: 'Being chased usually mirrors something you are running from — a decision, a conversation, a worry. Turning to face it, even in small steps, brings surprising ease.',
    readingHi: 'पीछा किया जाना प्रायः किसी टाली जा रही बात — निर्णय, बातचीत या चिंता — को दर्शाता है। उसका सामना करना, छोटे कदमों से भी, अप्रत्याशित राहत देता है।',
  },
  {
    id: 'naked', en: 'Being naked in public', hi: 'सार्वजनिक रूप से नग्न', keywords: ['nude', 'undressed', 'exposed', 'nanga'],
    nature: 'caution',
    omen: 'A fear of being exposed',
    omenHi: 'उजागर होने का भय',
    reading: 'Nakedness in a crowd reflects a fear of judgement or of being seen unprepared. It asks for self-kindness — most people see far less of our flaws than we imagine.',
    readingHi: 'भीड़ में नग्नता निर्णय के भय या बिना तैयारी उजागर होने की चिंता दर्शाती है। यह स्वयं के प्रति कोमलता माँगती है — दूसरे हमारी कमियाँ उतनी नहीं देखते जितनी हम सोचते हैं।',
  },
  {
    id: 'dog', en: 'Dog', hi: 'कुत्ता', keywords: ['kutta', 'puppy', 'hound'],
    nature: 'auspicious',
    omen: 'Loyalty and a dependable ally',
    omenHi: 'निष्ठा और भरोसेमंद साथी',
    reading: 'A friendly dog signals loyalty, protection and a faithful friend by your side. Even a barking dog is often a guardian, warning you kindly rather than harming.',
    readingHi: 'मित्रवत कुत्ता निष्ठा, रक्षा और एक विश्वसनीय मित्र का संकेत है। भौंकता कुत्ता भी प्रायः रक्षक है, जो हानि नहीं, सचेत करता है।',
  },
  {
    id: 'horse', en: 'Horse / riding', hi: 'घोड़ा / सवारी', keywords: ['ghoda', 'riding', 'stallion', 'ride'],
    nature: 'auspicious',
    omen: 'Swift success and honour',
    omenHi: 'तीव्र सफलता और सम्मान',
    reading: 'A horse means speed and nobility; riding one foretells swift progress, travel or a rise in honour. A white horse is especially fortunate.',
    readingHi: 'घोड़ा गति और श्रेष्ठता है; उस पर सवारी तीव्र प्रगति, यात्रा या सम्मान-वृद्धि का संकेत है। श्वेत घोड़ा विशेष शुभ है।',
  },
  {
    id: 'bird', en: 'Bird', hi: 'पक्षी', keywords: ['birds', 'pakshi', 'flying bird', 'peacock', 'parrot'],
    nature: 'auspicious',
    omen: 'News, messages and hope',
    omenHi: 'समाचार, संदेश और आशा',
    reading: 'Birds carry messages — a sign of welcome news on the way, of hope taking flight and of freedom. A peacock or a pair of birds adds beauty and harmony to the omen.',
    readingHi: 'पक्षी संदेशवाहक हैं — यह आते शुभ समाचार, उड़ान भरती आशा और स्वतंत्रता का संकेत है। मोर या पक्षियों का जोड़ा इसमें सौंदर्य और सामंजस्य जोड़ता है।',
  },
  {
    id: 'crow', en: 'Crow', hi: 'कौआ', keywords: ['kauwa', 'raven', 'crows'],
    nature: 'caution',
    omen: 'Tend to small tensions early',
    omenHi: 'छोटे तनावों को समय रहते सुलझाएँ',
    reading: 'A crow is a minor, mixed omen — sometimes a message from ancestors, sometimes a nudge to settle a small tension before it grows. Nothing to fear; simply stay attentive.',
    readingHi: 'कौआ एक छोटा, मिश्रित संकेत है — कभी पितरों का संदेश, कभी किसी छोटे तनाव को बढ़ने से पहले सुलझाने का इशारा। भय की बात नहीं, बस सजग रहें।',
  },
  {
    id: 'flowers', en: 'Flowers', hi: 'फूल', keywords: ['flower', 'phool', 'blossom', 'garland', 'lotus'],
    nature: 'auspicious',
    omen: 'Joy, love and favourable timing',
    omenHi: 'आनंद, प्रेम और शुभ समय',
    reading: 'Blossoming flowers foretell joy, love and a season turning in your favour. A lotus or fresh garland is especially blessed, pointing to devotion rewarded.',
    readingHi: 'खिलते फूल आनंद, प्रेम और अनुकूल समय का संकेत हैं। कमल या ताज़ी माला विशेष शुभ है, जो भक्ति के फल का संकेत देती है।',
  },
  {
    id: 'child', en: 'A child / baby', hi: 'शिशु / बच्चा', keywords: ['baby', 'infant', 'bacha', 'shishu', 'newborn'],
    nature: 'auspicious',
    omen: 'New beginnings and pure potential',
    omenHi: 'नई शुरुआत और शुद्ध संभावना',
    reading: 'A baby is new life and fresh potential — a sign of a beginning, a project or a joy about to be born. Holding a happy child is wholly auspicious.',
    readingHi: 'शिशु नया जीवन और ताज़ी संभावना है — किसी आरंभ, कार्य या आने वाले सुख का संकेत। प्रसन्न बच्चे को गोद में लेना पूर्णतः शुभ है।',
  },
  {
    id: 'rain', en: 'Rain', hi: 'वर्षा', keywords: ['barish', 'varsha', 'raining', 'monsoon', 'shower'],
    nature: 'auspicious',
    omen: 'Renewal and abundance after waiting',
    omenHi: 'प्रतीक्षा के बाद नवीनीकरण और प्रचुरता',
    reading: 'Gentle rain foretells renewal, relief and abundance after a dry spell. It washes the old away and readies the ground for growth.',
    readingHi: 'कोमल वर्षा किसी सूखे दौर के बाद नवीनीकरण, राहत और प्रचुरता का संकेत है। यह पुराने को धोकर वृद्धि के लिए भूमि तैयार करती है।',
  },
  {
    id: 'boat', en: 'Crossing water by boat', hi: 'नाव से पार होना', keywords: ['boat', 'ship', 'nao', 'crossing', 'ferry'],
    nature: 'auspicious',
    omen: 'Overcoming an obstacle',
    omenHi: 'किसी बाधा से पार पाना',
    reading: 'Crossing water safely by boat is a strong sign of overcoming an obstacle and reaching a long-awaited goal. Reaching the far shore foretells success after a challenge.',
    readingHi: 'नाव से जल को सुरक्षित पार करना किसी बाधा से पार पाकर लक्ष्य तक पहुँचने का सशक्त संकेत है। दूसरे तट पर पहुँचना चुनौती के बाद सफलता का संकेत है।',
  },
  {
    id: 'hair_cut', en: 'Hair being cut', hi: 'बाल कटना', keywords: ['haircut', 'hair', 'baal', 'shaved', 'losing hair'],
    nature: 'caution',
    omen: 'A needed release, though it stings',
    omenHi: 'आवश्यक त्याग, भले ही कठिन लगे',
    reading: 'Hair being cut or lost can mirror worry over image or a sense of losing strength. Yet it often marks a needed release — letting go of what no longer serves you.',
    readingHi: 'बाल कटना या झड़ना छवि की चिंता या शक्ति खोने का भाव दर्शा सकता है। फिर भी यह प्रायः एक आवश्यक त्याग है — जो अब उपयोगी नहीं, उसे छोड़ना।',
  },
  {
    id: 'lost', en: 'Being lost', hi: 'रास्ता भटकना', keywords: ['lost', 'wandering', 'bhatakna', 'no way', 'maze'],
    nature: 'caution',
    omen: 'A pause to find your direction',
    omenHi: 'दिशा खोजने का विराम',
    reading: 'Losing your way reflects a moment of uncertainty about direction. Treat it as a pause, not a dead end — clarity returns once you slow down and choose one next step.',
    readingHi: 'रास्ता भटकना दिशा को लेकर अनिश्चितता का क्षण है। इसे अंत नहीं, विराम मानें — जैसे ही आप ठहरकर एक अगला कदम चुनते हैं, स्पष्टता लौट आती है।',
  },
  {
    id: 'food', en: 'Eating / feast', hi: 'भोजन / दावत', keywords: ['eating', 'feast', 'bhojan', 'khana', 'sweets', 'meal'],
    nature: 'auspicious',
    omen: 'Contentment and coming plenty',
    omenHi: 'संतोष और आती प्रचुरता',
    reading: 'Eating good food or sharing a feast foretells contentment, hospitality and material plenty. Sweets especially point to celebration and happy news.',
    readingHi: 'अच्छा भोजन करना या दावत बाँटना संतोष, आतिथ्य और भौतिक प्रचुरता का संकेत है। मिठाई विशेषकर उत्सव और शुभ समाचार का संकेत देती है।',
  },
  {
    id: 'white_cloth', en: 'White clothes', hi: 'श्वेत वस्त्र', keywords: ['white', 'clothes', 'safed', 'garment', 'dress'],
    nature: 'auspicious',
    omen: 'Purity, peace and an honourable path',
    omenHi: 'पवित्रता, शांति और सम्मानजनक मार्ग',
    reading: 'Wearing clean white garments signals purity, peace of mind and an honourable path ahead. It is a calm, blessed omen of clarity in conduct.',
    readingHi: 'स्वच्छ श्वेत वस्त्र पहनना पवित्रता, मन की शांति और सम्मानजनक मार्ग का संकेत है। यह आचरण में स्पष्टता का शांत, शुभ संकेत है।',
  },
  {
    id: 'dark_cloth', en: 'Black clothes', hi: 'काले वस्त्र', keywords: ['black', 'dark clothes', 'kale kapde', 'garment'],
    nature: 'caution',
    omen: 'A heavy mood, soon lifting',
    omenHi: 'भारी मन, शीघ्र हल्का होता',
    reading: 'Dark garments can mirror a passing heaviness or a period of quiet withdrawal. It is a phase, not a fate — lighter days are already near.',
    readingHi: 'काले वस्त्र किसी क्षणिक भारीपन या मौन एकांत के दौर को दर्शा सकते हैं। यह एक दौर है, नियति नहीं — हल्के दिन पहले से ही निकट हैं।',
  },
];

// ── Prahar (quarter of the night) — the classical timing rule ────────────────
// Swapna phala holds that WHEN a dream is seen decides how soon (and how surely)
// it comes true: dreams near dawn (Brahma Muhurta) are the most truthful and
// fructify fastest; early-night dreams unfold slowly and many simply pass.
export interface Prahar {
  id: string;
  en: string;      // picker label (EN)
  hi: string;      // picker label (HI)
  window: string;  // rough clock window (EN)
  windowHi: string;
  strength: number;      // 0..1 — how strongly/soon it fructifies
  timing: string;        // fructification note (EN)
  timingHi: string;
}

export const PRAHARS: Prahar[] = [
  {
    id: 'p1', en: 'Early night', hi: 'रात्रि का प्रथम प्रहर', window: 'nightfall – ~9 pm', windowHi: 'सांझ – ~9 बजे',
    strength: 0.2,
    timing: 'A dream in the first quarter of night unfolds slowly — its fruit, if it comes, may take up to a year, and many such dreams simply pass.',
    timingHi: 'रात्रि के प्रथम प्रहर का स्वप्न धीरे फलता है — इसका फल, यदि आए, तो लगभग एक वर्ष ले सकता है, और ऐसे कई स्वप्न यूँ ही बीत जाते हैं।',
  },
  {
    id: 'p2', en: 'Before midnight', hi: 'द्वितीय प्रहर', window: '~9 pm – midnight', windowHi: '~9 बजे – मध्यरात्रि',
    strength: 0.45,
    timing: 'A dream in the second quarter tends to show its fruit within a few months.',
    timingHi: 'द्वितीय प्रहर का स्वप्न प्रायः कुछ महीनों में अपना फल दिखाता है।',
  },
  {
    id: 'p3', en: 'After midnight', hi: 'तृतीय प्रहर', window: 'midnight – ~3 am', windowHi: 'मध्यरात्रि – ~3 बजे',
    strength: 0.7,
    timing: 'A dream in the third quarter, past midnight, is a clearer omen that tends to unfold within weeks.',
    timingHi: 'मध्यरात्रि के बाद तृतीय प्रहर का स्वप्न अधिक स्पष्ट संकेत है, जो प्रायः कुछ सप्ताहों में फलित होता है।',
  },
  {
    id: 'p4', en: 'Near dawn (Brahma Muhurta)', hi: 'ब्रह्म मुहूर्त (उषाकाल)', window: '~3 am – sunrise', windowHi: '~3 बजे – सूर्योदय',
    strength: 1,
    timing: 'A dream in the last quarter, near dawn, is the most truthful of all — such dreams often come true within days. If you woke and stayed awake, the omen is stronger still.',
    timingHi: 'उषाकाल के अंतिम प्रहर का स्वप्न सबसे सत्य होता है — ऐसे स्वप्न प्रायः कुछ ही दिनों में सच होते हैं। यदि आप जागकर सोए नहीं, तो संकेत और भी प्रबल है।',
  },
  {
    id: 'unknown', en: 'Not sure', hi: 'पता नहीं', window: '', windowHi: '',
    strength: 0.5,
    timing: 'Without the hour it was seen, read this as a gentle omen rather than a fixed forecast — its timing stays open.',
    timingHi: 'समय ज्ञात न होने पर इसे एक कोमल संकेत मानें, निश्चित भविष्यवाणी नहीं — इसका समय खुला रहता है।',
  },
];

// ── Themes (categories) ─────────────────────────────────────────────────────
// The symbols are grouped into a handful of intuitive themes so the user picks a
// theme first (6 choices) and then a symbol from a short list — far friendlier
// than scanning all ~35 at once. Each theme carries an icon + jewel accent.
export interface DreamCategory {
  id: string;
  en: string;
  hi: string;
  icon: IconName;
  accent: AccentName;
  ids: string[];   // member symbol ids, in display order
}

export const DREAM_CATEGORIES: DreamCategory[] = [
  {
    id: 'nature', en: 'Nature & Water', hi: 'प्रकृति और जल', icon: 'leaf', accent: 'emerald',
    ids: ['water_clear', 'water_muddy', 'rain', 'tree', 'flowers', 'mountain'],
  },
  {
    id: 'sky', en: 'Sky & Light', hi: 'आकाश और प्रकाश', icon: 'sun', accent: 'saffron',
    ids: ['sun', 'moon', 'fire', 'lamp'],
  },
  {
    id: 'animals', en: 'Animals & Birds', hi: 'पशु और पक्षी', icon: 'paw', accent: 'sapphire',
    ids: ['snake', 'elephant', 'cow', 'horse', 'dog', 'bird', 'crow'],
  },
  {
    id: 'people', en: 'People & Life', hi: 'लोग और जीवन', icon: 'family', accent: 'ruby',
    ids: ['wedding', 'child', 'death_self', 'crying', 'naked'],
  },
  {
    id: 'motion', en: 'Body & Motion', hi: 'शरीर और गति', icon: 'activity', accent: 'turquoise',
    ids: ['flying', 'falling', 'boat', 'chased', 'lost', 'teeth', 'hair_cut'],
  },
  {
    id: 'fortune', en: 'Fortune & Sacred', hi: 'भाग्य और पवित्रता', icon: 'diamond', accent: 'amethyst',
    ids: ['temple', 'gold', 'money', 'food', 'white_cloth', 'dark_cloth'],
  },
];

// Symbols belonging to a theme, in the theme's declared order.
export function dreamsInCategory(id: string): DreamSymbol[] {
  const cat = DREAM_CATEGORIES.find((c) => c.id === id);
  if (!cat) return [];
  return cat.ids
    .map((sid) => DREAM_SYMBOLS.find((d) => d.id === sid))
    .filter((d): d is DreamSymbol => !!d);
}

// ── Search ──────────────────────────────────────────────────────────────────
// Match against display names (EN + HI) and keywords. Empty query → full list.
export function searchDreams(query: string): DreamSymbol[] {
  const q = query.trim().toLowerCase();
  if (!q) return DREAM_SYMBOLS;
  return DREAM_SYMBOLS.filter((d) =>
    d.en.toLowerCase().includes(q) ||
    d.hi.includes(query.trim()) ||
    d.keywords.some((k) => k.includes(q)),
  );
}

export const findDream = (id: string): DreamSymbol | undefined =>
  DREAM_SYMBOLS.find((d) => d.id === id);
export const findPrahar = (id: string): Prahar =>
  PRAHARS.find((p) => p.id === id) ?? PRAHARS[PRAHARS.length - 1];
