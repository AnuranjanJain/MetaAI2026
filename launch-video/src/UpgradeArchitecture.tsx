import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';

export const ARCHITECTURE_FRAMES = 1650;
export const ARCHITECTURE_NARRATION = [
  'Behind the room: Vite, strict TypeScript, and a hand-built SVG interface. One state store connects scheduling, outfits and packing. Your day stays in localStorage; music uploads use IndexedDB. Intelligence is optional. The core works locally.',
  'Live requests use your browser key directly, or a Vercel proxy with a server secret. Spark understands intent and photos. Captain tries Wonder, then Spark, then a labeled local fallback. Baseten is a separate, optional provider.',
  'Each API route has a job. Interpret and propose structure your input. Tag-photo drafts clothing. The Captain routes propose plans. Transcribe handles speech. Dream creates posters; SAM segments images through the proxy. Responses are normalized before use.',
  'Finally, the trust boundary. Code checks every proposal: fields, IDs, times and conflicts. Fixed events stay fixed. Outfits use available clothes. You review and confirm. One undoable update changes your room. You stay in control.',
];
const C = {paper:'#fbf7ec', ink:'#20302a', sage:'#9db4a0', butter:'#f2d675', terra:'#c96f4a', line:'#d9cdb4', teal:'#6f9a94'};
const ease = Easing.bezier(.3,0,.2,1);
const progress = (f:number, start:number, length=22) => interpolate(f,[start,start+length],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:ease});
type NodeProps = {x:number;y:number;w?:number;title:string;body:string;frame:number;at:number;accent?:string};
const Node:React.FC<NodeProps> = ({x,y,w=450,title,body,frame,at,accent=C.sage}) => {
  const q=progress(frame,at);
  return <div style={{position:'absolute',left:x,top:y,width:w,minHeight:150,boxSizing:'border-box',padding:'27px 30px',borderRadius:22,background:C.paper,border:`2px solid ${C.line}`,borderTop:`7px solid ${accent}`,boxShadow:'0 15px 35px #20302a0c',opacity:q,transform:`translateY(${(1-q)*32}px)`}}><div style={{fontFamily:'Georgia',fontSize:35,lineHeight:1.15,marginBottom:15}}>{title}</div><div style={{fontSize:23,lineHeight:1.4,whiteSpace:'pre-line',color:'#52685a'}}>{body}</div></div>;
};
const Wire:React.FC<{d:string;f:number;at:number;color?:string}> = ({d,f,at,color=C.terra}) => {
  const q=progress(f,at,34);
  return <g opacity={q}><path d={d} fill="none" stroke={C.line} strokeWidth={3}/><path d={d} fill="none" stroke={color} strokeWidth={4} pathLength={1} strokeDasharray="1" strokeDashoffset={1-q}/>{q>.99&&<path d={d} fill="none" stroke={C.butter} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray=".025 .975" strokeDashoffset={-((f-at)%120)/120}/>}</g>;
};
const Header:React.FC<{number:string;title:string;detail:string;f:number}> = ({number,title,detail,f}) => <><div style={{position:'absolute',top:65,left:90,fontSize:21,letterSpacing:4,color:C.terra}}>UNDER THE ROOM / {number}</div><div style={{position:'absolute',top:115,left:90,fontFamily:'Georgia',fontSize:65,letterSpacing:-2,opacity:progress(f,0),transform:`translateY(${(1-progress(f,0))*25}px)`}}>{title}</div><div style={{position:'absolute',left:94,top:208,fontSize:27,color:'#52685a',opacity:progress(f,12)}}>{detail}</div></>;

function Overview({f}:{f:number}) {
 return <><Header number="01 · HIGH-LEVEL DESIGN" title="A room outside. A local-first system inside." detail="The interface stays close. Intelligence is called when you ask." f={f}/>
 <svg width={1920} height={1080} style={{position:'absolute'}}><Wire d="M540 450 H730" f={f} at={55}/><Wire d="M1180 450 H1370" f={f} at={95}/><Wire d="M950 550 V685" f={f} at={130}/></svg>
 <Node x={90} y={360} title="Your room" body={'Vite + strict TypeScript\nDOM interface · hand-built SVG'} frame={f} at={25}/><Node x={730} y={360} title="AppState + core rules" body={'One state store · undoable changes\nScheduling · outfits · packing'} frame={f} at={65} accent={C.terra}/><Node x={1370} y={360} title="On-device storage" body={'localStorage: your day + playlists\nIndexedDB: uploaded music'} frame={f} at={105}/><Node x={730} y={685} title="Optional intelligence" body={'Explicitly sent text, audio or images\nMeta APIs return proposals'} frame={f} at={145} accent={C.teal}/>
 <div style={{position:'absolute',left:100,top:845,fontFamily:'Georgia',fontSize:41,color:C.terra,opacity:progress(f,210)}}>Your day works locally.</div><div style={{position:'absolute',left:100,top:903,fontSize:26,color:'#52685a',opacity:progress(f,245)}}>AI enriches the workflow; app code owns the rules.</div></>;
}
function Routing({f}:{f:number}) {
 return <><Header number="02 · MODEL ROUTING" title="One action. The right model." detail="Meta is the selected path. Each result names its model and fallback." f={f}/>
 <svg width={1920} height={1080} style={{position:'absolute'}}><Wire d="M520 448 H700 V385 H900" f={f} at={45}/><Wire d="M520 448 H650 V650 H900" f={f} at={90}/><Wire d="M1350 385 H1460 V500 H1585" f={f} at={120}/><Wire d="M1350 650 H1460 V500 H1585" f={f} at={145}/></svg>
 <Node x={90} y={360} w={430} title="Browser request" body={'Direct BYOK\nKey stays in this browser'} frame={f} at={20} accent={C.terra}/><Node x={900} y={300} title="Meta direct" body={'Spark: intent + photo understanding\nWonder-first: Morning Captain'} frame={f} at={55} accent={C.teal}/><Node x={900} y={565} title="Vercel proxy" body={'/api/* → Meta Model API\nServer secret stays server-side'} frame={f} at={100}/><Node x={1585} y={412} w={245} title="Proposal" body={'Validated\nNot auto-saved'} frame={f} at={155} accent={C.butter}/>
 <div style={{position:'absolute',left:95,top:770,width:1250,fontSize:25,lineHeight:1.6,opacity:progress(f,210)}}><strong style={{color:C.terra}}>Captain:</strong> Wonder → Spark fallback → labeled local fallback.<br/><strong style={{color:C.teal}}>Optional provider:</strong> Spark Open on Baseten, only when selected.<br/>Vision, transcription and image generation remain on Meta.</div></>;
}
const ROUTES = [
 ['Understand','/interpret · /propose · /tag-photo','Muse Spark'],
 ['Plan','/wonder-captain · /captain','Wonder first · Spark fallback'],
 ['Listen','/transcribe','Muse Voice Transcribe'],
 ['Create','/dream · /sam-segment','Muse Image · SAM 3.1'],
];
function Routes({f}:{f:number}) {
 const active=Math.min(3,Math.floor(Math.max(0,f-35)/100));
 return <><Header number="03 · LOW-LEVEL DESIGN" title="Small API boundaries. Specific jobs." detail="These are real routes in the application, not a single opaque AI call." f={f}/>
 {ROUTES.map(([verb,routes,model],i)=>{const q=progress(f,25+i*100);const focus=active===i;return <div key={verb} style={{position:'absolute',top:305+i*135,left:95,width:1730,height:112,display:'flex',alignItems:'center',boxSizing:'border-box',padding:'0 34px',borderRadius:18,background:focus?C.ink:'#f4efdf',color:focus?C.paper:C.ink,opacity:q,transform:`translateX(${(1-q)*-65}px)`,border:`1px solid ${C.line}`}}><div style={{width:290,fontFamily:'Georgia',fontSize:43}}>{verb}</div><div style={{flex:1,fontFamily:'Consolas, monospace',fontSize:27}}>/api{routes.startsWith('/')?routes:' '+routes}</div><div style={{fontSize:26,color:focus?C.butter:'#52685a',width:400,textAlign:'right'}}>{model}</div></div>;})}
 <div style={{position:'absolute',left:100,top:890,fontSize:25,color:'#52685a',opacity:progress(f,370)}}>SAM segmentation uses its server proxy; model output is normalized before use.</div></>;
}
function Trust({f}:{f:number}) {
 const stages=[['Propose','Untrusted model output'],['Verify','Shape · ids · times · conflicts'],['Confirm','Review, edit, then accept'],['Commit','One undoable state change']];
 return <><Header number="04 · TRUST BOUNDARY" title="Muse proposes. Code verifies. You decide." detail="Intelligence without surrendering control of your day." f={f}/>
 <svg width={1920} height={1080} style={{position:'absolute'}}>{[0,1,2].map(i=><Wire key={i} d={`M${495+i*440} 470 H${535+i*440}`} f={f} at={70+i*55}/>)}</svg>
 {stages.map(([title,body],i)=><Node key={title} x={95+i*440} y={380} w={400} title={title} body={body} frame={f} at={25+i*55} accent={[C.teal,C.terra,C.butter,C.sage][i]}/>)}
 {['Fixed events stay fixed.','Unknown IDs are rejected.','Available clothes only.'].map((text,i)=><div key={text} style={{position:'absolute',left:110+i*580,top:680,fontSize:29,color:C.ink,opacity:progress(f,200+i*25),transform:`translateY(${(1-progress(f,200+i*25))*18}px)`}}><span style={{color:C.terra,marginRight:15}}>✓</span>{text}</div>)}
 <div style={{position:'absolute',top:810,left:95,right:95,textAlign:'center',fontFamily:'Georgia',fontSize:52,color:C.terra,opacity:progress(f,285)}}>A calmer day. An accountable system.</div></>;
}

/** Standalone 55-second architecture chapter. All times scale with duration.
 * Product/source diagrams are editorial graphics, never reconstructed app UI.
 * Shotcraft filmstrip's 18-frame stepped editorial transitions are adapted
 * between four diagrams; internal connectors encode actual data movement. */
export const UpgradeArchitecture:React.FC<{durationInFrames?:number}> = ({durationInFrames=ARCHITECTURE_FRAMES}) => {
 const frame=useCurrentFrame()*ARCHITECTURE_FRAMES/durationInFrames;
 const boundaries=[0,420,870,1290,1650];
 const sections=[Overview,Routing,Routes,Trust];
 return <AbsoluteFill style={{background:C.paper,color:C.ink,fontFamily:'"Segoe UI", Arial, sans-serif',overflow:'hidden'}}>
 {sections.map((Section,i)=>{const local=frame-boundaries[i];const length=boundaries[i+1]-boundaries[i];if(local<0||local>=length)return null;const enter=progress(local,0,18);return <AbsoluteFill key={i} style={{opacity:enter,transform:`translateY(${(1-enter)*32}px)`}}><Section f={local}/></AbsoluteFill>;})}
 <div style={{position:'absolute',left:95,right:95,bottom:78,display:'flex',gap:18}}>{sections.map((_,i)=><div key={i} style={{height:4,flex:1,background:C.line}}><div style={{height:'100%',width:`${progress(frame,boundaries[i],boundaries[i+1]-boundaries[i])*100}%`,background:C.terra}}/></div>)}</div>
 </AbsoluteFill>;
};
