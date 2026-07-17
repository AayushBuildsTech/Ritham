# Google Play — Data Safety form answers (Ritham)

Fill the Play Console → **App content → Data safety** form with the mapping below.
It reflects what the app actually does (verified against the codebase). "Shared" = sent
to a third party that processes it as a separate service; processing-only sub-processors
(Supabase, Anthropic, Vapi/Deepgram/ElevenLabs, VedAstro, Razorpay) are disclosed in the
privacy policy (`constants/legal.ts` §3) but, per Play's definition, transferring data to
a service provider that processes it **on your behalf** is generally declared as
**"Data is processed but not shared"** unless they use it for their own purposes.

## Does the app collect or share user data? → **Yes**

## Is all data encrypted in transit? → **Yes** (HTTPS/TLS everywhere)
## Can users request deletion? → **Yes** (in-app: Settings → Delete Account; `delete-account` fn)

## Data types

| Play category | Data type | Collected | Shared* | Purpose | Required? |
|---|---|---|---|---|---|
| Personal info | Name | Yes | No | App functionality (chart/greeting) | Required |
| Personal info | Email address | Yes | No | Account management (Google sign-in) | Required |
| Personal info | Other info — **date, time & place of birth** | Yes | Processed by VedAstro/Anthropic | App functionality (Kundli/readings) | Required |
| Photos & videos | Photos | Yes | Processed by Anthropic (vision) | App functionality (Vaastu floor plan / palm reading) | Optional |
| Audio | Voice or sound recordings | Yes | Processed by Vapi/Deepgram/ElevenLabs | App functionality (AI voice call); **not retained** | Optional |
| Messages | Other in-app messages | Yes | Processed by Anthropic | App functionality (AI chat); transcript stored | Optional |
| Financial info | Purchase history | Yes | No | App functionality (entitlements) | Optional |
| App activity | App interactions | Yes | No | Analytics (first-party `events` table) | Optional |
| App info & performance | — | No | — | — | — |
| Device or other IDs | Device ID | Yes | No | Fraud prevention / anti-abuse (free-tier device scarcity; **stored hashed**) | Optional |

\* Play treats a service provider that only processes data on your behalf as **not "shared."**
Declare "shared" only if a partner uses the data for *their own* purposes — none here do.

## Notes to keep the form truthful
- **No advertising / no ad IDs / no third-party tracking SDKs** — the app has none (analytics is a first-party Supabase `events` table). Do **not** tick any "Advertising or marketing" purpose.
- Payment card data is handled entirely by **Razorpay** and never reaches our servers — do not declare card numbers as collected.
- Financial "Purchase history" = the entitlements/orders we store, not card data.
- Device ID is **SHA-256 hashed** before storage (see `chat`/`voice-token` fns) — still declare it as collected (Device ID), purpose Fraud prevention.
- Audio is **streamed, not stored** — declare collected (real-time processing) with purpose App functionality; the privacy policy states we don't retain the recording.

## Also required by Play (already satisfied in-app)
- Privacy policy URL — host the text in `constants/legal.ts` / the website at a public URL and paste it in the Play listing + Data safety form.
- Account deletion — in-app path exists; Play also wants a **web** deletion request route: add a page/route (or a `mailto:` on the website) describing how to request deletion, and link it in the Data safety form's "deletion" field.
