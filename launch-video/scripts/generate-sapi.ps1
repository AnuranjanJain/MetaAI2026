Add-Type -AssemblyName System.Speech

$root = Split-Path -Parent $PSScriptRoot
$inputDir = Join-Path $root 'content\narration'
$outDir = Join-Path $root 'public\audio\narration'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$segments = @(
  @('s01', -1, 1.000),
  @('s02', 0, 1.015),
  @('s03', -1, 0.990),
  @('s04', 0, 1.010),
  @('s05', 1, 1.000),
  @('s06', 0, 0.995),
  @('s07', -1, 1.012),
  @('s08', -1, 0.988),
  @('s09', 0, 1.005),
  @('s10', 1, 1.000)
)

foreach ($item in $segments) {
  $name = $item[0]
  $rate = [int]$item[1]
  $pitch = [double]$item[2]
  $text = Get-Content -Raw (Join-Path $inputDir "$name.txt")
  $base = Join-Path $outDir "$name-base.wav"
  $final = Join-Path $outDir "$name.mp3"

  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SelectVoice('Microsoft Zira Desktop')
  $synth.Rate = $rate
  $synth.Volume = 100
  $synth.SetOutputToWaveFile($base)
  $synth.Speak($text)
  $synth.Dispose()

  $tempo = 1 / $pitch
  & ffmpeg -y -loglevel error -i $base -filter:a "asetrate=22050*$pitch,aresample=44100,atempo=$tempo" -codec:a libmp3lame -q:a 2 $final
  if ($LASTEXITCODE -ne 0) { throw "Could not encode $name" }
  Remove-Item -LiteralPath $base -Force
}

Write-Output "Generated $($segments.Count) local female narration segments."
