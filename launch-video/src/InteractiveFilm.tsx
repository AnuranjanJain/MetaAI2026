import React from 'react';
import {AbsoluteFill,Audio,OffthreadVideo,Sequence,interpolate,staticFile,useCurrentFrame} from 'remotion';
import {Intro,Outro} from './InteractiveBrand';
import {UpgradeArchitecture,ARCHITECTURE_FRAMES} from './UpgradeArchitecture';
import data from './interactive-data.json';
export const FPS=30,DEMO_END=4290,ARCHITECTURE_START=4290,OUTRO_START=5940,TOTAL_FRAMES=6030;
const C={paper:'#fbf7ec',ink:'#20302a',sage:'#9db4a0',terra:'#c96f4a'};
export const Demo:React.FC<{src:string;title:string;detail:string;duration:number;index?:number;clicks?:{at:number;x:number;y:number}[]}>=({src,title,detail,duration,index=0,clicks=[]})=>{
 const f=useCurrentFrame();const q=interpolate(f,[0,18],[0,1],{extrapolateRight:'clamp'});
 return <AbsoluteFill style={{background:C.paper,fontFamily:'Segoe UI, Arial',color:C.ink}}>
 <div style={{position:'absolute',left:72,top:43,fontSize:19,letterSpacing:4,color:'#52685a'}}>POCKETROOM / LIVE WALKTHROUGH</div>
 <div style={{position:'absolute',left:72,top:80,fontFamily:'Georgia',fontSize:49,transform:`translateY(${(1-q)*20}px)`,opacity:q}}>{title}</div>
 <div style={{position:'absolute',right:75,top:64,fontSize:25,fontWeight:600,color:C.terra}}>{String(index+1).padStart(2,'0')} / 10</div>
 <div style={{position:'absolute',left:64,top:162,width:1792,height:800,borderRadius:22,overflow:'hidden',boxShadow:'0 14px 35px #20302a24',border:'1px solid #d9cdb4'}}>
 <OffthreadVideo src={staticFile(src)} muted style={{position:'absolute',width:1024,height:640,left:0,top:80}}/>
 <div style={{position:'absolute',left:1024,top:0,width:768,height:800,background:'#e7efe4',overflow:'hidden'}}>
 <OffthreadVideo src={staticFile(src)} muted style={{position:'absolute',width:2304,height:1440,left:-1536,top:-Math.min(360, f/(duration*30)*360)}}/>
 </div>
 <div style={{position:'absolute',left:1024,top:0,width:4,height:800,background:C.terra}}/>
 {clicks.map((c,i)=>{const age=f-c.at*30;return age>=0&&age<24?<><div key={`ring-${i}`} style={{position:'absolute',left:c.x*1024/1440-20,top:80+c.y*640/900-20,width:40,height:40,border:'2px solid #fbf7ec',borderRadius:'50%',opacity:Math.sin(Math.PI*age/24)*.8,transform:`scale(${1+age/32})`,boxShadow:'0 0 0 2px #c96f4a'}}/><div key={`dot-${i}`} style={{position:'absolute',left:c.x*1024/1440-4,top:80+c.y*640/900-4,width:8,height:8,borderRadius:'50%',background:C.terra,boxShadow:'0 0 0 4px #fbf7ec'}}/></>:null;})}
 <div style={{position:'absolute',left:19,bottom:17,background:C.ink,color:C.paper,borderRadius:30,padding:'9px 18px',fontSize:19}}>● Recorded on pocketroom-six.vercel.app</div>
 </div>
 <div style={{position:'absolute',left:72,top:969,fontSize:22,color:'#52685a'}}>{detail}</div>
 <div style={{position:'absolute',bottom:0,left:0,height:5,width:`${100*f/(duration*30)}%`,background:C.terra}}/>
 </AbsoluteFill>;
};
export const Caption:React.FC<{text:string}>=({text})=><div style={{position:'absolute',bottom:24,left:'50%',transform:'translateX(-50%)',maxWidth:1640,whiteSpace:'nowrap',background:'#20302af5',color:C.paper,padding:'13px 27px',borderRadius:13,fontFamily:'Segoe UI, Arial',fontSize:31,fontWeight:500,boxShadow:'0 5px 20px #0002'}}>{text}</div>;
export const SFX:{from:number;duration:number;src:string;volume:number}[]=data.scenes.flatMap((s)=>s.clicks.filter(c=>c.at<0.3).map(c=>({from:Math.round((s.from+c.at)*30),duration:35,src:'audio/sfx/fs-876011.mp3',volume:.16})));
export const InteractiveFilm:React.FC<{bgm?:boolean}>=({bgm=true})=><AbsoluteFill style={{background:C.paper}}>
 <Sequence durationInFrames={600}><Intro/></Sequence>
 {data.scenes.map((s,i)=><Sequence key={s.id} from={s.from*30} durationInFrames={s.duration*30}><Demo {...s} index={i}/></Sequence>)}
 <Sequence from={ARCHITECTURE_START} durationInFrames={ARCHITECTURE_FRAMES}><UpgradeArchitecture/></Sequence>
 <Sequence from={OUTRO_START} durationInFrames={90}><Outro/></Sequence>
 {data.speech.map(s=>{const shift=s.id.startsWith('arch-')?143:s.id==='outro'?195:0;return <Sequence key={s.id} from={(s.from+shift)*30} durationInFrames={s.duration*30}><Audio src={staticFile(s.src)}/></Sequence>;})}
 {data.captions.map((c,i)=>{const shift=c.from>=198?195:c.from>=143?143:0;return <Sequence key={i} from={Math.round((c.from+shift)*30)} durationInFrames={Math.max(1,Math.round((c.to-c.from)*30))}><Caption text={c.text}/></Sequence>;})}
 {SFX.map((s,i)=><Sequence key={i} from={s.from} durationInFrames={s.duration}><Audio src={staticFile(s.src)} volume={s.volume}/></Sequence>)}
 {bgm&&<Audio src={staticFile('audio/bgm/interactive-original.wav')} volume={f=>f<150?.58:f>=ARCHITECTURE_START?.22:.27}/>}
 </AbsoluteFill>;
