import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const main='interactive/289c0677d4cc2fc1ef37f9bab7dd0475.webm';
const retry='interactive-retry/527ca1b8f20e7fbaccf3ce78c2af4916.webm';
const definitions=[
 ['capture','Capture a thought','Add → write → review → confirm',main,[[2.225,10.986]],16],
 ['muse','Your assistant. Your choice.','Live Muse on / off · voice input',main,[[10.986,17.15]],7],
 ['decor','A room that feels like you','Wall colours · custom poster',retry,[[2.04,6.836]],7],
 ['music','Set the mood','Name · add track · play',main,[[24.32,27.726]],11],
 ['wardrobe','From photo to wardrobe','Muse Spark vision · review · categorise',retry,[[6.836,11.2],[24.0,28.1]],22],
 ['outfit','One less morning decision','Occasions · keep ideas · build an outfit',retry,[[28.1,33.3]],9],
 ['window','Make space for the day','Events · flexible tasks · schedule · done',main,[[69.037,81.613]],14],
 ['captain','A brain dump. A clear plan.','Morning Captain · review before accepting',main,[[81.613,89],[125.9,128.672]],11],
 ['share','Close today. Open tomorrow.','Download poster · carry forward · wrap day',main,[[128.672,134.401]],9],
 ['door','Leave with a little less stress','Packing · routines · storage · essentials',main,[[134.401,150.0]],17],
];
const run=(args)=>{const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{encoding:'utf8',windowsHide:true});if(r.status)throw new Error(r.stderr);};
await fs.mkdir('public/edited',{recursive:true});
let from=20;const scenes=[];
for(const [id,title,detail,src,ranges,duration] of definitions){
 if(id==='wardrobe')ranges.splice(0,ranges.length,[6.836,11.2],[24,25.4],[25.4,28.1]);
 const raw=ranges.reduce((n,[a,b])=>n+b-a,0);const multiplier=duration/raw;
 const lengths=id==='wardrobe'?[4,7,11]:ranges.map(([a,b])=>(b-a)*multiplier);
 const filter=ranges.map(([a,b],i)=>`[0:v]trim=start=${a}:end=${b},setpts=(PTS-STARTPTS)*${lengths[i]/(b-a)}[v${i}]`).join(';')+`;${ranges.map((_,i)=>`[v${i}]`).join('')}concat=n=${ranges.length}:v=1:a=0,fps=30,format=yuv420p[out]`;
 run(['-i',`public/${src}`,'-filter_complex',filter,'-map','[out]','-t',String(duration),'-an','-c:v','libx264','-preset','fast','-crf','19',`public/edited/${id}.mp4`]);
 const trace=JSON.parse(await fs.readFile(`public/${src.startsWith('interactive-retry')?'interactive-retry':'interactive'}/trace.json`,'utf8'));
 let elapsed=0;const clicks=[];for(const [ri,[a,b]] of ranges.entries()){for(const e of trace.events){const at=e.at-.65;if(e.type==='click'&&e.box&&at>=a&&at<b)clicks.push({at:elapsed+(at-a)*lengths[ri]/(b-a),x:e.box.x+e.box.width/2,y:e.box.y+e.box.height/2});}elapsed+=lengths[ri];}
 scenes.push({id,title,detail,from,duration,src:`edited/${id}.mp4`,clicks});from+=duration;console.log('EDITED',id);
}
const script=JSON.parse(await fs.readFile('public/audio/interactive/script.json','utf8'));const captions=[];const speech=[];
for(const segment of script){
 const data=JSON.parse(await fs.readFile(`public/audio/interactive/${segment.id}.json`,'utf8'));
 const a=data.alignment;const length=a.characterEndTimesSeconds.at(-1);
 const target=segment.duration-.35;
 const rate=Math.max(1,length/target);
 run(['-i',`public/audio/interactive/${segment.id}.mp3`,'-af',`atempo=${rate},loudnorm=I=-16:TP=-1.5:LRA=9`,'-ar','48000',`public/audio/interactive/${segment.id}-fit.wav`]);
 speech.push({...segment,src:`audio/interactive/${segment.id}-fit.wav`,rate});
 let phrase='',start=0,end=0;
 for(let i=0;i<a.characters.length;i++){const ch=a.characters[i];if(!phrase.trim()&&ch.trim())start=a.characterStartTimesSeconds[i];phrase+=ch;end=a.characterEndTimesSeconds[i];if((phrase.length>48&&ch===' ')||/[.!?]/.test(ch)||i===a.characters.length-1){if(phrase.trim())captions.push({segmentId:segment.id,text:phrase.trim(),from:segment.from+start/rate,to:segment.from+end/rate});phrase='';}}
}
await fs.writeFile('src/interactive-data.json',JSON.stringify({scenes,speech,captions,architecture:script.filter(s=>s.id.startsWith('arch-'))},null,2));
// Original ambient score: deterministic soft pad, no third-party recording.
const sr=22050,seconds=201,pcm=Buffer.alloc(sr*seconds*2),chords=[[130.81,164.81,196],[110,130.81,164.81],[87.31,110,130.81],[98,123.47,146.83]];
for(let i=0;i<sr*seconds;i++){const t=i/sr,bar=Math.floor(t/8),u=t%8,chord=chords[bar%4];const fade=Math.min(1,t/1.5,(seconds-t)/3);const env=Math.sin(Math.PI*u/8)**.6;let v=0;for(const f of chord)v+=Math.sin(2*Math.PI*f*t)*.024+Math.sin(2*Math.PI*f*2*t)*.005;v*=env*fade;if(t>=126&&t<198)v*=.62;pcm.writeInt16LE(Math.round(v*32767),i*2);}
const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(pcm.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(sr,24);header.writeUInt32LE(sr*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);await fs.writeFile('public/audio/bgm/interactive-original.wav',Buffer.concat([header,pcm]));
console.log('BUILT',from,'seconds');
