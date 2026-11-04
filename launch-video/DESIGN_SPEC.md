# Pocketroom launch film design spec

## Production record

- Mode: autonomous free creation
- Format: 1920x1080, 30fps, exactly 180 seconds
- Voice: female English neural voice, warm and conversational, with subtle pitch/rate variation by chapter
- Audio: warm tech-house bed, narration forward, sparse cinematic impacts and sparkles
- Page source: real captures from https://pocketroom-six.vercel.app/
- Data policy: public demo state only; no credentials, private files, or user supplied secrets captured
- Motion system: video-shotcraft autonomous free creation; card mapping and reference implementations are recorded in `SHOTCRAFT_CARDS.md`.

## Product brief

Pocketroom is a cozy, local-first day planner represented as an interactive room. The room makes
the day visible: the desk holds captures, the window holds plans, the doorway holds the leaving
checklist, the wardrobe holds clothing, and the shelves remember stored things. Voice and Muse can
help interpret intent, but deterministic app rules and confirm-before-save gates stay in control.

## Visual direction

Warm room cinema: the product palette is the film palette. Ivory and paper surfaces hold the page
captures, forest ink frames the story, sage and butter mark calm state changes, and terracotta marks
attention. Camera motion is measured and tactile: slow push-ins for trust, lateral reveals for
navigation, one high energy room-to-architecture pullback, and long holds after important claims.

## Functional shot mapping

| Feature | Real capture | Motion language | Narration purpose |
|---|---|---|---|
| Today's Room | captures/room.png | slow 2.5D push with hotspot glints | establish the product metaphor |
| Voice assistant | captures/voice-assistant.png | sheet reveal from room | explain say, confirm, save gate |
| Desk captures | captures/desk.png | right panel slide and focused crop | note/screenshot intake |
| Timeline + Morning Captain | captures/timeline.png | vertical window pan | fixed plans, open windows, verified proposals |
| Doorway | captures/doorway.png | checklist rows settle in | leave-by readiness |
| Wardrobe | captures/wardrobe.png | card cascade | available items and outfit context |
| Storage/search | captures/storage.png | shelf focus and search highlight | last recorded locations without guessing |
| Decor + Clatter | captures/decorate.png, captures/clatter.png | split reveal | personalization and optional local sound |
| AI setup + list | captures/ai-setup.png, captures/list.png | architecture pullback | providers, local state, and honest routing |

## Frame timeline

| # | Time | Feature information | Main action | Caption |
|---|---:|---|---|---|
| 1 | 0:00–0:20 | Product promise | room breathes in, logo resolves | Everything you need for today, in one little place. |
| 2 | 0:20–0:38 | Room metaphor | push from room to desk/window/door | Your day becomes a room you can read. |
| 3 | 0:38–0:58 | Voice + desk | assistant sheet and desk capture reveal | Say it, see the proposal, confirm it. |
| 4 | 0:58–1:18 | Captain + timeline | timeline pan and plan cards | The plan adapts without moving what matters. |
| 5 | 1:18–1:40 | Doorway + wardrobe | checklist and clothes cards cascade | Leave with the right things and the right outfit. |
| 6 | 1:40–2:00 | Storage + sound + decor | shelf search, clatter, wall options | Remember the details, then make the room yours. |
| 7 | 2:00–2:20 | Share + trust | share card abstraction and trust stamps | Your day stays yours until you choose to share it. |
| 8 | 2:20–2:40 | System design | room pulls into architecture map | Browser-first state, optional Muse routes, app-owned rules. |
| 9 | 2:40–2:56 | Full feature recap | montage of real captures | One room, many small decisions made visible. |
| 10 | 2:56–3:00 | Brand outro | logo, URL, final hold | Pocketroom. Make room for today. |

## Sound cues

- S1 impact: room/logo resolves at frame 82
- S2 sparkle: feature montage transition at frame 2320
- S3 impact: architecture map locks at frame 4310
- S4 sparkle: final logo resolves at frame 5320

