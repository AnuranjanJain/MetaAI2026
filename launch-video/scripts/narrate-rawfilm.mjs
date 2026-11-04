import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
// RawFilm narration: 12 segments, Esha voice, same settings as interactive.
// Skips segments whose JSON already exists (no duplicate paid requests).
const segments=[
{id:'title',text:'Your day has a thousand pieces. Pocketroom gives them one home.'},
{id:'setup',text:'It starts with trust. Your Muse key stays in your browser. Live is on — and every answer names its model.'},
{id:'voice',text:'Say it. Muse transcribes your voice, understands the plan — mall, tomorrow, two — and asks before anything saves. Nothing ever saves without your tap.'},
{id:'wardrobe',text:'Point at your closet. Muse vision reads the photo and drafts twelve pieces — names, colors, tags. Keep what you love. Then pick tonight\u2019s outfit from what you can actually wear.'},
{id:'decorate',text:'And make the room yours — walls, posters, your own art.'},
{id:'shelves',text:'The room remembers, so you don\u2019t have to. A spot for everything — the adapter lives in the top desk drawer. Even the keys you haven\u2019t found yet stay on the list, honestly marked unknown.'},
{id:'doorway',text:'When it is time to leave, the doorway packs by routine. Adapter, keys, charger. Nothing left behind.'},
{id:'captain',text:'Each morning, dump the day in one breath. Morning Captain, running on Muse Wonder, plans around your fixed events. Review it — accept it — done.'},
{id:'share',text:'Share the day as a poster, dream it bigger with Muse Image, then wrap up and carry forward.'},
{id:'vibe',text:'Leave with a list that reads itself aloud. Come home to your music.'},
{id:'search',text:'And when something goes missing — where did I put the adapter? The room answers. Top desk drawer.'},
{id:'outro',text:'Pocketroom. Make room for today. Built with Muse.'}
];
await fs.mkdir('public/audio/rawfilm',{recursive:true});
for(const s of segments){
 const filename=`public/audio/rawfilm/${s.id}.json`;
 try{await fs.access(filename);console.log('EXISTS',s.id);continue;}catch{}
 const result=await new Promise((resolve,reject)=>{const p=spawn('npx.cmd',['-y','@elevenlabs/cli@latest','text-to-speech','convert_with_timestamps','--voice-id','NxYGDTZngCTtbvawEZyg','--json','-'],{shell:true,windowsHide:true});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('close',code=>code?reject(new Error(err.slice(0,500))):resolve(JSON.parse(out)));p.stdin.end(JSON.stringify({text:s.text,model_id:'eleven_multilingual_v2',voice_settings:{stability:0.38,similarity_boost:0.78,style:0.25,use_speaker_boost:true,speed:1.04}}));});
 await fs.writeFile(`public/audio/rawfilm/${s.id}.mp3`,Buffer.from(result.audio_base64,'base64'));
 const raw=result.normalized_alignment??result.alignment;
 const alignment={characters:raw.characters,characterStartTimesSeconds:raw.character_start_times_seconds,characterEndTimesSeconds:raw.character_end_times_seconds};
 await fs.writeFile(filename,JSON.stringify({...s,alignment},null,2));
 console.log('GENERATED',s.id,alignment?.characterEndTimesSeconds.at(-1));
}
await fs.writeFile('public/audio/rawfilm/script.json',JSON.stringify(segments,null,2));
