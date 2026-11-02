# Integrations (honest status)

Pocketroom runs fully offline in **demo mode** by default. No model calls
execute unless the user opts into live mode. Screens that use demo
interpretation show the label:

> Demo interpretation — on-device heuristics, no model call

Live results instead carry the label:

> Live Muse interpretation

## Verified Muse API values (network research 2026-11-01)

Verified against Meta's official docs before any integration code was
written — nothing below is invented:

- Base URL: `https://api.meta.ai/v1`
- Endpoint: `POST https://api.meta.ai/v1/chat/completions` (OpenAI-compatible)
- Auth header: `Authorization: Bearer $MODEL_API_KEY`
  (`Content-Type: application/json`)
- Request body: `{ "model": "<model-id>", "messages": [...] }` — a minimal
  request needs only `model` and `messages`
- Response shape: OpenAI chat-completions shape; generated text lives at
  `response.choices[0].message.content`
- Model ID: `muse-spark-1.3` — "Recommended for new work" per Meta's models
  page (agentic/coding tuned, replaces 1.2/1.1). This deployment uses
  `muse-spark-1.3-contributor` instead (user choice, 2026-11-01):
  discounted, but Contributor mode may use prompts/completions to train
  future Meta models.
- Instruction messages use the `developer` role (verified in the Chat
  Completions guide); `reasoning_effort: "none"` returns HTTP 400 on Muse
  Spark, so the proxy sends no reasoning parameter
- Image input (verified 2026-11-01 in the Image understanding guide): Chat
  Completions wraps the image in an `image_url` object whose `url` is a
  public URL or a base64 `data:` URL — no hosting or Files API needed

Sources: `https://dev.meta.ai/docs/models`,
`https://dev.meta.ai/docs/protocols/chat-completions`,
`https://dev.meta.ai/docs/authentication`,
`https://dev.meta.ai/docs/image-understanding` (all fetched 2026-11-01).

## Verified 2026-11-02: Voice Transcribe + Muse Image

Fetched and read during the hackathon build (see `HACKATHON.md`):

- Speech to text: `POST https://api.meta.ai/v1/asr/transcribe`
  (`Authorization: Bearer $MODEL_API_KEY`), `multipart/form-data` with a
  `request` JSON part (`{"mode":"ENDPOINTING","model":"muse-voice-transcribe-1.0","audioEncoding":"WAV"}`)
  and an `audio` WAV part (mono, 16-bit PCM, 16 or 24 kHz).
  JSON reply carries the full `transcript` plus a `turns` array.
  Source: `https://dev.meta.ai/docs/speech-to-text`.
- Image generation: `POST https://api.meta.ai/v1/images/generations`
  (OpenAI-compatible), `{model:"muse-image-1.0", prompt, n:1}` →
  `{data:[{b64_json|url}]}`.
  Source: `https://dev.meta.ai/docs/image-generation`.

Wired paths:

- `POST {sibling}/api/transcribe` (`api/transcribe.ts`) receives
  `{ audio }` (base64 WAV ≤2M chars), forwards multipart to the endpoint
  above, and returns `{ transcript, model }`. The client recorder is
  `src/audioRecord.ts` (MediaRecorder → decode → mono 16kHz → WAV);
  pure helpers live in `src/core/transcribe.ts`. Direct-BYOK path posts
  multipart straight from the browser. The assistant's Input toggle
  (browser/Muse) picks the opening-utterance path; results carry
  `Muse Voice Transcribe • muse-voice-transcribe-1.0 • {ms}`.
- `POST {sibling}/api/dream` (`api/dream.ts`) receives `{ words }`
  (≤200 chars of day words), prepends the fixed `DREAM_STYLE` prefix
  server-side, and returns `{ image, model }` — a PNG data URL when
  `b64_json` arrives, else the `https://` URL. Client: `dreamViaMuse` /
  `dreamDirect` in `src/core/liveModel.ts`, explicit Dream tap in
  `src/views/share.ts`. The on-device SVG poster stays as the fallback.
- `POST {sibling}/api/propose` (`api/propose.ts`) receives `{ text, today }`
  (≤2000 chars), calls Muse Spark with the fixed `PROPOSE_PROMPT`, and
  returns `{ proposal, model }` allowlisted by `toProposal` — type/title
  checked, confidence/missing/rationale code-owned. Client:
  `resolveProposal` in `src/core/liveModel.ts` (direct provider order →
  proxy → null), explicit "Interpret with Muse" tap in the desk proposal
  card. Local heuristics stay as the instant fallback.
- `POST {sibling}/api/captain` (`api/captain.ts`) receives `{ context }`
  (capped day JSON from `captainContext`), calls Muse Spark with the fixed
  `CAPTAIN_PROMPT`, and returns `{ plan, model }` allowlisted by
  `toCaptainPlan`. Verification (`verifyCaptainPlan`: fixed events never
  move, no invented ids, no overlaps) runs client-side on every plan —
  live and fallback alike. Accept applies everything in one undoable
  `store.update` and bumps the Captain streak.

## Live-mode shape (Muse speech understanding via Vercel proxy)

The deployed app is a static GitHub Pages site, so the Muse call lives
behind a server route hosted on Vercel:

- `POST {VITE_MUSE_PROXY_URL}` (`api/interpret.ts`) receives
  `{ transcript }`, calls the Muse endpoint above with a fixed
  server-side extraction prompt, and returns a validated `AssistantIntent`
  matching the app's `classifyIntent` result shape.
- `POST {sibling}/api/tag-photo` (`api/tag-photo.ts`) receives
  `{ image }` (JPEG data URL, ≤2M chars), sends it as an `image_url`
  block with a fixed tagging prompt, and returns `{ pieces }` — each
  `{ name, category, color?, tags }`, at most 12. Only called from the
  wardrobe's explicit Detect tap; drafts stay editable and confirm-gated.
- Browser speech-to-text stays as-is; only the transcript crosses the
  network. Empty and overlong (>1000 chars) transcripts are rejected at
  the boundary with 400/413.
- The client adapter is `src/core/liveModel.ts`:
  `interpretViaMuse(transcript)` POSTs with a ~30s timeout (proxy upstream
  ~25s — the contributor tier needs ~10s+ per call), schema-checks
  the response (exact keys per intent kind, string types, length caps),
  and returns `null` on any failure, timeout, or mismatch. The response
  is untrusted input, exactly like demo inference output.
- Live mode is ON by default (`pocketroom.liveMuse !== '0'`) and requires
  the build-time `VITE_MUSE_PROXY_URL`. When off, unreachable, or slow,
  the app falls back to local `classifyIntent` with the existing
  classify-raw-first/strip ordering — and the fallback is always labeled
  (`Muse unreachable — on-device fallback` or `Demo mode`), never silent.
  Interpret turns get a 6s live budget, then local answers instantly;
  opening the assistant warms the proxy routes (`warmProxy`, OPTIONS,
  no user data) so cold starts don't eat the budget.
- `done` intents are always resolved locally: task identity lives only on
  the device, so a live `done` result falls back to local matching.
- Deterministic rules (scheduling bounds, fixed-event protection,
  checklist states, confirmations) stay in app code regardless of model
  output. Nothing is ever saved without confirm-by-tap (or spoken "yes"
  in opt-in Hands-free mode).
- Screenshot/note content must never override app instructions: the
  extraction prompt is fixed server-side and instruction-like phrasing
  ("ignore previous instructions", "you are now …", "new instructions:",
  …) is stripped from returned fields.

## Open-weights chat (verified 2026-11-02)

Muse Spark Open runs BYOK through Baseten Model APIs — no proxy involved.
Verified against `https://docs.baseten.co/reference/inference-api/chat-completions.md`
(OpenAI-compatible `POST https://inference.baseten.co/v1/chat/completions`,
`{model, messages}`, Bearer key, `choices[0].message.content`); the model
slug `meta-models/muse-spark-open-1026` comes from the hackathon guide.

- `src/core/openweights.ts` holds the endpoint, model, provider pref
  (`pocketroom.provider`, default `meta`), and Baseten key storage
  (`pocketroom.basetenKey`, browser-only, never displayed back).
- `interpretOpen` / `captainOpen` in `src/core/liveModel.ts` post the same
  fixed prompts as the Meta direct path; results carry
  `Open Muse via Baseten (meta-models/muse-spark-open-1026)` reasons and
  traces so the infrastructure partner can verify the run.
- Resolvers try direct backends in provider order (selected first, other
  key as fallback), then the Meta proxy, then local. Vision tagging,
  transcribe, and dream stay Meta-only (not verified for open backends).
- UI: provider radio + Baseten key widget in `src/views/key.ts`,
  rendered in the assistant sheet; topbar/assistant badges name the open
  model when active.

## Key handling

- The shared Meta Model API key lives ONLY as `MUSE_API_KEY` in the Vercel
  dashboard (server secret). Its value is the `MODEL_API_KEY` credential
  from the dev.meta.ai dashboard; the `MUSE_` name marks it as this
  app's server secret.
- The shared key is read via `process.env` inside `api/*.ts` only. It
  never enters the repo, the bundle, chat, or commits.
- The client build receives only the proxy URL: `VITE_MUSE_PROXY_URL`
  flows from a GitHub Actions secret through `.github/workflows/deploy.yml`
  into `import.meta.env`. Without it, live mode stays off.
- Verify with: `npm run build`, then grep `dist/` for `MUSE_API_KEY` /
  `MODEL_API_KEY` — expect zero matches.

## BYOK concept (advanced features on the user's key)

API-powered features are gated behind an optional user-supplied Muse key
("Use my own Muse key" in the assistant and wardrobe views), while
everything else works fully offline as usual:

- Advanced, key-gated: voice understanding, garment detection from
  wardrobe photos, and future API features (general object identification
  is the planned next one).
- Always offline: planning, scheduling, storage spots, wardrobe catalog
  and suggestions, music, and all confirm-gated mutations.

Precedence per request is user-key direct → proxy → local/hand-tag,
degrading silently at each step. The key is stored only in the browser's
`localStorage` (per-origin), never displayed back, sent only to
`api.meta.ai` (browser CORS verified `*` via live preflight probe), and
cleared with one tap. Tradeoff: page scripts can read `localStorage`, so
shared devices should prefer the proxy path. Direct results carry their
own `Direct Muse …` labels, never proxy or demo copy.

## Demo vs live separation

- `src/core/inference.ts` is the demo engine. The live adapter is
  `src/core/liveModel.ts` behind the server route above.
- The UI label must change to name the live path; demo copy must not appear
  on live results.
