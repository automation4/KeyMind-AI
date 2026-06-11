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

## Changelog — 2026-02 (fork: describe layout + tool count + chat format)
1. **Describe card reorder** (`SimpleDescribeCard.tsx`): new section order = HOW TO SAY IT IN X (now hosts the language-selector chevron + chips) → SIMPLE EXPLANATION → IN X (translated meaning + transliteration, moved to bottom). Lang selector falls back to the IN X header for single-word inputs.
2. **Tool count fix**: "16 tools" → dynamic `${TOOLS.length}` (14) in Write tab dropdown; onboarding copy updated to "14 AI tools".
3. **Chat translation format** (`prompts.py`): fixed line order — 1st `Say it:` (Roman transliteration, ask-language), 2nd `Meaning:` (English), 3rd `<Lang>:` (native script). The 3rd line's script follows the AI reply-language selector when it's a variant (e.g. Konkani-Romi → Roman). Verified via curl (default + konkani-romi).

Known env note: Metro runs in CI mode (no hot reload) — restart expo after frontend edits. Do NOT issue parallel search_replace calls on the SAME file (edits clobber each other).

## Changelog — 2026-02 (part 2: describe&translate merge + chat picker removal)
1. **Retrigger spinner**: circular refresh button beside "AI WRITING TOOLS" heading (Write tab) re-runs the active tool; shows ActivityIndicator while loading (`testID=retrigger-tool-btn`).
2. **Describe renamed** → "Describe & Translate" (tools.ts, id still `vocab`).
3. **Translate tool removed** from TOOLS (Describe & Translate covers it). Count auto-shows 13; onboarding copy updated.
4. **Chat reply-language picker removed** (blue-cross request): deleted ChatResponseLanguagePicker.tsx, useChatResponseLanguage.ts, chatResponseLanguages.ts; chat.tsx composer now only has the dictate-language chip; api.chat() no longer sends response_language. Backend still accepts the optional field (harmless, unused).

## Changelog — 2026-02 (part 3: auth overhaul + guest device lock + premium patterns)
1. **Email/password auth (real)**: `POST /api/auth/register` (name/email/password, bcrypt via passlib, min 8 chars) and `POST /api/auth/login`; issues same DB-backed session tokens as Google/guest flows. Admin signs in via the SAME form (admin email + password routes to admin login) — hidden 22-tap gesture removed.
2. **Login screen redesigned** (`login.tsx` rewrite): email+password form card, SIGN IN / CREATE ACCOUNT toggle, "Or continue with" Google (functional, Emergent-managed) + Facebook/Apple (MOCKED coming-soon), CONTINUE AS GUEST, no Emergent branding text, subtitle says "13 AI writing tools".
3. **Guest once per device**: frontend persists `keymind_device_id` (storage) and sends it to `/api/auth/guest`; backend reuses guest user by `guest_device_id` → usage limits can't be reset by re-guesting. No-body requests still create anonymous guests (back-compat).
4. **Premium pattern themes**: ThemeContext extended with `pattern` (classic/dots/grid/stripes/waves, persisted). New `PatternBackground`/`PatternSvg` (react-native-svg, newly installed). Settings → "BACKGROUND PATTERN" section with PREMIUM tag; free users see locks → /pricing; applied pattern renders behind all 4 tab screens.
5. Pricing copy fixed: "All 13 writing tools".
Testing: iteration_10 — backend 13/13 pytest pass (`/app/backend/tests/test_iter10_auth_and_guest.py`), all frontend flows pass.

## Changelog — 2026-02 (part 4: login polish + creds hardening + animated picker)
1. Login: Facebook/Apple buttons REMOVED; single full-width "Continue with Google" button with official multicolor G (react-native-svg). Guest button unchanged.
2. Credentials hardening: ADMIN_EMAIL/ADMIN_PASSWORD moved to /app/backend/.env (single-quoted password due to $); hardcoded defaults removed from server.py; admin email removed from frontend — /api/auth/login routes admin server-side. Verified working.
3. ToolPickerSheet: custom Animated popup (backdrop fade + spring slide/scale), tap-outside-to-close backdrop, long-press on tools-dropdown also opens picker (delayLongPress 250ms).
4. PENDING: real direct Google OAuth (replace Emergent-managed) — requires user's Google Cloud OAuth WEB CLIENT ID (+ redirect URI config). Playbook: expo-auth-session (responseType IdToken) + backend google-auth verify_oauth2_token; backend endpoint /api/auth/google {id_token}. Waiting on user credentials.

## Changelog — 2026-02 (part 5: real Google OAuth)
- Replaced Emergent-managed Google auth with DIRECT Google OAuth:
  - Frontend: expo-auth-session (+expo-crypto) `Google.useIdTokenAuthRequest` with EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (frontend/.env). Opens genuine accounts.google.com (verified via popup URL check).
  - Backend: POST /api/auth/google {id_token} → google-auth verify_oauth2_token against GOOGLE_CLIENT_ID (backend/.env) → upsert user by email → session token.
  - Emergent /auth/session endpoint + signInWithSessionId remain in code (unused by login UI now).
- Client ID: 241457285059-0f2oc6cvu40uakmp61dejr9ac5vifvdm.apps.googleusercontent.com (user-provided, Web type).
- CAVEATS: (1) Full login needs the user's Google account; if OAuth consent screen is in Testing mode, the Google account must be added as test user. (2) On native Expo Go preview, web-client flows may fail — works on web preview; APK build will need an Android client ID (package name + SHA-1). (3) Preview URL must be in Authorized JavaScript origins + redirect URIs in Google Console.
- Regression: email login, guest device reuse re-verified post-change.

## Changelog — 2026-02 (part 6: indigo theme + Google-only login)
1. **Theme**: COLORS.primary orange→indigo #4F46E5, bg → #F8F9FB, new COLORS.onPrimary (#FFF). Contrast fixes: splash logo text, settings Go-Premium card, tab active icon (white on indigo pill), write-tab avatar initial, login logo. Tone tool accent orange→lilac. Accent label "Orange"→"Indigo" (storage key unchanged).
2. **Google-only login**: login.tsx rewritten — Google button (white, light-indigo border, colored G) + indigo "Continue as Guest". Email/password UI REMOVED. Backend /auth/register endpoint REMOVED (no manual account creation). /auth/login + /auth/admin remain API-only (admin/legacy accounts). AuthContext/api.ts pruned (removed exchangeSession, register, emailLogin, adminLogin, signInWithSessionId, signInAsAdmin).
3. Tests updated: tests/test_iter10_auth_and_guest.py — 11/11 pass (register 404, login API, google invalid-token 401, guest device reuse, session usage).
4. NOTE: User successfully completed a REAL Google login earlier (POST /api/auth/google 200 in logs).
