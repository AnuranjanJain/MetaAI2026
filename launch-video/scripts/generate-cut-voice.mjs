import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
const out='public/audio/cut-voice'; await fs.mkdir(out,{recursive:true});
const parts=[
 ['hook','Your whole day is scattered. Pocketroom brings it home.'],
 ['problem','A note gets lost. A meeting sneaks up. The right clothes are still in the laundry. And at the door: did you pack everything? Pocketroom gives the little things one familiar home.'],
];
for(const [id,text] of parts){const p=spawn('npx.cmd',['-y','@elevenlabs/cli@latest','text-to-speech','convert','--voice-id','qBDvhofpxp92JgXJxDjB','--output-format','mp3_44100_128','--output',`${out}/${id}.mp3`,'--text',text,'--model-id','eleven_multilingual_v2','--voice-settings.speed','1.2'],{shell:true,windowsHide:true}); await new Promise((res,rej)=>{p.on('close',c=>c?rej(new Error(`${id} failed`)):res());}); const wav=`${out}/${id}.wav`; const {spawnSync}=await import('node:child_process'); const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',`${out}/${id}.mp3`,'-af','loudnorm=I=-16:TP=-1.5:LRA=9','-ar','48000',wav],{windowsHide:true}); if(r.status)throw new Error(r.stderr); console.log(id);}
