# Pocketroom narrated launch film

**Final film (3 min): https://youtu.be/LaiRvqQhgWE**

A 1920x1080, 30fps, three-minute Remotion composition built from real captures of
the deployed Pocketroom demo at https://pocketroom-six.vercel.app/.
Rendered MP4s (`out/`) and raw clips (`public/`) stay out of git — the final
cut lives on YouTube; this folder keeps the scripts, compositions, and docs
that produced it.

## Render

```powershell
npm install
npm run render
npm run render-no-bgm
```

The main deliverables are in `out/`. The no-BGM render keeps narration and SFX so the soundtrack
can be replaced later.

## Source material

- `public/captures/` contains real live demo states captured by `scripts/capture-live.mjs`.
- `public/audio/narration/` contains the local female narration and chapter source text.
- `public/audio/sfx/` contains the downloaded CC0 Freesound accents plus source records.
- `DESIGN_SPEC.md` records the product brief, shot mapping, and frame timeline.
