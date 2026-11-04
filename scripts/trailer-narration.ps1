Add-Type -AssemblyName System.Speech
$outDir = Join-Path $PSScriptRoot ".." "docs" "video" "audio"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$lines = @(
"What if your to-do list lived somewhere? A little room that knows your whole day. This is Pocketroom. Everything you need for today, in one little place.",
"Your day is a room you can see. Wardrobe, desk, window, door. Every object mirrors a real plan. Side rails on desktop, a tidy app bar on phones, and a late-night mode when the day runs long.",
"Say it, then confirm it. Dentist tomorrow at two thirty. Remind me to buy milk. Where is my adapter? Live Muse, or on-device heuristics, understands. And nothing is ever saved without your tap.",
"Dump the day in one box. The Morning Captain proposes slots, prep, leave-by, outfit and pack list. App code verifies every plan: fixed events never move, nothing overlaps. One tap accepts, all undoable.",
"Notes and screenshots land on the desk. On-device reading is instant, Interpret with Muse goes deeper. Confirm, archive, or discard. The box always clears.",
"The window is your timeline. Step through days, place tasks, plan honest leave-by buffers, set local reminders. And read-my-day reads it all aloud.",
"Add from photo: live Muse vision drafts the item, SAM three point one segments it. Or hand-tag it yourself, and confirm only what you keep.",
"Leaving? The doorway packs by routine, with a running-late mode and a read-aloud checklist. And search shows matches. Never guesses.",
"And yes, it plays. Eight original synth loops, made live in Web Audio. No files, no network. Plus your uploads and named mixes on spinning vinyl.",
"Make it yours. Walls, posters, your own art, saved on-device. Then share the day: an auto-fitting poster, an optional dream upgrade, PNG, or post to X.",
"Under the hood: Vite plus strict TypeScript, zero frameworks. One App State store with a thirty-step undo. Live calls go through Vercel serverless proxies to Muse Spark and Wonder. Keys stay server-side. Models propose. App code disposes.",
"Local-first, honest by design. Demo heuristics wear a demo sticker, live results wear Muse On. Two hundred twenty eight tests keep it that way. Pocketroom. Cozy software for hectic days. Try it live tonight."
)
for ($i = 0; $i -lt $lines.Count; $i++) {
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SelectVoice("Microsoft Zira Desktop")
  $synth.Rate = 1
  $wav = Join-Path $outDir ("scene-{0:D2}.wav" -f ($i + 1))
  if (Test-Path $wav) { Remove-Item $wav -Force }
  $synth.SetOutputToWaveFile($wav)
  $synth.Speak($lines[$i])
  $synth.Dispose()
  Write-Output "done scene $($i + 1)"
}
