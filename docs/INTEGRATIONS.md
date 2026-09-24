# Zenora — Third-party integrations and costs (checked Sept 2026; verify before launch)

| Area | Provider | Used for | Cost to Zenora |
|---|---|---|---|
| Instagram | Instagram Graph API (Messaging, comments, webhooks) | DMs, comments, story replies, follow gate | Free (needs Meta App Review) |
| WhatsApp | WhatsApp Cloud API as Meta Tech Provider, Embedded Signup | Customer's own number, bots, templates, broadcasts | Free to Zenora; Meta bills customer (India: marketing ₹0.8631, utility ₹0.115, authentication ₹0.115 per msg + GST; check Oct 2026 changes) |
| Ads | Meta Marketing API; Google Ads API | Lead forms, CTWA/CTD ads, spend, audiences; Customer Match | Free (Google needs developer token) |
| Calendar | Google Calendar, Microsoft Graph | Appointments, meeting detection | Free |
| LLM | Anthropic Claude API (Haiku 4.5 for volume; a stronger model for summaries) | AI replies, scoring, summaries, drafts | Haiku 4.5 $1 / $5 per M tokens in/out; confirm current rates |
| Speech-to-text | Sarvam AI (Saaras) | Call transcripts in Indian languages + translation | ₹30/hour; ₹45/hour with speaker labels |
| Meeting bot | Recall.ai (alt: MeetStream) | Join Meet/Zoom/Teams, record | Recall $0.50/recording hour (+$0.15 built-in transcription) |
| Telephony | Exotel / Knowlarity / Plivo (customer's own account) | Click-to-call, recording, masked numbers | Customer pays; integration only |
| Payments | Razorpay or Cashfree | Subscriptions, UPI AutoPay, top-ups, payment links | ~2% + GST per payment (confirm) |
| OTP SMS | MSG91 or similar (DLT registered) | Login OTP | ~₹0.15 per OTP |
| Email | AWS SES / Zoho ZeptoMail | Transactional email | Very low at early volume |
| Push | Firebase Cloud Messaging | Browser notifications | Free |
| Hosting | AWS Mumbai (or Indian region) | App, DB, Redis, storage | ~₹20–30K/month pilot; ~₹55–90K at 100 customers (estimate) |

## Accounts to create before/while building
Meta Business + developer app (business verification, App Review, Tech Provider), Anthropic API, Sarvam, Recall.ai, Razorpay (test mode), MSG91 (+ DLT), AWS, GitHub, Sentry, Google Cloud (OAuth, Calendar, Ads API).
