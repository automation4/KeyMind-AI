# KeyMind AI — Product Requirements (v1)

## Overview
KeyMind AI is an **in-app AI Writing Companion** built with Expo (React Native) + FastAPI + MongoDB. The user types or pastes text in any language and uses 16 AI writing tools (powered by Gemini 3 Flash) to correct, transform, translate, or expand it.

A true Android system keyboard (IME) would require native Kotlin (`InputMethodService`) and cannot be shipped via Expo Go; **v1 is the standalone writing companion app** that demonstrates every AI capability of the original keyboard concept.

## v1 Implemented Features

### F1 Splash & Onboarding
- Animated splash with logo + tagline (`/app/index.tsx`)
- 8-slide swipeable onboarding (`/app/onboarding.tsx`) with dot indicators, Skip, Get Started
- Shown only on first launch (persisted via `keymind_onboarded` flag)

### F2 Authentication
- **Emergent-managed Google Auth** via `WebBrowser.openAuthSessionAsync` → exchange `session_id` server-side
- **Guest mode** (one-tap, no account)
- Session persistence (token stored via `@/src/utils/storage`)
- `POST /api/auth/session`, `POST /api/auth/guest`, `GET /api/auth/me`, `POST /api/auth/logout`
- **Admin Auth (hidden email/password)** — `POST /api/auth/admin`
  - Login screen: "Sign in with email" link → email input → password field appears ONLY when email matches admin email (`himthegreat@gmail.com`)
  - Single admin account; password `auto` (configurable via env `ADMIN_EMAIL`, `ADMIN_PASSWORD`)

### F2b Admin Panel & Subscription Tiers (NEW)
- Admin Settings panel (`/app/(tabs)/settings.tsx`, visible only when `user.is_admin`)
  - Whitelist management — add email → grants premium; toggle Switch → premium ON/OFF; trash icon → revoke access
  - Lists only whitelisted users (`GET/POST/PUT/DELETE /api/admin/whitelist`)
- **Free tier limits** (enforced server + frontend):
  - 5 AI tool uses per day (combined across all tools) — resets daily; tracked on `user.tool_usage_date` + `user.tool_usage_count`. 6th call → HTTP 429 → frontend opens UpgradePrompt modal
  - 3 language selections in setup (UpgradePrompt on 4th)
  - 2 accent colors unlocked (orange + butter); 4 others show lock icons
- **Ad placeholders** (`/src/components/AdBanner.tsx`) — top of Write, History, Chat for non-premium; tap → `/pricing`
- **UpgradePrompt** modal (`/src/components/UpgradePrompt.tsx`) — shown on hitting any free-tier limit



### F3 First-Time Setup
- Multi-select language preferences (14 Indian languages)
- Light/Dark theme picker
- 6 accent color choices

### F4 Multilingual Grammar Correction
- `POST /api/ai/tool` with `tool="grammar"`
- Gemini 3 Flash prompts handle Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, Urdu, Assamese, Hinglish/Tanglish/Manglish (Roman scripts), and 50+ international languages
- Auto language detection — no manual selection required

### F5 Apply / Suggestion Control
- Suggestion **never auto-applies** — always a card
- **APPLY**, **COPY**, **RETRY**, **DISMISS**, **LISTEN** actions
- Inline word-level **DIFF VIEW** (LCS) for grammar suggestions: line-through original + highlighted additions
- Applied corrections saved to history

### F6 16 AI Writing Tools
Horizontally scrollable toolbar above the input. All 16 tools wired to a single `POST /api/ai/tool` endpoint:
1. Grammar  2. Tone Changer (with tone picker)  3. Smart Reply (3 options)  4. Vocab  5. Translate (target-language picker)  6. Enhance  7. Ask AI  8. Paraphrase (3 options)  9. Emoji Suggester  10. Make Longer  11. Continue Writing (2 options)  12. Summarize (bullets)  13. Synonyms  14. Email Writer (tone picker)  15. Make Shorter  16. Versify (style picker)

### F7 AI Tutor Chatbot
- Dedicated tab with conversation context (sliding window of last 10 turns sent to model)
- Quick-prompt chips for common grammar questions
- Per-session chat history saved (MongoDB)
- `POST /api/ai/chat`, `GET /api/ai/chat/{session_id}`

### F8 Text-to-Speech
- 🔊 **LISTEN** buttons on input, every suggestion card, every chat reply, every history item
- On-device `expo-speech` (works offline, supports many languages — auto-detects from text)
- Tap LISTEN again to STOP

### F9 Themes & Customization
- Light / Dark mode (manual toggle, persisted)
- 6 accent color presets
- Neo-brutalist design system (hard borders + offset shadows)

### F10 History
- Every APPLY action saved
- Per-user list with diff context + listen button + delete

### F11 Pricing Screen
- 4 plans (Monthly ₹500, Quarterly ₹1,425, Half-yearly ₹2,850, Yearly ₹5,700)
- Free vs Premium feature comparison
- Subscribe button (payment integration deferred)

## Tech Stack
- **Frontend**: Expo 54, expo-router, React Native, expo-speech, expo-clipboard, expo-haptics, expo-web-browser
- **Backend**: FastAPI, Motor (MongoDB async), httpx, emergentintegrations.LlmChat
- **AI**: Gemini 3 Flash via `LlmChat.with_model("gemini", "gemini-3-flash-preview")` using Emergent LLM key

## Routes
- `app/index.tsx` — splash / route guard
- `app/onboarding.tsx` — 8-slide intro
- `app/login.tsx` — Google + Guest
- `app/setup.tsx` — language / theme / accent
- `app/(tabs)/index.tsx` — Write screen (16 tools + suggestions)
- `app/(tabs)/chat.tsx` — AI Tutor
- `app/(tabs)/history.tsx` — Correction log
- `app/(tabs)/settings.tsx` — Account, theme, accent, sign out
- `app/pricing.tsx` — Premium plans

## Deferred (post-v1)
- True system keyboard (requires native Android module — non-Expo)
- AdMob banner/interstitial + rewarded ads
- Google Play Billing real subscription
- Firebase Phone OTP, Facebook Login (require dev builds)
- High-quality neural TTS via Google Cloud / Bhashini (currently uses device `expo-speech`)
