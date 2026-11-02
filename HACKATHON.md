# Pocketroom — Hackathon Submission (Meta Global AI Developer Hackathon)

Track: **Indie Developer** · Problem statement: **Build for Your World**
Deadline: Nov 4, 9:00 PM ET · Building period: Oct 27 – Nov 4

> I lose adapters, miss appointments, and wear the wrong clothes. Pocketroom
> is the room I check every morning: dump the day by voice, let Morning
> Captain propose a verified plan, tap once, and go. Fixed plans never move,
> nothing saves without my tap, and the room shows my day back to me.

## What was built during the hackathon (Oct 27 – Nov 4)

Everything below is new in the building period. Pre-existing: the cozy SVG
room shell, local-first store with undo, desk captures, wardrobe catalog,
storage spots, and synth record player.

**Morning Captain — verifiable day agent (hero)**
`src/core/captain.ts`, `src/core/muse.ts` (`CAPTAIN_PROMPT`, `toCaptainPlan`),
`api/captain.ts`, `src/core/liveModel.ts` (`resolveCaptain`), timeline UI.
Dump → Muse proposes slots/prep/leave-by/outfit/pack → code verifies
(fixed events never move, no invented ids, no overlaps) → one-tap Accept in
a single undoable update + streak bump. Live and local-fallback plans share
the same verifier. Tests: `tests/captain.test.ts`.

**Live Muse default-ON + provenance**
`src/core/liveModel.ts` (`liveStatus`, `liveBadge`, latency/model/offline on
every resolution), topbar Live chip (`src/shell.ts`), assistant badge +
`#as-path` per-result line + Live toggle (`src/views/assistant.ts`).
Fallbacks are labeled, never silent.

**Muse Voice Transcribe input path** (verified 2026-11-02)
`src/core/transcribe.ts`, `src/audioRecord.ts`, `api/transcribe.ts`,
`transcribeViaMuse`/`transcribeDirect`, assistant Input toggle
(browser/Muse). WAV 16kHz mono → `POST /v1/asr/transcribe`
(`muse-voice-transcribe-1.0`) → transcript → intent flow.
Tests: `tests/transcribe.test.ts`.

**Muse Image dream poster** (verified 2026-11-02)
`src/core/dream.ts`, `api/dream.ts`, `dreamViaMuse`/`dreamDirect`, Dream tap
in `src/views/share.ts`. Fixed cozy style prefix server-side + day words →
`POST /v1/images/generations` (`muse-image-1.0`). On-device SVG poster stays
as fallback. Tests: `tests/dream.test.ts`.

**Share card + viral loop**
`src/core/share.ts` (pure vibe/poster/text), `src/views/share.ts` (SVG
preview, canvas PNG download, Post to X intent, copy text), Share card in
timeline. Tests: `tests/share.test.ts`.

**Demo day + streak**
`demoDayState` (3 events, 5 tasks, inbox samples), `bumpStreak`, Try-demo-day
button, streak in Captain card + toast. Tests in `tests/model.test.ts`.

**Phone + PWA-lite**
`public/manifest.webmanifest`, `public/icon.svg`, PWA meta in `index.html`,
coarse-pointer CSS (no iOS focus zoom, 40px touch targets). Bottom sheets on
phone / side panel ≥900px / rails at 1200px were kept and audited statically.

**Central AI setup (one place for keys)**
`src/views/setup.ts`, `Ui.setup`, topbar chip now opens it. Meta key, Baseten
key, provider radio, Live toggle, and per-path status live here only —
assistant and wardrobe link here instead of asking for keys.

**Assistant latency + live feedback**
Live interpret budget 15s → 6s with instant local fallback, proxy warmup
pings on sheet open, silence gate 5s → 2.5s, staged "Thinking" narration
with animated dots, Working button state. Worst case ~8s with narration
instead of ~20s frozen. Tests: budget-fallback + warmup in
`tests/liveModel.test.ts`.

**Daily-routine loop (the "use it every day" slice)**
`rolloverRepeats` in `src/core/model.ts` (repeating tasks renew after
completion, latest-copy + once-per-day guards), repeat capture in local
heuristics + `toProposal`, repeat picker in the desk card, `🔁` badges in
timeline, overdue card with one-tap release (`overdueTasks`), evening wrap
card (done review + carry forward + tomorrow preview), local reminders
(`src/notify.ts`, 60s ticker, permission-gated, once per day), demo-day
overwrite guard, offline service worker (`public/sw.js`, prod only).
Tests: `tests/routine.test.ts`, `tests/notify.test.ts`.

**Muse desk interpretation**
`PROPOSE_PROMPT` + `toProposal` in `src/core/muse.ts`, `api/propose.ts`,
`resolveProposal` in `src/core/liveModel.ts`, "Interpret with Muse" tap in
the desk card. Replaces the biggest remaining heuristics surface with real
extraction; local reading stays instant, gaps named not invented. Tests:
`tests/propose.test.ts`.

**Open-weights chat — Muse Spark Open on Baseten (BYOK)**
`src/core/openweights.ts`, `interpretOpen`/`captainOpen` in
`src/core/liveModel.ts`, provider + key widget in `src/views/key.ts`.
Request shape verified in Baseten's official docs; model slug
`meta-models/muse-spark-open-1026` from the hackathon guide. Selected
provider first, other key as fallback, then proxy, then local — every open
result is labeled for partner verification. Tests:
`tests/openweights.test.ts`.

## Meta models used (all verified in official docs before wiring)

| Model | Endpoint | Used for |
|---|---|---|
| `muse-spark-1.3-contributor` | `POST /v1/chat/completions` | Intent extraction, wardrobe tagging, Captain plans |
| `muse-voice-transcribe-1.0` | `POST /v1/asr/transcribe` | Mic input path (WAV multipart) |
| `muse-image-1.0` | `POST /v1/images/generations` | Dream poster |
| `meta-models/muse-spark-open-1026` | Baseten `POST /v1/chat/completions` (BYOK) | Intent + Captain chats |

Details + fetch dates: `docs/integrations.md`. Nothing is invented: see the
"never invent endpoints" rule in `README.md` → Contributing.

Attempted but honestly unwired: **SAM segmentation** (out of 48h scope;
wardrobe tagging via Spark vision instead). Open-weights vision was not
wired either — only text chats run on Spark Open (verified shape).

## How to run + verify

```bash
npm install
npm test     # 204 tests across assistant / planner / captain / transcribe / dream / share / …
npm run build
npm run dev  # http://127.0.0.1:5173 — mic works (secure context)
```

Judge path (no mic needed): open the app → Live chip in the topbar names
the model → Window (timeline) → **Try demo day** → type a dump in Morning
Captain → **Captain my day** → review trace + code-check → **Accept** (Undo
available) → Share card → Download PNG / Post to X. Assistant shows the
per-result model badge + latency on every turn; DevTools Network shows
`api.meta.ai` calls when Live/proxy is configured, labeled fallback
otherwise. Open-weights check: assistant → Baseten key widget → select Spark
Open → per-result labels name `meta-models/muse-spark-open-1026` for partner
verification. `dist/` contains no API keys (proxy key lives only in Vercel).

## Demo video (3 min) — script

- 0:00–0:20 hook: "Dentist tomorrow at 2:30 pm" by voice → room + desk update,
  Live badge + latency visible.
- 0:20–1:40 Captain: Try demo day → morning dump typed → Captain my day →
  trace + code-check ("fixed events untouched") → Accept → streak toast →
  Undo proves single update.
- 1:40–2:20 wardrobe Detect (Spark vision) + Dream poster (Muse Image) +
  share PNG download + Post to X.
- 2:20–3:00 under the hood: `api/captain.ts` + `verifyCaptainPlan`, Network
  tab `api.meta.ai`, Vercel env (key name only), `npm test` 204 green.

## X cut (15–25s, record in the same session, post before Nov 8 EOD)

Same screen recording setup, portrait crop ok. Beats: hook — "my room
plans my day" over the Live chip close-up (0–3s); dump typed → Captain
plan appears (3–10s); Accept → streak toast + room update (10–16s);
dream poster + share card flash (16–21s); punchline card: "Pocketroom —
today, in one little place. Built with Muse." (21–25s). Caption: the
share text from the app's Share card + demo link + #BuildForYourWorld.

Video link: <!-- TODO: paste 3-min demo URL before submitting Nov 4 9pm ET -->
Live product: <!-- TODO: paste public Pages/Vercel URL -->
Repo: public, MIT. Everyone who worked on the project is listed on the
submission page.

## Pre-submit checklist (owner: you, ~20 min)

- [ ] Vercel: deploy the proxy (`vercel --prod` in this repo, or connect git)
  and set the server secret `MUSE_API_KEY` in the Vercel dashboard. Routes:
  `/api/interpret`, `/api/tag-photo`, `/api/captain`, `/api/transcribe`,
  `/api/dream`, `/api/propose`. Key name only in screenshots — never the value.
- [ ] GitHub: set repo secret `VITE_MUSE_PROXY_URL` to
  `https://<your-vercel-app>.vercel.app/api/interpret` (sibling routes derive
  automatically), push to `main`, confirm the Pages build is green.
- [ ] Open the public Pages URL in a private window: topbar shows the Live
  Muse chip (not the offline fallback), demo day → Captain → Accept works
  typing-only, share PNG downloads.
- [ ] Record the 3-min video per the script above, paste its URL + the live
  product URL at the top of this file, submit one entry, then post the demo
  on X before Nov 8 EOD for Most Viral.
