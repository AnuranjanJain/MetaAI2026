import React from 'react';
import {AbsoluteFill,Audio,Sequence,staticFile} from 'remotion';
import {Intro,Outro} from './InteractiveBrand';
import {Demo,Caption} from './InteractiveFilm';
import {UpgradeArchitecture} from './UpgradeArchitecture';

const chapters=[
 {from:20,title:'Your day, in one place.',detail:'Capture a thought · review · confirm'},
 {from:45,title:'Your assistant. Your choice.',detail:'Muse live · voice input · local fallback'},
 {from:70,title:'Make the room yours.',detail:'Decorate · music · custom poster'},
 {from:95,title:'See what you can wear.',detail:'Photo → clothing drafts → outfit'},
 {from:120,title:'Leave with a little less stress.',detail:'Window · Captain · doorway'},
];
const clicks=[
 {at:3,x:1260,y:420},{at:16,x:1240,y:540},{at:33,x:1160,y:300},{at:52,x:1290,y:500},{at:76,x:1190,y:650},{at:106,x:1280,y:450},
];
const speech=[
 {from:20,src:'audio/cut-voice/problem.wav',duration:10},
 {from:30,src:'audio/interactive/capture-fit.wav',duration:16},
 {from:46,src:'audio/interactive/muse-fit.wav',duration:7},
 {from:53,src:'audio/interactive/decor-fit.wav',duration:7},
 {from:60,src:'audio/interactive/music-fit.wav',duration:11},
 {from:71,src:'audio/interactive/wardrobe-fit.wav',duration:22},
 {from:93,src:'audio/interactive/outfit-fit.wav',duration:9},
 {from:102,src:'audio/interactive/window-fit.wav',duration:14},
 {from:116,src:'audio/interactive/captain-fit.wav',duration:11},
 {from:127,src:'audio/interactive/door-fit.wav',duration:17},
 {from:160,src:'audio/interactive/arch-local-fit.wav',duration:8},
 {from:168,src:'audio/interactive/arch-routing-fit.wav',duration:6},
 {from:174,src:'audio/interactive/arch-routes-fit.wav',duration:7},
 {from:181,src:'audio/interactive/arch-trust-fit.wav',duration:7},
];
export const InteractiveCut:React.FC<{bgm?:boolean}>=({bgm=true})=><AbsoluteFill style={{background:'#fbf7ec'}}>
 <Sequence durationInFrames={600}><Intro/></Sequence>
 <Sequence from={600} durationInFrames={4200}><Demo src="edited/cut-all-features.mp4" title="Pocketroom / Live walkthrough" detail="Recorded on pocketroom-six.vercel.app · all feature states" duration={140} index={0} clicks={clicks}/></Sequence>
 {chapters.map((c,i)=><Sequence key={c.title} from={c.from*30} durationInFrames={150}><Caption text={c.title}/></Sequence>)}
 <Sequence from={4800} durationInFrames={750}><UpgradeArchitecture durationInFrames={750}/></Sequence>
 <Sequence from={5550} durationInFrames={90}><Outro/></Sequence>
 {speech.map((s,i)=><Sequence key={i} from={s.from*30} durationInFrames={s.duration*30}><Audio src={staticFile(s.src)}/></Sequence>)}
 {bgm&&<Audio src={staticFile('audio/bgm/interactive-original.wav')} volume={.22}/>} 
</AbsoluteFill>;
