import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
const ARCHITECTURE_NARRATION = [
  'Behind the room: Vite, strict TypeScript, and a hand-built SVG interface. One state store connects scheduling, outfits and packing. Your day stays in localStorage; music uploads use IndexedDB. Intelligence is optional. The core works locally.',
  'Live requests use your browser key directly, or a Vercel proxy with a server secret. Spark understands intent and photos. Captain tries Wonder, then Spark, then a labeled local fallback. Baseten is a separate, optional provider.',
  'Each API route has a job. Interpret and propose structure your input. Tag-photo drafts clothing. The Captain routes propose plans. Transcribe handles speech. Dream creates posters; SAM segments images through the proxy. Responses are normalized before use.',
  'Finally, the trust boundary. Code checks every proposal: fields, IDs, times and conflicts. Fixed events stay fixed. Outfits use available clothes. You review and confirm. One undoable update changes your room. You stay in control.',
];

const architecture = [
  {id:'arch-local',from:0,duration:14,text:ARCHITECTURE_NARRATION[0]},
  {id:'arch-routing',from:14,duration:15,text:ARCHITECTURE_NARRATION[1]},
  {id:'arch-routes',from:29,duration:14,text:ARCHITECTURE_NARRATION[2]},
  {id:'arch-trust',from:43,duration:12,text:ARCHITECTURE_NARRATION[3]},
];
const segments=[
  {id:'hook',from:0,duration:5,text:'Your whole day is scattered. Pocketroom brings it home.'},
  {id:'story',from:5,duration:15,text:'A note gets lost. A meeting sneaks up. The right clothes are still in the laundry. And at the door: did you pack everything? Meet Pocketroom: one living room for the little things that make a day work.'},
  {id:'capture',from:20,duration:16,text:'On the live site, add a design review with its time and what to bring. Save the capture, ask Muse to interpret it, then review and confirm the proposal. Or open the voice assistant and speak your thought instead.'},
  {id:'muse',from:36,duration:7,text:'Muse live on: model-powered help when you choose. Turn it off, and the local experience stays right here.'},
  {id:'decor',from:43,duration:7,text:'Change the wall colour, then make the room yours with a custom poster.'},
  {id:'music',from:50,duration:11,text:'Open the record player. Name a playlist, add Morning Window, and play it. Your mixes and uploaded songs stay in this browser.'},
  {id:'wardrobe',from:61,duration:22,text:'From wardrobe, add a photo and ask Muse Spark vision to identify the clothes. Review the named drafts, save the pieces you want, then mark items worn, in laundry, or unavailable. Occasion ideas only use clothes you can wear.'},
  {id:'outfit',from:83,duration:9,text:'Choose an occasion for outfit ideas. Keep a suggestion, or build and save your own look.'},
  {id:'window',from:92,duration:14,text:'At the window, schedule a meeting, add a flexible task, place it in an open slot, then mark it done. Fixed events stay put; your plan stays editable.'},
  {id:'captain',from:106,duration:11,text:'Morning Captain turns a brain dump into a proposed plan. Review its tasks and timing, then accept the changes yourself.'},
  {id:'share',from:117,duration:9,text:'Share today as a poster. Wrap up, or carry unfinished work into tomorrow.'},
  {id:'door',from:126,duration:17,text:'Before you leave, choose an event, build a packing list, add a water bottle, and check items off. Save a routine, link belongings to their shelf, read the list aloud, or switch to essentials when you are late.'},
  ...architecture,
  {id:'outro',from:198,duration:3,text:'Pocketroom. Make room for today.'},
];

await fs.mkdir('public/audio/interactive',{recursive:true});
for(const s of segments){
 const jsonPath=`public/audio/interactive/${s.id}.json`;
 try{await fs.access(jsonPath);console.log('EXISTS',s.id);continue;}catch{}
 const result=await new Promise((resolve,reject)=>{const p=spawn('npx.cmd',['-y','@elevenlabs/cli@latest','text-to-speech','convert_with_timestamps','--voice-id','NxYGDTZngCTtbvawEZyg','--json','-'],{shell:true,windowsHide:true});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('close',code=>code?reject(new Error(err)):resolve(JSON.parse(out)));p.stdin.end(JSON.stringify({text:s.text,model_id:'eleven_multilingual_v2',voice_settings:{stability:0.35,similarity_boost:0.78,style:0.3,use_speaker_boost:true,speed:1.2}}));});
 await fs.writeFile(`public/audio/interactive/${s.id}.mp3`,Buffer.from(result.audio_base64,'base64'));
 const raw=result.normalized_alignment??result.alignment;
 const alignment={characters:raw.characters,characterStartTimesSeconds:raw.character_start_times_seconds,characterEndTimesSeconds:raw.character_end_times_seconds};
 await fs.writeFile(jsonPath,JSON.stringify({...s,alignment},null,2));
 console.log('GENERATED',s.id,alignment.characterEndTimesSeconds.at(-1));
}
await fs.writeFile('public/audio/interactive/script.json',JSON.stringify(segments,null,2));
