# Merge final — recipe (2026-11-04)

Output: `out/pocketroom-merge-final.mp4` — 169.9s (2:50), 1920x1080
h264+aac, 22.7 MB. Single ffmpeg assembly, no re-render of sources.

## Segments (all loudnorm I=-23 single-pass + 8ms edge de-click fades)

| # | Source | Range | Dur | Content |
|---|---|---|---|---|
| s1 | `public/raw/pocketroom_demo.mp4` | 0–43.3 | 43.3 | Dark hook + problem + AI-setup trust (ends on its own hard cut) |
| bridge | generated | — | 2.0 | "WATCH IT WORK - LIVE" dark card, baked fades |
| s2 | `out/pocketroom-launch-final.mp4` | 23–80 | 57.0 | Voice live (transcribe→confirm) + wardrobe detect→states |
| s3 | `out/pocketroom-launch-final.mp4` | 120–135 | 15.0 | Shelves: adapter setup ("the room remembers") |
| s4 | `out/pocketroom-interactive-launch.mp4` | 120–131 | 11.0 | Captain full run → Wonder proposal (accept implied on cut) |
| s5 | `out/pocketroom-launch-final.mp4` | 215–223.6 | 8.6 | Search payoff ("Top desk drawer." punchline kept) |
| s6 | `out/pocketroom-interactive-cut-final.mp4` | 162–195 | 33.0 | Under-room routing+API → trust close → logo outro |

Joins (hard cuts + impact `fs-728515` @0.4): 43.3, 45.3, 102.3, 117.3,
128.3, 136.9. Continuous bed (`interactive-original.wav` @0.16, fades
in/out). Final `loudnorm I=-23:TP=-2:LRA=11`. 30s-window loudness sweep:
-25.1/-25.6/-28.5/-27.3/-26.3/-25.5 (no jumps).

## Why these sources

- demo: best hook + on-screen META API tags. Its act 2+ dropped (repeats
  what s2–s5 prove better); its outro dropped (weak end card).
- launch-final: only full-bleed LIVE-mode footage. Its Captain insert was
  NOT used: OffthreadVideo rate/endAt edge blanks the card at ~t188
  (same 1s white tail exists in `pocketroom-launch-final.mp4` itself —
  needs a re-render to fix if that file is ever submitted).
- interactive-launch captain scene: full run with Wonder badge + matching VO.
- cut-final: under-room depth + trust/logo close in one continuous take.
- 2k-final-v2: NOT used — middle ~74–140s renders blank (tags only).

## QA

Join frames ±1s verified (12 frames): bridge renders, all chapter
boundaries clean, s4→s5 accept-implied cut works, s6 fade-in covers the
mid-fade entry. Duration exact 169.9s. Intermediates in /tmp/pkr-merge
(not kept); re-run: extract per table above, concat, bed+impacts per
join list.
