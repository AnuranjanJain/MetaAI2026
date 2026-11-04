# Pocketroom Launch Film — from supplied demo (RAW-FILM)

Source: `public/raw/cut-pocketroom.mp4` (2560x1440, 30fps, 254.4s, mostly
silent screen capture of the LIVE demo: Direct Muse key, Live ON).
Supplement: `public/edited/captain.mp4` (1440x900, 11s, real Captain accept
on Wonder — the supplied footage shows Captain but never runs it).
Output: 1920x1080, 30fps, ~3:50, `out/pocketroom-launch-final.mp4` (+ no-BGM
variant from the same timeline). No raw audio is kept (low quality + a
copyrighted song plays in the room shots); full replacement: ElevenLabs Esha
VO + original ambient bed + project-local CC0 SFX.

Privacy: key-entry frames (src t8–14) verified — fields show placeholders
only ("key saved ✓ / Key works"), no key value on screen. No blur needed.

## Edit decision list (src seconds → out chapters)

| # | Out chapter | Src range | Dur | Notes |
|---|---|---|---|---|
| 0 | Teaser cold open | money cuts | 9 | 5×~1.4s punch cuts + kinetic words + impacts |
| 1 | Title | 0.0–4.2 (room) | 5 | Logo resolve + tagline over room |
| 2 | Trust: Live Muse setup | 4.2–13.1 | 9 | Live ON, key saved, key works |
| 3 | Voice: say it, confirm it | 13.1–45.0 | 32 | transcribe 10348ms → mall@2 → confirm card |
| 4 | Wardrobe: photo → closet | 47–80 | 33 | Detecting → 12 drafts → save → ideas → states |
| X | CUT | 80–100 | — | scroll dwell + DEMO badges + occasion repeat |
| 5 | Wardrobe: tonight's outfit | 100–116 | 16 | keep idea → build by hand → evening outfit |
| 6 | Decorate | 116–132 | 16 | wall color + poster (room recolors live) |
| 7 | The room remembers | 132–147 | 15 | query, spots, adapter → top desk drawer |
| X | CUT | 147–158 | — | scroll dwell (jump hidden under callout wipe) |
| 8 | Keys, honestly tracked | 158–172 | 14 | remember Keys/car, "Not sure yet" |
| 9 | Doorway payoff | 172–183 | 11 | packing list: adapter, keys, charger, routines |
| 10 | Spots top-up | 183–193 | 10 | query + spots + Flower |
| X | CUT | 193–198 | — | belongings re-scroll |
| 11 | Window + Captain intro | 198.7–206 | 7 | plan surface, "No Captain plan yet" |
| 12 | CAPTAIN INSERT (framed) | captain.mp4 0–11 | 12 | "LIVE WONDER RUN" tag, real accept |
| 13 | Accept + share + wrap | 206–219 | 13 | accept plan, poster, dream, wrap day |
| 14 | Doorway full | 219–224 | 5 | leaving prep complete |
| 15 | Breath: room + music | 224–227 | 3 | music-only, wide room |
| 16 | Clatter | 227–232 | 5 | optional sound, soundtrack row |
| X | CUT | 232–241 | — | static clatter dwell |
| 17 | Search payoff | 243–249.2 | 6 | "Where did I put the adapter?" → answer |
| 18 | Finale room | 249.2–250.9 + 252.8–254.4 | 3 | skip 250.9–252.8 panel flicker |
| 19 | Outro | still + room | 7 | logo, URL, Built with Muse, hold ≥1s |

Teaser cuts (src): 34–36 voice confirm · 61–63 twelve drafts ·
captain.mp4 7–9 accept · 213–215 share poster · 244–246 search.
Teaser words: SAY IT. / TWELVE PIECES. / PLANNED. / SHARED. / FOUND.

## Narration script (Esha, same settings as interactive film)

| id | text |
|---|---|
| title | Your day has a thousand pieces. Pocketroom gives them one home. |
| setup | It starts with trust. Your Muse key stays in your browser. Live is on — and every answer names its model. |
| voice | Say it. Muse transcribes your voice, understands the plan — mall, tomorrow, two — and asks before anything saves. Nothing ever saves without your tap. |
| wardrobe | Point at your closet. Muse vision reads the photo and drafts twelve pieces — names, colors, tags. Keep what you love. Then pick tonight's outfit from what you can actually wear. |
| decorate | And make the room yours — walls, posters, your own art. |
| shelves | The room remembers, so you don't have to. A spot for everything — the adapter lives in the top desk drawer. Even the keys you haven't found yet stay on the list, honestly marked unknown. |
| doorway | When it's time to leave, the doorway packs by routine. Adapter, keys, charger. Nothing left behind. |
| captain | Each morning, dump the day in one breath. Morning Captain, running on Muse Wonder, plans around your fixed events. Review it — accept it — done. |
| share | Share the day as a poster, dream it bigger with Muse Image, then wrap up and carry forward. |
| vibe | Leave with a list that reads itself aloud. Come home to your music. |
| search | And when something goes missing — where did I put the adapter? The room answers. Top desk drawer. |
| outro | Pocketroom. Make room for today. Built with Muse. |

## Graphics system (tokens from the product)

Ivory #FAF6EF · forest ink #1E3A2F · sage #9CAF88 · terracotta #C05621 ·
butter #F6C945 · Georgia display / Segoe UI body.
Bug top-left "POCKETROOM · LIVE DEMO", top-right chapter "03 / 12",
bottom strip "Unscripted walkthrough · pocketroom-six.vercel.app".
Chapter rail: left-edge dots with labels on change. Lower-third title per
chapter. Callout = rounded box + terracotta stroke + mono label + dot pulse.
Kinetic statements full-screen 1.6s between chapters 3/4/7/9/12/17:
"SAY IT." / "NOTHING SAVES WITHOUT YOUR TAP." / "TWELVE PIECES. ONE PHOTO."
/ "THE ROOM REMEMBERS." / "ONE TAP. WHOLE DAY." / "FOUND IT."
Captions: VO subtitles, segment-timed from ElevenLabs alignment.
Zooms: 1.0–1.35x punch-ins per chapter (1440p source gives headroom);
teaser cuts at 1.3–1.5x on regions. Deterministic: seeded easing only.

## Audio

VO: `public/audio/rawfilm/*.mp3` (+ per-seg JSON alignment, same CLI shape
as narrate-interactive). Bed: loop `public/audio/bgm/interactive-original.wav`
(measured, crossfade loop, -22 dB under VO with ducking).
SFX (project-local CC0, see `public/audio/sfx/audio-manifest.json`):
impact on teaser cuts + chapter titles, sparkle on callout pops, soft pop on
confirm/accept/save toasts, riser into Captain insert, shimmer on outro.

## QA gates

Per-chapter `remotion still` frame review → full render → ffmpeg frame sweep
every 10s + loudness (target dialogue ≈ -20 dB mean, peaks < -3 dB) → fix
pass → final + no-BGM variant. No raw audio in mix. No key values on screen.

## Delivery (2026-11-04)

- `out/pocketroom-launch-final.mp4` — 233s, 1920x1080 h264+aac, 51.1 MB,
  mean -23.0 dB / peak -3.1 dB. Full mix: Esha VO + original bed + CC0 SFX.
- `out/pocketroom-launch-final-no-bgm.mp4` — same timeline, VO+SFX only
  (verified: VO-free zone -91 dB vs -47.7 dB with bed).
- QA: 28-frame sweep + full-res callout calibration crops; 11 fixes applied
  (callout repositioning, 2 graphic-collision removals, keys/door1 boundary
  re-cut, wardrobe opening tightened src47→52); spot re-verified after
  re-render. Known minor: bed sits subtle in music-only zones (~-48 dB);
  loudening = one volume-line change + re-render.
- Comp: `src/RawFilm.tsx` + `src/raw-data.json` + `src/rawfilm-vo.json`,
  composition `PocketroomRawFilm`. Repro: `npm run render-raw`.
