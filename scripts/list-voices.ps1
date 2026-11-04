Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
foreach ($v in $synth.GetInstalledVoices()) { Write-Output $v.VoiceInfo.Name }
$synth.Dispose()
