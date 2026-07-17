// Legal + policy copy shown in-app (app/legal/[doc].tsx) and referenced from the
// sign-in screen and Settings. This is a good-faith template, NOT legal advice —
// review with a professional before public launch and host the same text at a
// public URL for the Play Store listing.
//
// ⚠️ Replace CONTACT_EMAIL and any [bracketed] fields with your real details.

export const CONTACT_EMAIL = 'rithamastro@gmail.com';
// India IT Rules 2021 + DPDP Act 2023: publish a Grievance Officer contact.
export const GRIEVANCE_OFFICER = 'The Ritham Team';
export const GRIEVANCE_EMAIL = CONTACT_EMAIL;
export const LEGAL_UPDATED = 'July 2026';

export type LegalDoc = 'privacy' | 'terms' | 'disclaimer';

export interface LegalContent {
  title: string;
  intro: string;
  sections: { heading: string; body: string }[];
}

export const LEGAL: Record<LegalDoc, LegalContent> = {
  privacy: {
    title: 'Privacy Policy',
    intro:
      `Ritham (“we”, “us”) respects your privacy. This policy explains what we collect, ` +
      `why, and the choices you have. By using the app you agree to this policy.`,
    sections: [
      {
        heading: '1. Information we collect',
        body:
          `• Account: your name and email address from your Google account, used to sign you in.\n` +
          `• Birth details: name, gender, date, time and place of birth, which you provide ` +
          `to generate your Kundli, horoscopes and reports.\n` +
          `• Content you create: chat messages with the AI astrologer and report inputs ` +
          `(e.g. a floor-plan image for a Vaastu report, a palm photo for a palm reading, ` +
          `a partner’s birth details for a matchmaking report).\n` +
          `• Voice calls: when you place a voice call with the AI astrologer, your ` +
          `microphone audio is streamed to power the live conversation. We do not retain ` +
          `the audio recording; a text transcript of the call may be kept with your account.\n` +
          `• Usage data: basic in-app events (such as sign-in, purchases and report ` +
          `generation) to understand and improve the app.`,
      },
      {
        heading: '2. How we use your information',
        body:
          `We use your information to provide the service: to compute your chart, generate ` +
          `horoscopes and reports, power your AI consultations, process payments, and ` +
          `improve the app. Astrological readings are generated from the birth details you ` +
          `provide.`,
      },
      {
        heading: '3. Service providers',
        body:
          `We rely on trusted third parties to run Ritham, each processing only the data ` +
          `needed for its part of the service, under its own terms and security practices:\n` +
          `• Google — sign-in (your name and email).\n` +
          `• Supabase — authentication, database and secure file storage.\n` +
          `• Razorpay — payments. Your payment card details are handled by Razorpay and are ` +
          `never stored by us.\n` +
          `• Anthropic — the AI that narrates your chat, report and call readings (receives ` +
          `your questions, chart facts, and any uploaded floor-plan/palm image).\n` +
          `• Vapi, Deepgram and ElevenLabs — the voice-call stack (real-time speech-to-text ` +
          `and text-to-speech) that powers a live AI call; they process your call audio.\n` +
          `• VedAstro — sidereal chart computation from your birth details.\n` +
          `• Open-Meteo — place search (to find your birth place’s coordinates and timezone).\n\n` +
          `Some of these providers (for example, the AI that narrates your readings) may ` +
          `process your data on servers located outside India. By using Ritham you consent ` +
          `to this transfer, which we make only to deliver the service to you.`,
      },
      {
        heading: '4. Data storage & security',
        body:
          `Your data is stored securely and access is restricted so that you can only see ` +
          `your own information. Uploaded files (such as floor plans) are kept in private, ` +
          `per-user storage. No method of transmission or storage is 100% secure, but we ` +
          `take reasonable measures to protect your data.`,
      },
      {
        heading: '5. Data retention & deletion',
        body:
          `We keep your data for as long as your account is active. You can permanently delete ` +
          `your account and all associated data at any time from within the app: go to ` +
          `Settings → Delete Account. This erases your profile, chats, purchases, and reports ` +
          `and cannot be undone. You may also request deletion by contacting us at ` +
          `${CONTACT_EMAIL}.`,
      },
      {
        heading: '6. Your rights',
        body:
          `You have the right to access the personal data we hold about you, to correct or ` +
          `update it, and to erase it. You can review and edit your birth details in the app, ` +
          `and permanently delete your account and all associated data from Settings → Delete ` +
          `Account. You may also withdraw your consent at any time by deleting your account. To ` +
          `exercise any of these rights, use the in-app options or contact us at ${CONTACT_EMAIL}.`,
      },
      {
        heading: '7. Grievance redressal',
        body:
          `If you have a concern or complaint about how your data is handled, you can contact ` +
          `${GRIEVANCE_OFFICER} (our grievance contact) at ${GRIEVANCE_EMAIL}. We will acknowledge ` +
          `your complaint within 24 hours and aim to resolve it within 15 days, in line with ` +
          `applicable Indian law (the Digital Personal Data Protection Act, 2023 and the IT ` +
          `Rules, 2021).`,
      },
      {
        heading: '8. Children',
        body:
          `Ritham is intended for users aged 18 and above and is not directed at children.`,
      },
      {
        heading: '9. Changes & contact',
        body:
          `We may update this policy from time to time; material changes will be reflected ` +
          `here with a new date. Questions or requests: ${CONTACT_EMAIL}.`,
      },
    ],
  },

  terms: {
    title: 'Terms of Service',
    intro:
      `These terms govern your use of the Ritham app. By creating an account or using the ` +
      `app, you agree to them.`,
    sections: [
      {
        heading: '1. The service',
        body:
          `Ritham provides Vedic-astrology-based content: a birth chart (Kundli), ` +
          `horoscopes, an AI astrologer chat, and paid reports. Content is generated from ` +
          `the birth details you provide and is offered for guidance and reflection.`,
      },
      {
        heading: '2. Eligibility & account',
        body:
          `You must be 18 or older to use Ritham. You are responsible for the accuracy of ` +
          `the birth details you enter and for activity on your account. Keep access to ` +
          `your Google account secure.`,
      },
      {
        heading: '3. Purchases & payments',
        body:
          `Chat packs and reports are one-time purchases priced in Indian Rupees and ` +
          `processed securely by Razorpay. Prices are shown before you pay. A purchase ` +
          `grants a specific entitlement (e.g. questions, minutes, or one report).`,
      },
      {
        heading: '4. Refunds',
        body:
          `Because readings and reports are generated and delivered digitally as soon as you ` +
          `purchase, they are generally non-refundable. If you were charged but did not ` +
          `receive what you paid for, contact us at ${CONTACT_EMAIL} and we will make it ` +
          `right.`,
      },
      {
        heading: '5. Acceptable use',
        body:
          `Do not misuse the app: no unlawful, harmful, or abusive use, no attempts to ` +
          `disrupt or reverse-engineer the service, and no uploading of content you do not ` +
          `have the right to share.`,
      },
      {
        heading: '6. Nature of the content',
        body:
          `Astrological readings are for guidance and entertainment and are not a substitute ` +
          `for professional advice. See the Disclaimer for details.`,
      },
      {
        heading: '7. Liability & changes',
        body:
          `The app is provided “as is”. To the extent permitted by law, we are not liable ` +
          `for decisions made based on the content. We may update these terms; continued ` +
          `use means you accept the changes. Contact: ${CONTACT_EMAIL}.`,
      },
    ],
  },

  disclaimer: {
    title: 'Astrology Disclaimer',
    intro:
      `Please read this before relying on any reading in Ritham.`,
    sections: [
      {
        heading: 'For guidance, not professional advice',
        body:
          `Ritham’s horoscopes, chart readings, AI chat and reports are provided for ` +
          `guidance, reflection and entertainment. They are based on Vedic astrological ` +
          `traditions and the birth details you provide.`,
      },
      {
        heading: 'Not a substitute',
        body:
          `Nothing in Ritham is a substitute for professional medical, legal, financial, ` +
          `psychological, or relationship advice. For important decisions, please consult a ` +
          `qualified professional.`,
      },
      {
        heading: 'Your choices are your own',
        body:
          `Any action you take based on a reading is your own responsibility. Outcomes are ` +
          `not guaranteed, and astrological readings should not be treated as certain ` +
          `predictions of the future.`,
      },
      {
        heading: 'AI-assisted readings',
        body:
          `Readings are narrated with the help of AI from computed astrological facts. The ` +
          `AI may occasionally phrase things imperfectly; the underlying chart calculations ` +
          `are deterministic. Use your own judgement.`,
      },
    ],
  },
};
