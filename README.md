# Pocketroom — Today's Room

> Everything you need for today, in one little place. A cozy, local-first day planner
> with a room you can see, a voice you can talk to, and a plan that respects your time.

## Live Demo

- **Hosted:** https://anuranjanjain.github.io/MetaAI2026/ (auto-deploys from `main`
  via GitHub Actions)
- **Local:** `http://127.0.0.1:5173/` (`npm run dev`)

## Screenshots

| Homepage (Room) | List page |
|---|---|
| ![Homepage — Today's Room](docs/screenshots/room.png) | ![List page](docs/screenshots/list.png) |

More screenshots (planner, wardrobe photo) coming soon.

## What it does

- **Today's Room** — a hand-built SVG scene (wardrobe, desk, staggered shelves, in-wall
  window + door, plant, stereo speakers, posters including your own uploaded poster)
  that reflects your actual day. Full-height frame, no page scroll.
- **Voice assistant** 🎙️ — say it, confirm it. *"Dentist tomorrow at 2:30 pm"*,
  *"remind me to buy milk"*, *"where is my adapter?"*, *"what's next?"* — intents are
  classified on-device, missing details are asked by voice, and **nothing is ever
  saved or completed without your tap**. Spoken read-back on confirm.
- **Action planner** — "Plan my day" turns fixed events + flexible tasks into a
  reviewable step list: fixed plans stay fixed, tasks slot into free windows, a prep
  step per event (unpacked checklist items), an honest leave-by buffer
  (*"not a travel time"*), and an *"I'm late — replan from now"* mode that defers
  what no longer fits instead of silently dropping it. Accept applies everything in
  one undoable update.
- **Desk captures** — drop a note or screenshot; an on-device interpretation proposes
  a task/event/item, you edit and confirm. Every proposal path shows its honesty label.
- **Wardrobe + photos** — catalog your clothes, then "Add from photo": upload a
  wardrobe picture, hand-tag the pieces you see, confirm only what you want.
  Explicitly labelled: *no detection runs on this device yet*. Event-aware outfit
  suggestions (*"Today — from your events"*).
- **Storage spots** — every belonging has a last-recorded spot; ambiguous matches are
  shown, never guessed.
- **Record player** 🎵 — eight original WebAudio synth loops (no files, no network,
  no account) with a spinning vinyl, tonearm that swings in on play, progress bar,
  and favorites.
- **Honest by design** — demo heuristics are labelled
  (*"Demo interpretation — on-device heuristics, no model call"*), transcripts and
  model-style outputs are treated as untrusted input, and deterministic rules
  (scheduling bounds, fixed-event protection, confirmations) stay in app code.

## Tech stack

| Layer | Choice |
|---|---|
| Build | Vite 6 + TypeScript (strict, `tsc --noEmit`) |
| UI | No framework — DOM via template strings + event wiring, SVG room scene |
| State | Single `AppState` store, `localStorage` key `pocketroom.v1`, undo stack (30) |
| Voice in/out | Browser Web Speech API (`SpeechRecognition` + `speechSynthesis`), feature-detected |
| Music/SFX | WebAudio — synthesized loops + UI motifs, zero audio files |
| Images | Canvas-downscaled JPEG data URLs (quota-safe local persistence) |
| Tests | `node:test` + `tsx` — 50 tests, pure logic in `src/core/` |
| Backend (planned) | Modal serverless proxy → Muse API, scale-to-zero, key in server secret only |

## Usage

Prereqs: Node 18+.

```bash
npm install
npm run dev      # http://127.0.0.1:5173 — localhost is a secure context, so the mic works here
npm test         # 50 tests across assistant / planner / wardrobe / scheduling
npm run build    # tsc --noEmit && vite build → dist/
npm run preview  # serve the production build locally
```

Notes:

- Voice features need Chrome/Edge (Firefox has no speech recognition — the mic button
  hides itself and typing always works). Mic permission denied → graceful toast.
- Your data never leaves the device. No accounts, no tracking, no network calls
  in the local build. Clearing site data wipes the room.
- Cloud AI (Phase 4) is parked behind a verification gate and stays fully optional —
  if the backend is off or unreachable, the app degrades to the complete local product.

## Project structure

```
src/
  core/        # pure, node-testable logic: assistant, planner, inference,
               # schedule, wardrobeVision, model, types
  views/       # room scene, desk, timeline, wardrobe, storage, assistant sheet
  shell.ts     # frame: rails, docks, sheets, toasts (keep under ~500 lines)
  voice.ts     # speech in/out wrappers      image.ts      # upload validation + downscale
  music.ts     # synth player                audio.ts      # UI sound motifs
  store.ts     # single store + undo         styles.css    # full-height frame + rails
tests/         # assistant, planner, wardrobe, scheduling suites
docs/          # integrations.md (honesty contract), screenshots/
server/        # Phase 4 cloud backend (planned, not yet built)
```

Conventions: pure logic lives in `src/core/`; views never mutate the store except
through editable-confirm → validate → single `store.update`; all new persisted
fields are optional so old saves keep loading.

## Contributing

1. Fork the repo and create a branch (`git checkout -b my-change`).
2. Keep files under 500 lines; put testable logic in `src/core/`.
3. Never invent endpoints, model IDs, or prices — unverified stays unwired
   (see `docs/integrations.md`).
4. Gate before every PR: `npm run build` and `npm test` fully green.
5. Open a PR against `main` with what changed and how you tested it.

## License

MIT — see [LICENSE](LICENSE). Do anything you like with it; a shout-out is appreciated.

## Made with love by [Anuranjan Jain](https://github.com/AnuranjanJain)

Cozy software for hectic days. 🏠
