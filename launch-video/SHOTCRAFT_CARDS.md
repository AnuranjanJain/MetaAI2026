# Shotcraft card record

This autonomous free-creation film uses the video-shotcraft gallery as its motion vocabulary. Each card was checked in `gallery/api/library.json`, its recipe was read from `references/shots/`, and the reference implementation was used to preserve the timing and movement grammar while replacing the demo brand and textures with the captured Pocketroom pages.

| Film section | Gallery card / style | Reference implementation | Pocketroom adaptation |
| --- | --- | --- | --- |
| Opening hero | `spotlight-hero-card` | `demos/opening/spotlight-hero-card/SpotlightHeroCard.tsx` | Single room capture, warm spotlight, slow side push, lift, outline, reseat, 30f hold. |
| Room map | `wall-reveal-moves` / `bento-light-up` | `demos/ui-entrance/wall-reveal-moves.md` | Four real page captures reveal in place as a feature wall. |
| Voice | `voice-waveform-live` | `demos/interaction/voice-waveform-live/VoiceWaveformLive.tsx` | Deterministic speech envelope, rolling bars, submit collapse, and Pocketroom confirm-before-save copy. |
| Plan + wardrobe | `deck-deal-flyin` | `demos/ui-entrance/deck-deal-flyin/DeckDealFlyin.tsx` | Same accelerating cue curve and overshoot, using timeline, doorway, wardrobe, and list captures. |
| Memory | `word-relay-filmstrip` | `demos/typography/word-relay-filmstrip/WordRelayFilmstrip.tsx` | Stepwise capture filmstrip with four Pocketroom verbs: remember, personalize, listen, search. |
| Architecture | `crane-rise-reveal` | `demos/opening/crane-rise-reveal/CraneRiseReveal.tsx` | Slow crane pullback from the room into the app-owned state and optional Muse route map. |
| Outro | `outro-group-photo-launch` | `demos/outro/outro-group-photo-launch/OutroGroupPhotoLaunch.tsx` | Six previously shown real captures fly in from four directions around the Pocketroom lockup. |

The live source is `https://pocketroom-six.vercel.app/`; the capture proof and public-demo data policy are recorded in `public/captures/live-proof.json` and `DESIGN_SPEC.md`.
