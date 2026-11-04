import React from 'react';
import {AbsoluteFill,Audio,Easing,Img,OffthreadVideo,Sequence,interpolate,staticFile,useCurrentFrame} from 'remotion';
import rawTimeline from './raw-data.json';
import rawVo from './rawfilm-vo.json';

const FPS = 30;
const TOTAL = 6990;
const C = {paper:'#faf6ef',ink:'#20302a',sage:'#9db4a0',terra:'#c96f4a',butter:'#f6c945',mut:'#52685a'};

interface Zoom {from:number;to:number;cx:number;cy:number}
interface Chapter {id:string;title:string;detail:string;from:number;dur:number;src:string;srcIn:number;rail:number;zoom:Zoom}
interface Teaser {from:number;dur:number;src:string;srcIn:number;word:string}
interface Callout {from:number;dur:number;x:number;y:number;w:number;h:number;label:string}
interface Statement {from:number;dur:number;text:string}
interface Sfx {from:number;src:string;volume:number}
interface VoPlace {from:number;id:string}
interface Timeline {totalSeconds:number;raw:string;captainClip:string;teasers:Teaser[];chapters:Chapter[];statements:Statement[];callouts:Callout[];vo:VoPlace[];sfx:Sfx[];railLabels:string[];outroUrl:string}
const data = rawTimeline as unknown as Timeline;
const vot = rawVo as unknown as Record<string,{dur:number;caps:{text:string;from:number;to:number}[]}>;
const SRC_FRAMES: Record<string,number> = {raw: 7630, captain: 328};

const zoomOf = (ch: Chapter, local: number): number => {
  const D = Math.round(ch.dur * FPS);
  const T = Math.min(45, D);
  const p = Easing.inOut(Easing.ease)(interpolate(local, [0, T], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'}));
  return ch.zoom.from + (ch.zoom.to - ch.zoom.from) * p;
};
const chapterAt = (abs: number): Chapter | null => {
  for (const ch of data.chapters) {
    if (abs >= ch.from * FPS && abs < (ch.from + ch.dur) * FPS) return ch;
  }
  return null;
};
const inVo = (f: number): boolean => data.vo.some((v) => f >= v.from * FPS && f <= (v.from + vot[v.id].dur + 0.5) * FPS);

const RawShot: React.FC<{ch: Chapter}> = ({ch}) => {
  const f = useCurrentFrame();
  const s = zoomOf(ch, f);
  const file = ch.src === 'captain' ? data.captainClip : data.raw;
  const start = Math.round(ch.srcIn * FPS);
  const end = Math.min(Math.round((ch.srcIn + ch.dur) * FPS), SRC_FRAMES[ch.src] ?? 7630);
  return (
    <AbsoluteFill style={{background:'#111'}}>
      <OffthreadVideo
        src={staticFile(file)} muted
        startFrom={start} endAt={end} playbackRate={1}
        style={{position:'absolute',width:1920,height:1080,transform:`scale(${s})`,transformOrigin:`${ch.zoom.cx}px ${ch.zoom.cy}px`}}
      />
    </AbsoluteFill>
  );
};

const TEASER_C: [number,number][] = [[1500,700],[1500,600],[960,540],[1500,450],[1500,400]];
const TeaserCut: React.FC<{t: Teaser; i: number}> = ({t, i}) => {
  const f = useCurrentFrame();
  const D = Math.round(t.dur * FPS);
  const s = 1.3 + 0.15 * Easing.out(Easing.ease)(interpolate(f, [0, D], [0, 1], {extrapolateRight:'clamp'}));
  const [cx, cy] = TEASER_C[i];
  const file = t.src === 'captain' ? data.captainClip : data.raw;
  const isCap = t.src === 'captain';
  const start = Math.round(t.srcIn * FPS);
  const flash = interpolate(f, [0, 5], [0.85, 0], {extrapolateRight:'clamp'});
  return (
    <AbsoluteFill style={{background:'#111'}}>
      <OffthreadVideo
        src={staticFile(file)} muted startFrom={start}
        endAt={start + D} playbackRate={1}
        style={isCap
          ? {position:'absolute',width:1920,height:1200,left:0,top:-60,transform:`scale(${s})`,transformOrigin:`${cx}px ${cy + 60}px`}
          : {position:'absolute',width:1920,height:1080,transform:`scale(${s})`,transformOrigin:`${cx}px ${cy}px`}}
      />
      <div style={{position:'absolute',inset:0,background:C.paper,opacity:flash}} />
      <div style={{position:'absolute',left:84,bottom:120,display:'flex'}}>
        {t.word.split('').map((ch, k) => {
          const q = interpolate(f, [6 + k * 2, 14 + k * 2], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
          return <span key={k} style={{fontFamily:'Georgia',fontWeight:700,fontSize:118,color:C.paper,opacity:q,transform:`translateY(${(1 - Easing.out(Easing.ease)(q)) * 46}px)`,textShadow:'0 4px 30px #000a'}}>{ch === ' ' ? '\u00A0' : ch}</span>;
        })}
      </div>
      <div style={{position:'absolute',left:88,bottom:100,width:190 * interpolate(f,[4,20],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}),height:6,background:C.terra}} />
    </AbsoluteFill>
  );
};

const CaptainCard: React.FC = () => {
  const f = useCurrentFrame();
  const q = interpolate(f, [0, 16], [0, 1], {extrapolateRight:'clamp'});
  return (
    <AbsoluteFill style={{background:C.paper}}>
      <div style={{position:'absolute',left:210,top:70,width:1500,height:940,borderRadius:24,overflow:'hidden',boxShadow:'0 18px 50px #20302a33',border:'1px solid #d9cdb4',opacity:q,transform:`translateY(${(1 - Easing.out(Easing.ease)(q)) * 30}px)`}}>
        <OffthreadVideo src={staticFile(data.captainClip)} muted startFrom={0} endAt={328} playbackRate={11 / 12} style={{position:'absolute',width:1500,height:937,left:0,top:0}} />
        <div style={{position:'absolute',left:22,top:20,background:C.terra,color:C.paper,borderRadius:30,padding:'10px 22px',fontSize:23,fontWeight:700,letterSpacing:2}}>● LIVE WONDER RUN</div>
        <div style={{position:'absolute',right:22,bottom:18,background:'#20302add',color:C.paper,borderRadius:30,padding:'9px 20px',fontSize:20}}>Recorded on pocketroom-six.vercel.app</div>
      </div>
    </AbsoluteFill>
  );
};

const Wipe: React.FC = () => {
  const f = useCurrentFrame();
  const x = interpolate(f, [0, 8], [-300, 2220], {extrapolateRight:'clamp'});
  return <AbsoluteFill style={{pointerEvents:'none'}}><div style={{position:'absolute',top:0,bottom:0,left:x - 1100,width:220,background:`linear-gradient(100deg, transparent, ${C.terra}f2 45%, ${C.ink} 55%, transparent)`,transform:'skewX(-8deg)'}} /></AbsoluteFill>;
};

const LowerThird: React.FC<{ch: Chapter}> = ({ch}) => {
  const f = useCurrentFrame();
  const D = 120;
  const inn = Easing.out(Easing.ease)(interpolate(f, [6, 22], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'}));
  const out = interpolate(f, [D - 14, D], [1, 0], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  if (!ch.title) return null;
  return (
    <div style={{position:'absolute',left:84,bottom:118,opacity:Math.min(inn, out),transform:`translateX(${(1 - inn) * -60}px)`}}>
      <div style={{background:'#20302af2',borderLeft:`8px solid ${C.terra}`,borderRadius:'0 16px 16px 0',padding:'16px 30px 16px 24px',boxShadow:'0 8px 30px #0006'}}>
        <div style={{fontFamily:'Georgia',fontSize:42,color:C.paper}}>{ch.title}</div>
        <div style={{fontSize:22,color:C.sage,marginTop:4}}>{ch.detail}</div>
      </div>
    </div>
  );
};

const CalloutBox: React.FC<{c: Callout}> = ({c}) => {
  const f = useCurrentFrame();
  const D = Math.round(c.dur * FPS);
  const inn = Easing.out(Easing.back())(interpolate(f, [0, 12], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'}));
  const out = interpolate(f, [D - 10, D], [1, 0], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  const abs = Math.round(c.from * FPS) + f;
  const ch = chapterAt(abs);
  let x = c.x, y = c.y, w = c.w, h = c.h;
  if (ch && ch.src === 'raw') {
    const s = zoomOf(ch, abs - Math.round(ch.from * FPS));
    x = ch.zoom.cx + (c.x - ch.zoom.cx) * s;
    y = ch.zoom.cy + (c.y - ch.zoom.cy) * s;
    w = c.w * s; h = c.h * s;
  }
  const pulse = 0.6 + 0.4 * Math.sin(f / 5);
  const click = interpolate(f, [0, 8], [1.25, 1], {extrapolateRight:'clamp'});
  return (
    <div style={{position:'absolute',left:x,top:y,width:w,height:h,opacity:Math.min(inn, out),transform:`scale(${click})`,transformOrigin:'top left'}}>
      <div style={{position:'absolute',inset:0,border:`4px solid ${C.terra}`,borderRadius:16,boxShadow:'0 0 0 3px #faf6efdd, 0 6px 26px #0007'}} />
      <div style={{position:'absolute',left:-4,top:-46,background:C.ink,color:C.paper,fontFamily:'Consolas, monospace',fontSize:24,fontWeight:700,letterSpacing:2,padding:'8px 18px',borderRadius:10,whiteSpace:'nowrap'}}>{c.label}</div>
      <div style={{position:'absolute',right:-11,top:-11,width:22,height:22,borderRadius:'50%',background:C.terra,boxShadow:`0 0 0 ${4 + 6 * pulse}px #c96f4a55`}} />
    </div>
  );
};

const StatementCard: React.FC<{s: Statement}> = ({s}) => {
  const f = useCurrentFrame();
  const D = Math.round(s.dur * FPS);
  const dimV = f < D - 10 ? interpolate(f, [0, 10], [0, 0.74], {extrapolateLeft:'clamp', extrapolateRight:'clamp'}) : interpolate(f, [D - 10, D], [0.74, 0], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  const q = Easing.out(Easing.ease)(interpolate(f, [4, 20], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'}));
  const size = s.text.length > 20 ? 84 : 132;
  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,background:C.ink,opacity:dimV}} />
      <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',opacity:q}}>
        <div style={{width:150 * q,height:7,background:C.terra,marginBottom:34}} />
        <div style={{fontFamily:'Georgia',fontWeight:700,fontSize:size,color:C.paper,textAlign:'center',maxWidth:1620,lineHeight:1.15,letterSpacing:2,transform:`translateY(${(1 - q) * 40}px)`}}>{s.text}</div>
      </div>
    </AbsoluteFill>
  );
};

const Chrome: React.FC = () => {
  const f = useCurrentFrame();
  const show = interpolate(f, [9 * FPS, 10 * FPS], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'})
    * interpolate(f, [226 * FPS - 15, 226 * FPS], [1, 0], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  const ch = chapterAt(f);
  const rail = ch && ch.rail >= 0 ? ch.rail : -1;
  return (
    <div style={{opacity:show}}>
      <div style={{position:'absolute',left:60,top:34,fontSize:21,letterSpacing:5,color:C.paper,textShadow:'0 2px 12px #000',fontWeight:600}}>POCKETROOM · LIVE DEMO</div>
      {rail >= 0 && (
        <div style={{position:'absolute',right:60,top:30,display:'flex',alignItems:'center',gap:14,background:'#20302acc',padding:'10px 22px',borderRadius:30}}>
          <span style={{fontSize:22,fontWeight:700,color:C.terra}}>{String(rail + 1).padStart(2,'0')} / 10</span>
          <span style={{fontSize:22,color:C.paper}}>{data.railLabels[rail]}</span>
        </div>
      )}
      {rail >= 0 && (
        <div style={{position:'absolute',left:34,top:330,display:'flex',flexDirection:'column',gap:16}}>
          {data.railLabels.map((l, i) => (
            <div key={l} style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:i === rail ? 16 : 9,height:i === rail ? 16 : 9,borderRadius:'50%',background:i === rail ? C.terra : '#faf6ef88',boxShadow:'0 1px 6px #000'}} />
              {i === rail && <span style={{fontSize:19,color:C.paper,textShadow:'0 1px 8px #000',fontWeight:600}}>{l}</span>}
            </div>
          ))}
        </div>
      )}
      <div style={{position:'absolute',left:60,bottom:30,fontSize:19,letterSpacing:1,color:'#faf6efdd',textShadow:'0 1px 8px #000'}}>Unscripted walkthrough · {data.outroUrl}</div>
    </div>
  );
};

const Caption: React.FC<{text: string}> = ({text}) => (
  <div style={{position:'absolute',bottom:34,left:'50%',transform:'translateX(-50%)',maxWidth:1620,whiteSpace:'nowrap',background:'#20302af5',color:C.paper,padding:'13px 27px',borderRadius:13,fontFamily:'Segoe UI, Arial',fontSize:30,fontWeight:500,boxShadow:'0 5px 20px #0004'}}>{text}</div>
);

const TitleCard: React.FC = () => {
  const f = useCurrentFrame();
  const q = Easing.out(Easing.ease)(interpolate(f, [8, 30], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'}));
  const q2 = Easing.out(Easing.ease)(interpolate(f, [26, 48], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'}));
  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,background:`linear-gradient(180deg, #20302a66, transparent 40%, #20302a88)`}} />
      <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
        <svg width={110 * q + 1} height={110 * q + 1} viewBox="0 0 100 100" style={{opacity:q}}>
          <rect x={4} y={4} width={92} height={92} rx={24} fill={C.terra} />
          <path d="M50 24 74 44v26a4 4 0 0 1-4 4H30a4 4 0 0 1-4-4V44z" fill="none" stroke={C.paper} strokeWidth={6} strokeLinejoin="round" />
          <rect x={44} y={54} width={12} height={16} fill={C.butter} />
        </svg>
        <div style={{fontFamily:'Georgia',fontWeight:700,fontSize:124,color:C.paper,marginTop:18,opacity:q,letterSpacing:1,textShadow:'0 6px 40px #000'}}>Pocketroom</div>
        <div style={{fontFamily:'Georgia',fontStyle:'italic',fontSize:40,color:C.butter,marginTop:14,opacity:q2,textShadow:'0 3px 18px #000'}}>Everything you need for today, in one little place.</div>
      </div>
    </AbsoluteFill>
  );
};

const OutroCard: React.FC = () => {
  const f = useCurrentFrame();
  const q = Easing.out(Easing.ease)(interpolate(f, [6, 28], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'}));
  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,background:`linear-gradient(180deg, #faf6eff2, #faf6ef8c 55%, #20302acc)`}} />
      <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',opacity:q}}>
        <svg width={96} height={96} viewBox="0 0 100 100">
          <rect x={4} y={4} width={92} height={92} rx={24} fill={C.terra} />
          <path d="M50 24 74 44v26a4 4 0 0 1-4 4H30a4 4 0 0 1-4-4V44z" fill="none" stroke={C.paper} strokeWidth={6} strokeLinejoin="round" />
          <rect x={44} y={54} width={12} height={16} fill={C.butter} />
        </svg>
        <div style={{fontFamily:'Georgia',fontWeight:700,fontSize:118,color:C.ink,marginTop:10}}>Pocketroom</div>
        <div style={{fontFamily:'Georgia',fontStyle:'italic',fontSize:44,color:'#3d5a4c',marginTop:6}}>Make room for today.</div>
        <div style={{marginTop:26,background:C.ink,color:C.paper,fontSize:30,fontWeight:600,padding:'14px 40px',borderRadius:40}}>{data.outroUrl}</div>
        <div style={{marginTop:20,fontSize:24,letterSpacing:3,color:C.paper,background:'#00000055',padding:'8px 26px',borderRadius:20}}>BUILT WITH MUSE · META GLOBAL AI DEVELOPER HACKATHON</div>
      </div>
    </AbsoluteFill>
  );
};

const OutroStill: React.FC = () => {
  const f = useCurrentFrame();
  const s = 1.04 + 0.04 * Easing.inOut(Easing.ease)(interpolate(f, [0, 200], [0, 1], {extrapolateRight:'clamp'}));
  return (
    <AbsoluteFill style={{background:C.paper}}>
      <Img src={staticFile('raw/outro-still.png')} style={{position:'absolute',width:1920,height:1080,transform:`scale(${s})`,transformOrigin:'960px 600px'}} />
    </AbsoluteFill>
  );
};

const FadeIn: React.FC = () => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{background:C.paper,opacity:interpolate(f, [0, 14], [1, 0], {extrapolateRight:'clamp'})}} />;
};

export const RawFilm: React.FC<{bgm?: boolean}> = ({bgm = true}) => {
  const bedVol = (f: number, fadeIn?: [number, number], fadeOut?: [number, number]): number => {
    let v = inVo(f) ? 0.13 : 0.24;
    if (f < 40) v *= f / 40;
    if (fadeIn) v *= interpolate(f, fadeIn, [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
    if (fadeOut) v *= interpolate(f, fadeOut, [1, 0], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
    return v;
  };
  return (
    <AbsoluteFill style={{background:'#111'}}>
      {data.teasers.map((t, i) => (
        <Sequence key={`t${i}`} from={Math.round(t.from * FPS)} durationInFrames={Math.round(t.dur * FPS)}><TeaserCut t={t} i={i} /></Sequence>
      ))}
      {data.chapters.map((ch) => (
        <Sequence key={ch.id} from={Math.round(ch.from * FPS)} durationInFrames={Math.round(ch.dur * FPS)}>
          {ch.id === 'captin' ? <CaptainCard /> : ch.src === 'still' ? <OutroStill /> : <RawShot ch={ch} />}
        </Sequence>
      ))}
      {data.chapters.filter((c) => c.id !== 'title').map((ch) => (
        <Sequence key={`w-${ch.id}`} from={Math.round(ch.from * FPS)} durationInFrames={8}><Wipe /></Sequence>
      ))}
      {data.chapters.filter((c) => c.title && c.id !== 'title' && c.id !== 'outro').map((ch) => (
        <Sequence key={`l-${ch.id}`} from={Math.round(ch.from * FPS)} durationInFrames={Math.min(120, Math.round(ch.dur * FPS))}><LowerThird ch={ch} /></Sequence>
      ))}
      <Sequence from={9 * FPS} durationInFrames={5 * FPS}><TitleCard /></Sequence>
      <Sequence from={226 * FPS} durationInFrames={7 * FPS}><OutroCard /></Sequence>
      {data.statements.map((s, i) => (
        <Sequence key={`s${i}`} from={Math.round(s.from * FPS)} durationInFrames={Math.round(s.dur * FPS)}><StatementCard s={s} /></Sequence>
      ))}
      {data.callouts.map((c, i) => (
        <Sequence key={`c${i}`} from={Math.round(c.from * FPS)} durationInFrames={Math.round(c.dur * FPS)}><CalloutBox c={c} /></Sequence>
      ))}
      <Sequence from={0} durationInFrames={TOTAL}><Chrome /></Sequence>
      {data.vo.map((v) => (
        <Sequence key={`v-${v.id}`} from={Math.round(v.from * FPS)} durationInFrames={Math.round((vot[v.id].dur + 0.6) * FPS)}>
          <Audio src={staticFile(`audio/rawfilm/${v.id}.mp3`)} />
        </Sequence>
      ))}
      {data.vo.flatMap((v) => vot[v.id].caps.map((c, i) => (
        <Sequence key={`cap-${v.id}-${i}`} from={Math.round((v.from + c.from) * FPS)} durationInFrames={Math.max(1, Math.round((c.to - c.from) * FPS))}>
          <Caption text={c.text} />
        </Sequence>
      )))}
      {data.sfx.map((s, i) => (
        <Sequence key={`x${i}`} from={Math.round(s.from * FPS)} durationInFrames={45}>
          <Audio src={staticFile(s.src)} volume={s.volume} />
        </Sequence>
      ))}
      {bgm && (
        <>
          <Sequence from={0} durationInFrames={6030}>
            <Audio src={staticFile('audio/bgm/interactive-original.wav')} volume={(f) => bedVol(f, undefined, [5970, 6030])} />
          </Sequence>
          <Sequence from={5970} durationInFrames={TOTAL - 5970}>
            <Audio src={staticFile('audio/bgm/interactive-original.wav')} volume={(f) => bedVol(f + 5970, [5970, 6030], [TOTAL - 50, TOTAL])} />
          </Sequence>
        </>
      )}
      <Sequence from={0} durationInFrames={14}><FadeIn /></Sequence>
    </AbsoluteFill>
  );
};
