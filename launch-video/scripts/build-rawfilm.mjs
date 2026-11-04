import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
// Build src/rawfilm-vo.json: durations + caption lines from ElevenLabs
// alignments. Captions keep RELATIVE times; the comp offsets by VO start.
const ids=['title','setup','voice','wardrobe','decorate','shelves','doorway','captain','share','vibe','search','outro'];
const probe=(f)=>new Promise((resolve,reject)=>execFile('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',f],(e,so)=>e?reject(e):resolve(parseFloat(so))));
function captions(al){
 const out=[];let start=0,text='';
 const push=(end)=>{const t=text.trim();if(t.length>1)out.push({text:t,from:start,to:end});text='';};
 for(let i=0;i<al.characters.length;i++){
  if(!text)start=al.characterStartTimesSeconds[i];
  text+=al.characters[i];
  const end=al.characterEndTimesSeconds[i];
  if(/[.?!—–:;]$/.test(text.trim())&&text.trim().length>8){push(end);start=end;}
  else if(text.trim().length>=44&&/\s/.test(al.characters[i])){push(end);start=end;}
 }
 push(al.characterEndTimesSeconds.at(-1));
 return out;
}
const vo={};
for(const id of ids){
 const j=JSON.parse(await fs.readFile(`public/audio/rawfilm/${id}.json`,'utf8'));
 const dur=await probe(`public/audio/rawfilm/${id}.mp3`);
 vo[id]={dur,caps:captions(j.alignment)};
 console.log(id,dur.toFixed(2)+'s',vo[id].caps.length+' caps');
}
await fs.writeFile('src/rawfilm-vo.json',JSON.stringify(vo,null,1));
console.log('WROTE src/rawfilm-vo.json');
