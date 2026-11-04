import {Intro,Outro} from './InteractiveBrand';
import {Demo,Caption,InteractiveFilm,SFX,ARCHITECTURE_START,OUTRO_START,TOTAL_FRAMES} from './InteractiveFilm';
import {UpgradeArchitecture} from './UpgradeArchitecture';
import data from './interactive-data.json';

export const WORKBENCH={
 name:'Pocketroom · live product launch',fps:30,width:1920,height:1080,total:TOTAL_FRAMES,
 background:'#fbf7ec',revision:'live-launch-201s-esha-125x',original:InteractiveFilm,
 shots:[
  {id:'intro',label:'Hook and animated story',from:0,duration:600,component:Intro},
  ...data.scenes.map((s,i)=>({id:s.id,label:s.title,from:s.from*30,duration:s.duration*30,component:Demo,props:{...s,index:i},schema:[{type:'text',key:'title',label:'Title',default:s.title},{type:'text',key:'detail',label:'Detail',default:s.detail}]})),
  {id:'architecture',label:'Animated system architecture',from:ARCHITECTURE_START,duration:1650,component:UpgradeArchitecture,durationProp:'durationInFrames'},
  {id:'outro',label:'Pocketroom closing mark',from:OUTRO_START,duration:90,component:Outro},
 ],
 transitions:[],
 captions:data.captions.map((c,i)=>{const shift=c.from>=198?195:c.from>=143?143:0;return {id:`caption-${i}`,label:c.text,from:Math.round((c.from+shift)*30),duration:Math.max(1,Math.round((c.to-c.from)*30)),component:Caption,props:{text:c.text},schema:[{type:'text',key:'text',label:'Subtitle',default:c.text}]};}),
 overlays:[],sfx:SFX,
 bgm:[{from:0,duration:TOTAL_FRAMES,src:'audio/bgm/interactive-original.wav',volume:.27}],
};
