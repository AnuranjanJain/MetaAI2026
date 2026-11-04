import React from 'react';
import {AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile, useCurrentFrame, interpolate, Easing} from 'remotion';
import {UpgradeArchitecture} from './UpgradeArchitecture';

const C={paper:'#fbf7ec',ink:'#20302a',terra:'#c96f4a',butter:'#f2d675',sage:'#9db4a0'};
const ease=Easing.bezier(.16,1,.3,1);
const q=(f:number,a:number,b:number)=>interpolate(f,[a,b],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:ease});
const TextMask:React.FC<{f:number}>=({f})=><AbsoluteFill style={{background:C.ink,justifyContent:'center',alignItems:'center',overflow:'hidden'}}>
  <div style={{position:'absolute',width:760,height:760,border:'2px solid #9db4a044',borderRadius:'50%',transform:`scale(${.7+q(f,0,90)*.35}) rotate(${f*.6}deg)`}}/>
  <div style={{fontFamily:'Georgia',fontSize:166,color:C.paper,fontWeight:700,letterSpacing:-6,clipPath:`inset(${(1-q(f,30,120))*100}% 0 0 0)`,transform:`translateY(${(1-q(f,0,90))*50}px)`}}>Pocketroom</div>
  <div style={{marginTop:28,fontSize:34,letterSpacing:8,color:C.butter,opacity:q(f,95,130)}}>MAKE ROOM FOR TODAY</div>
</AbsoluteFill>;
const Problem:React.FC<{f:number}>=({f})=><AbsoluteFill style={{background:'#e7efe4',color:C.ink,padding:110,boxSizing:'border-box'}}>
  <div style={{fontSize:25,letterSpacing:6,color:C.terra,opacity:q(f,0,20)}}>THE PROBLEM</div>
  <div style={{fontFamily:'Georgia',fontSize:88,lineHeight:1.08,maxWidth:1500,marginTop:55}}>Your day gets lost in the gaps.</div>
  {['A note in one place.','A meeting in another.','Clothes to choose.','And the door is already waiting.'].map((t,i)=><div key={t} style={{position:'absolute',left:120+i*410,top:620-(i%2)*95,opacity:q(f,35+i*15,65+i*15),transform:`translateY(${(1-q(f,35+i*15,65+i*15))*60}px)`,fontFamily:'Georgia',fontSize:34,color:i===3?C.terra:C.ink}}>{t}</div>)}
  <div style={{position:'absolute',left:120,bottom:115,fontSize:30,color:'#52685a',opacity:q(f,100,125)}}>Pocketroom gives the little things one familiar home.</div>
</AbsoluteFill>;
export const CutLaunch:React.FC<{bgm?:boolean}>=({bgm=true})=><AbsoluteFill style={{background:C.paper}}>
  <Sequence from={0} durationInFrames={150}><TextMask f={useCurrentFrame()}/></Sequence>
  <Sequence from={150} durationInFrames={300}><Problem f={useCurrentFrame()}/></Sequence>
  <Sequence from={450} durationInFrames={3960}><DemoCut/></Sequence>
  <Sequence from={4410} durationInFrames={900}><UpgradeArchitecture durationInFrames={900}/></Sequence>
  <Sequence from={5310} durationInFrames={90}><AbsoluteFill style={{background:C.ink,justifyContent:'center',alignItems:'center'}}><div style={{fontFamily:'Georgia',fontSize:118,color:C.paper,opacity:q(useCurrentFrame(),0,35),transform:`scale(${.88+.12*q(useCurrentFrame(),0,35)})`}}>Pocketroom</div><div style={{fontSize:28,letterSpacing:6,color:C.butter,marginTop:28,opacity:q(useCurrentFrame(),25,45)}}>MAKE ROOM FOR TODAY</div></AbsoluteFill></Sequence>
  {bgm&&<Audio src={staticFile('audio/bgm/interactive-original.wav')} volume={.24}/>} 
  <Sequence from={0} durationInFrames={150}><Audio src={staticFile('audio/cut-voice/hook.wav')}/></Sequence>
  <Sequence from={150} durationInFrames={300}><Audio src={staticFile('audio/cut-voice/problem.wav')}/></Sequence>
  <Sequence from={4410} durationInFrames={225}><Audio src={staticFile('audio/interactive/arch-local-fit.wav')}/></Sequence>
  <Sequence from={4635} durationInFrames={225}><Audio src={staticFile('audio/interactive/arch-routing-fit.wav')}/></Sequence>
  <Sequence from={4860} durationInFrames={225}><Audio src={staticFile('audio/interactive/arch-routes-fit.wav')}/></Sequence>
  <Sequence from={5085} durationInFrames={225}><Audio src={staticFile('audio/interactive/arch-trust-fit.wav')}/></Sequence>
</AbsoluteFill>;

const chapters=[['CAPTURE','Add a thought. Keep the next step.',0],['MUSE','Your assistant, your choice.',600],['WARDROBE','See it. Tag it. Wear what is available.',1300],['WINDOW','Make space for the day.',2200],['DOORWAY','Leave with a little less stress.',3150]] as const;
const DemoCut:React.FC=()=>{const f=useCurrentFrame();const pulse=Math.sin(f/18)*.006;const chapter=[...chapters].reverse().find(x=>f>=x[2])??chapters[0];const local=f-chapter[2];const wipe=q(f,0,18);return <AbsoluteFill style={{background:C.paper,overflow:'hidden'}}>
  <div style={{position:'absolute',inset:0,transform:`scale(${1.015+pulse+.035*Math.exp(-local/22)})`,transformOrigin:'50% 50%',filter:`saturate(${1.04+.04*Math.sin(f/70)})`}}><OffthreadVideo src={staticFile('cut-pocketroom.mp4')} startFrom={f} endAt={3960} muted style={{width:'100%',height:'100%',objectFit:'cover'}}/></div>
  <div style={{position:'absolute',inset:0,background:C.terra,opacity:Math.max(0,1-wipe)*.18,transform:`translateX(${(1-wipe)*100}%)`}}/>
  <div style={{position:'absolute',left:70,top:55,fontFamily:'Segoe UI',fontSize:23,letterSpacing:5,color:C.paper,textShadow:'0 2px 8px #000'}}>POCKETROOM / LIVE DEMO</div>
  <div style={{position:'absolute',left:70,top:120,background:'#20302add',color:C.butter,padding:'13px 22px',borderRadius:18,fontFamily:'Georgia',fontSize:34,opacity:q(local,0,18),transform:`translateX(${(1-q(local,0,18))*-30}px)`}}>{chapter[0]}</div>
  <div style={{position:'absolute',left:70,bottom:48,fontSize:22,color:C.paper,background:'#20302acc',padding:'10px 18px',borderRadius:16}}>Live site · pocketroom-six.vercel.app</div>
  <div style={{position:'absolute',left:1150+Math.sin(f/23)*170,top:570+Math.cos(f/19)*120,width:28,height:28,border:'3px solid white',borderRadius:'50%',boxShadow:`0 0 0 5px ${C.terra},0 0 22px ${C.butter}`,opacity:.85}}/>
  <div style={{position:'absolute',right:80,top:120,fontSize:22,letterSpacing:3,color:C.paper,opacity:.9}}>{String(Math.floor(f/30)).padStart(3,'0')} / LIVE</div>
</AbsoluteFill>};
