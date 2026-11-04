import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { FPS, HEIGHT, SHOTS, SFX_CUES, TOTAL_FRAMES, WIDTH, type Shot } from './content';

type Props = { bgm?: boolean };

const T = {
  ink: '#20302a',
  paper: '#fbf7ec',
  ivory: '#f3edde',
  sage: '#9db4a0',
  sageWash: '#e7efe4',
  butter: '#f2d675',
  terra: '#c96f4a',
  teal: '#6f9a94',
  soft: '#43544c',
  line: '#d9cdb4',
};
const serif = 'Georgia, "Times New Roman", serif';
const sans = '"Segoe UI", Arial, sans-serif';
const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const easeInOut = Easing.bezier(0.25, 0.46, 0.45, 0.94);
const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
const over = Easing.bezier(0.34, 1.4, 0.44, 1);

const img = (name: string) => staticFile(name);
const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };
const progress = (f: number, from: number, duration: number, span = 30, easing = easeOut) =>
  interpolate(f, [from, from + span], [0, 1], { ...clamp, easing });
const fade = (f: number, duration: number, inFrames = 28, outFrames = 28) =>
  Math.min(progress(f, 0, duration, inFrames), interpolate(f, [duration - outFrames, duration], [1, 0], clamp));

function Brand({ light = false }: { light?: boolean }) {
  const color = light ? T.paper : T.ink;
  return <div style={{ display: 'flex', alignItems: 'center', gap: 18, color }}>
    <div style={{ width: 58, height: 58, borderRadius: 16, display: 'grid', placeItems: 'center', background: T.terra, color: T.paper, fontFamily: serif, fontSize: 34, fontWeight: 700 }}>P</div>
    <div><div style={{ fontFamily: serif, fontSize: 42, lineHeight: 1 }}>Pocketroom</div><div style={{ marginTop: 8, fontFamily: mono, fontSize: 13, letterSpacing: 3, opacity: .68 }}>MAKE ROOM FOR TODAY</div></div>
  </div>;
}

function Caption({ shot, frame }: { shot: Shot; frame: number }) {
  const opacity = fade(frame, shot.duration, 24, 24);
  return <div style={{ position: 'absolute', left: 96, right: 96, bottom: 58, opacity, zIndex: 20 }}>
    <div style={{ display: 'inline-block', maxWidth: 1500, padding: '18px 28px 20px', borderRadius: 18, background: 'rgba(251,247,236,.94)', border: `1px solid ${T.line}`, boxShadow: '0 18px 46px rgba(32,48,42,.16)', color: T.ink, fontFamily: sans, fontSize: 42, lineHeight: 1.15, fontWeight: 600 }}>{shot.caption}</div>
  </div>;
}

function Page({ src, frame, zoom = 1, dim = 0, position = 'center', radius = 0 }: { src: string; frame: number; zoom?: number; dim?: number; position?: string; radius?: number }) {
  const pulse = 1 + Math.sin(frame / 44) * 0.002;
  return <AbsoluteFill style={{ overflow: 'hidden', background: T.ivory }}>
    <Img src={img(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: position, transform: `scale(${zoom * pulse})`, filter: 'saturate(.98) contrast(1.03)', borderRadius: radius }} />
    {dim > 0 && <AbsoluteFill style={{ background: `rgba(16,22,18,${dim})` }} />}
  </AbsoluteFill>;
}

function HeroSpotlight({ frame }: { frame: number }) {
  const lamp = interpolate(frame, [0, 4, 7], [0, 1, .7], clamp);
  const spotX = interpolate(frame, [0, 30, 56], [25, 57, 66], { ...clamp, easing: easeInOut });
  const spotY = interpolate(frame, [0, 30, 56], [32, 57, 53], { ...clamp, easing: easeInOut });
  const push = progress(frame, 44, 28, 28, Easing.bezier(.35, 0, .2, 1));
  const rise = progress(frame, 72, 22, 12, over) * (1 - progress(frame, 142, 18, 18, Easing.bezier(.4, 0, .3, 1.05)));
  const reseat = progress(frame, 142, 18, 18, Easing.bezier(.4, 0, .3, 1.05));
  const light = progress(frame, 36, 20, 20, easeInOut);
  const title = progress(frame, 84, 24, 24, easeOut);
  return <AbsoluteFill style={{ background: '#11130f', overflow: 'hidden' }}>
    <Page src="captures/room.png" frame={frame} zoom={1 + push * .06} dim={.88 - light * .18} />
    <AbsoluteFill style={{ pointerEvents: 'none', background: `radial-gradient(ellipse ${380 + 120 * light}px ${300 + 100 * light}px at ${spotX}% ${spotY}%, rgba(255,245,214,${.72 * lamp}), rgba(255,231,182,.13) 45%, rgba(10,12,9,${.96 - light * .06}) 76%)` }} />
    <div style={{ position: 'absolute', top: -140, left: `${spotX + 17}%`, width: 280, height: 980, transform: 'rotate(9deg)', transformOrigin: 'top center', background: 'linear-gradient(180deg, rgba(255,245,215,.18), rgba(255,245,215,0))', filter: 'blur(24px)', opacity: lamp * .7 }} />
    <div style={{ position: 'absolute', left: 116, top: 132, color: T.paper, opacity: title }}><Brand light /><div style={{ marginTop: 112, fontFamily: serif, fontSize: 78, lineHeight: 1.02, maxWidth: 700 }}>A calmer way to carry a day.</div><div style={{ marginTop: 26, fontFamily: mono, fontSize: 18, letterSpacing: 3, color: T.butter }}>ROOM · VOICE · PLAN · LEAVE</div></div>
    <div style={{ position: 'absolute', left: 116, top: 520, width: 740, height: 430, borderRadius: 24, overflow: 'hidden', boxShadow: `0 ${22 + rise * 42}px ${54 + rise * 40}px rgba(0,0,0,${.28 + rise * .24})`, transform: `translateY(${(1 - rise) * 36}px) scale(${1 + rise * .035 - reseat * .01}) rotate(${rise * -1.3}deg)`, opacity: .96 }}>
      <Img src={img('captures/room.png')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: 24, boxShadow: `inset 0 0 0 2px rgba(255,246,214,${.2 + rise * .5})` }} />
    </div>
    <div style={{ position: 'absolute', left: 920, top: 546, color: T.paper, fontFamily: sans, fontSize: 26, lineHeight: 1.45, maxWidth: 770, opacity: progress(frame, 112, 24, 24) }}>One room makes the day legible: the desk, the window, the doorway, the places where real decisions happen.</div>
    <div style={{ position: 'absolute', right: 130, top: 90, color: T.butter, fontFamily: mono, fontSize: 16, letterSpacing: 3, opacity: progress(frame, 142, 22, 22) }}>SHOTCRAFT · spotlight-hero-card</div>
  </AbsoluteFill>;
}

function WallReveal({ frame }: { frame: number }) {
  const items = [
    ['captures/desk.png', 'CAPTURE', 'The desk keeps the fragments.'],
    ['captures/timeline.png', 'PLAN', 'The window holds time honestly.'],
    ['captures/doorway.png', 'LEAVE', 'The doorway turns intent into action.'],
    ['captures/wardrobe.png', 'WARDROBE', 'The closet remembers what you own.'],
  ];
  return <AbsoluteFill style={{ background: T.ivory }}><div style={{ position: 'absolute', left: 110, top: 74, fontFamily: mono, fontSize: 16, letterSpacing: 4, color: T.terra }}>WALL-REVEAL-MOVES · REAL PAGE CAPTURES</div><div style={{ position: 'absolute', left: 110, top: 128, fontFamily: serif, color: T.ink, fontSize: 72 }}>A day you can see.</div>{items.map(([src, label, text], i) => { const p = progress(frame, 20 + i * 24, 44, 44, easeOut); const x = i % 2; const y = Math.floor(i / 2); return <div key={src} style={{ position: 'absolute', left: 120 + x * 900, top: 300 + y * 330, width: 780, height: 250, borderRadius: 24, overflow: 'hidden', background: T.paper, boxShadow: '0 20px 48px rgba(32,48,42,.2)', opacity: p, transform: `translateY(${(1 - p) * 40}px) scale(${.96 + .04 * p})` }}><Img src={img(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><div style={{ position: 'absolute', left: 28, right: 28, bottom: 24, padding: '14px 18px', borderRadius: 14, background: 'rgba(251,247,236,.92)' }}><div style={{ fontFamily: mono, color: T.terra, fontSize: 14, letterSpacing: 2.5 }}>{label}</div><div style={{ marginTop: 7, fontFamily: sans, color: T.ink, fontSize: 28, fontWeight: 650 }}>{text}</div></div></div>; })}<div style={{ position: 'absolute', left: 120, right: 120, bottom: 58, height: 4, background: T.line }}><div style={{ width: `${Math.min(100, frame / 2.2)}%`, height: '100%', background: T.terra }} /></div></AbsoluteFill>;
}

const noise = (n: number) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
function VoiceWave({ frame }: { frame: number }) {
  const submit = 152;
  const collapse = interpolate(frame, [submit, submit + 16], [1, .08], { ...clamp, easing: Easing.bezier(.4, 0, .2, 1) });
  const bars = Array.from({ length: 58 }, (_, i) => { const t = frame - (57 - i) * 1.6; const talk = Math.max(interpolate(t, [18, 62, 88, 132], [0, 1, .25, 1], clamp), 0); const shape = Math.pow(Math.sin((i / 57) * Math.PI), .82); return Math.max(7, 138 * talk * shape * (.48 + .52 * noise(i * 13.2 + Math.floor(t / 4))) * collapse); });
  const words = ['Say', '“plan', 'my', 'morning”', '—', 'see', 'the', 'proposal'];
  const wordP = progress(frame, 20, 36, 36);
  return <AbsoluteFill style={{ background: T.sageWash }}><div style={{ position: 'absolute', left: 118, top: 88, fontFamily: mono, fontSize: 15, letterSpacing: 4, color: T.terra }}>VOICE-WAVEFORM-LIVE · FUNCTION DEMO</div><div style={{ position: 'absolute', left: 118, top: 154, fontFamily: serif, fontSize: 64, color: T.ink, opacity: wordP }}>{words.map((w, i) => <span key={w} style={{ display: 'inline-block', marginRight: 18, opacity: Math.max(0, Math.min(1, (frame - 20 - i * 7) / 15)), transform: `translateY(${(1 - Math.max(0, Math.min(1, (frame - 20 - i * 7) / 15))) * 18}px)` }}>{w}</span>)}</div><div style={{ position: 'absolute', left: 180, top: 360, width: 1560, height: 270, borderRadius: 140, background: 'linear-gradient(180deg,#fffdf7,#f7eee2)', boxShadow: '0 26px 70px rgba(32,48,42,.17)', display: 'flex', alignItems: 'center', padding: '0 54px', gap: 36 }}><div style={{ width: 128, height: 128, borderRadius: 64, display: 'grid', placeItems: 'center', background: T.terra, color: T.paper, fontSize: 62 }}>◉</div><div style={{ flex: 1, height: 156, display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden' }}>{bars.map((h, i) => <div key={i} style={{ flex: 1, height: h, borderRadius: 99, background: i > 44 ? `linear-gradient(180deg,${T.terra},#e7a47d)` : T.sage }} />)}</div><div style={{ width: 104, color: T.ink, fontFamily: mono, fontSize: 26 }}>0:{String(Math.min(9, Math.floor(frame / 30))).padStart(2, '0')}</div><div style={{ width: 128, height: 128, borderRadius: 64, display: 'grid', placeItems: 'center', background: T.ink, color: T.paper, fontFamily: sans, fontSize: 56, transform: `scale(${frame >= submit && frame < submit + 8 ? .82 : 1})` }}>↑</div></div><div style={{ position: 'absolute', left: 184, top: 716, fontFamily: sans, fontSize: 30, color: T.soft, opacity: progress(frame, submit + 16, 26, 26) }}>✓ Confirmed before save · proposal visible · undo remains available</div><div style={{ position: 'absolute', right: 110, bottom: 68, width: 470, height: 260, overflow: 'hidden', borderRadius: 18, opacity: .92, boxShadow: '0 18px 42px rgba(32,48,42,.2)' }}><Img src={img('captures/voice-assistant.png')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(32,48,42,.05),rgba(32,48,42,.45))' }} /></div></AbsoluteFill>;
}

function DealCards({ frame, assets, title }: { frame: number; assets: string[]; title: string }) {
  const dealStart = 40;
  return <AbsoluteFill style={{ background: '#171a16', overflow: 'hidden' }}><div style={{ position: 'absolute', left: 100, top: 82, color: T.butter, fontFamily: mono, fontSize: 15, letterSpacing: 4 }}>DECK-DEAL-FLYIN · PACK BY ROUTINE</div><div style={{ position: 'absolute', left: 100, top: 132, color: T.paper, fontFamily: serif, fontSize: 68 }}>{title}</div><div style={{ position: 'absolute', left: 110, top: 278, width: 1700, height: 610, borderRadius: 30, background: 'linear-gradient(145deg,#f7f2e7,#dad0bd)', boxShadow: '0 26px 70px rgba(0,0,0,.3)' }} />{assets.map((src, i) => { const row = Math.floor(i / 4), col = i % 4; const cue = dealStart + 9 * i - .55 * i * i; const p = progress(frame, cue, 18, 18, over); const x = 184 + col * 388; const y = 334 + row * 250; const sx = 830 + ((i * 53) % 180) - 90; const sy = 220 + ((i * 31) % 90) - 45; return <div key={`${src}-${i}`} style={{ position: 'absolute', left: x, top: y, width: 310, height: 196, borderRadius: 16, overflow: 'hidden', background: T.paper, boxShadow: `0 ${18 + (1 - p) * 34}px ${32 + (1 - p) * 46}px rgba(0,0,0,.28)`, opacity: p, transform: `translate(${(1 - p) * (sx - x)}px, ${(1 - p) * (sy - y)}px) rotate(${(1 - p) * (((i % 2) ? 1 : -1) * 11)}deg) scale(${1.08 - .08 * p})` }}><Img src={img(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>; })}<div style={{ position: 'absolute', right: 110, bottom: 88, color: T.paper, fontFamily: sans, fontSize: 28, opacity: progress(frame, 112, 22, 22) }}>Cards land in the real slot. The list stays readable.</div></AbsoluteFill>;
}

function Filmstrip({ frame }: { frame: number }) {
  const cards = ['captures/storage.png', 'captures/decorate.png', 'captures/clatter.png', 'captures/list.png'];
  const words = ['REMEMBER', 'PERSONALIZE', 'LISTEN', 'SEARCH'];
  const index = Math.min(3, Math.floor(Math.max(0, frame - 44) / 44));
  const switchP = progress(frame, 44 + index * 44, 18, 18, Easing.bezier(.3, 0, .2, 1));
  return <AbsoluteFill style={{ background: T.paper }}><div style={{ position: 'absolute', left: 110, top: 88, fontFamily: mono, fontSize: 15, letterSpacing: 4, color: T.terra }}>WORD-RELAY-FILMSTRIP · FOUR SMALL DECISIONS</div><div style={{ position: 'absolute', left: 110, top: 154, fontFamily: serif, fontSize: 68, color: T.ink }}>Remember the details.</div><div style={{ position: 'absolute', left: 140, top: 360, width: 700, height: 450, overflow: 'hidden', borderRadius: 22, background: T.ink, boxShadow: '0 26px 60px rgba(32,48,42,.18)' }}>{cards.map((src, i) => <Img key={src} src={img(src)} style={{ position: 'absolute', inset: 24, width: 'calc(100% - 48px)', height: 'calc(100% - 48px)', objectFit: 'cover', opacity: i === index ? 1 : .16, transform: `translateY(${(i - index) * 14 + (i === index ? (1 - switchP) * 12 : 0)}px)`, filter: i === index ? 'none' : 'grayscale(1)' }} />)}</div><div style={{ position: 'absolute', left: 1000, top: 380, fontFamily: serif, fontSize: 112, lineHeight: .96, color: T.ink }}><div style={{ color: T.terra }}>YOUR ROOM</div><div style={{ marginTop: 16, color: T.ink }}>{words[index]}</div><div style={{ marginTop: 42, width: 520, height: 4, background: T.line }}><div style={{ width: `${(index + 1) * 25}%`, height: '100%', background: T.terra }} /></div></div><div style={{ position: 'absolute', right: 110, bottom: 88, fontFamily: sans, fontSize: 28, color: T.soft }}>Last recorded, never guessed.</div></AbsoluteFill>;
}

function Trust({ frame }: { frame: number }) {
  const badges = ['LOCAL STATE FIRST', 'CONFIRM BEFORE SAVE', 'UNDO STAYS VISIBLE'];
  return <AbsoluteFill style={{ background: '#15201a', overflow: 'hidden' }}><Page src="captures/ai-setup.png" frame={frame} zoom={1.04} dim={.58} position="right center" /><div style={{ position: 'absolute', left: 112, top: 126, color: T.paper, fontFamily: serif, fontSize: 78, maxWidth: 820 }}>Your day stays yours.</div><div style={{ position: 'absolute', left: 116, top: 330, color: 'rgba(251,247,236,.82)', fontFamily: sans, fontSize: 31, lineHeight: 1.45, maxWidth: 660 }}>Optional intelligence can help interpret intent. The app owns the rules, the state, and the final tap.</div>{badges.map((b, i) => { const p = progress(frame, 50 + i * 24, 24, 24, over); return <div key={b} style={{ position: 'absolute', left: 118, top: 636 + i * 82, padding: '18px 22px', borderRadius: 16, border: `1px solid rgba(251,247,236,.28)`, background: `rgba(251,247,236,${.08 + .07 * p})`, color: T.butter, fontFamily: mono, fontSize: 19, letterSpacing: 2, opacity: p, transform: `translateX(${(1 - p) * -30}px)` }}>✓ {b}</div>; })}<div style={{ position: 'absolute', right: 114, bottom: 84, fontFamily: mono, fontSize: 16, letterSpacing: 3, color: T.paper, opacity: .7 }}>PUBLIC DEMO · LIVE PATHS LABELLED</div></AbsoluteFill>;
}

function Architecture({ frame }: { frame: number }) {
  const e = Easing.bezier(.2, 0, .25, 1);
  const pull = interpolate(frame, [0, 150], [1.28, 1], { ...clamp, easing: e });
  const nodes = [['INTERFACE', 'interactive room', T.terra], ['APP STATE', 'undo + rules', T.sage], ['LOCAL STORAGE', 'localStorage + IndexedDB', T.butter], ['OPTIONAL MUSE', 'Vercel → Muse route', T.teal], ['SAFETY', 'confirm + verify', T.paper]] as const;
  return <AbsoluteFill style={{ background: '#f0eadc', overflow: 'hidden' }}><div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 22%,#fffdf6 0%,#f0eadc 62%,#d9e4d7 100%)' }} /><div style={{ position: 'absolute', left: 105, top: 86, fontFamily: mono, fontSize: 15, letterSpacing: 4, color: T.terra, opacity: progress(frame, 18, 24, 24) }}>CRANE-RISE-REVEAL · SYSTEM DESIGN</div><div style={{ position: 'absolute', left: 105, top: 144, fontFamily: serif, fontSize: 70, color: T.ink, opacity: progress(frame, 18, 24, 24) }}>Under the room.</div><div style={{ position: 'absolute', left: 0, top: 0, width: WIDTH, height: HEIGHT, transformOrigin: '50% 48%', transform: `scale(${pull}) rotateX(${(pull - 1) * 7}deg) translateY(${(pull - 1) * -130}px)` }}>{nodes.map(([label, sub, color], i) => { const p = progress(frame, 34 + i * 22, 28, 28, over); const x = i === 4 ? 780 : 130 + i * 390; const y = i === 4 ? 700 : 430; return <React.Fragment key={label}><div style={{ position: 'absolute', left: x, top: y, width: 310, minHeight: 140, padding: '22px 24px', borderRadius: 20, border: `3px solid ${color}`, background: 'rgba(251,247,236,.96)', boxShadow: '0 18px 44px rgba(32,48,42,.14)', opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}><div style={{ fontFamily: mono, fontSize: 15, letterSpacing: 2.4, color }}>{label}</div><div style={{ marginTop: 14, fontFamily: serif, fontSize: 32, color: T.ink }}>{sub}</div></div>{i < 4 && <div style={{ position: 'absolute', left: x + 310, top: y + 70, width: 80, height: 4, background: T.terra, transformOrigin: 'left', transform: `scaleX(${p})`, opacity: p }} />}</React.Fragment>; })}</div><div style={{ position: 'absolute', right: 108, bottom: 78, fontFamily: mono, color: T.ink, fontSize: 32, letterSpacing: 2, opacity: progress(frame, 180, 25, 25) }}>FALLBACK IS VISIBLE · RULES STAY IN APP CODE</div></AbsoluteFill>;
}

function Recap({ frame }: { frame: number }) {
  const assets = ['captures/room.png', 'captures/voice-assistant.png', 'captures/timeline.png', 'captures/doorway.png', 'captures/storage.png', 'captures/ai-setup.png'];
  return <AbsoluteFill style={{ background: T.ink }}><div style={{ position: 'absolute', left: 106, top: 90, color: T.paper, fontFamily: serif, fontSize: 74 }}>One calm surface.</div><div style={{ position: 'absolute', left: 110, top: 190, color: T.butter, fontFamily: mono, fontSize: 16, letterSpacing: 4 }}>CAPTURE · PLAN · PACK · FIND · MOVE ON</div>{assets.map((src, i) => { const p = progress(frame, 30 + i * 10, 32, 32, over); const col = i % 3, row = Math.floor(i / 3); return <div key={src} style={{ position: 'absolute', left: 112 + col * 590, top: 330 + row * 300, width: 540, height: 246, overflow: 'hidden', borderRadius: 20, border: '1px solid rgba(251,247,236,.3)', boxShadow: '0 18px 42px rgba(0,0,0,.28)', opacity: p, transform: `translateY(${(1 - p) * 28}px) scale(${.94 + p * .06})` }}><Img src={img(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>; })}<div style={{ position: 'absolute', right: 110, top: 108, color: T.paper, fontFamily: sans, fontSize: 28, opacity: progress(frame, 120, 24, 24) }}>Real pages. Small decisions. A day that moves with you.</div></AbsoluteFill>;
}

function Outro({ frame }: { frame: number }) {
  const elements = ['captures/room.png', 'captures/voice-assistant.png', 'captures/timeline.png', 'captures/doorway.png', 'captures/wardrobe.png', 'captures/storage.png'];
  const mark = progress(frame, 66, 28, 28, over);
  return <AbsoluteFill style={{ background: '#121711', overflow: 'hidden' }}><Page src="captures/room.png" frame={frame} zoom={1.03} dim={.66} /><div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 48%,rgba(255,247,221,.24),rgba(18,23,17,.78) 60%)' }} />{elements.map((src, i) => { const p = progress(frame, 8 + i * 7, 24, 24, over); const col = i % 3, row = Math.floor(i / 3); const x = 240 + col * 720, y = 260 + row * 420; return <div key={src} style={{ position: 'absolute', left: x, top: y, width: 390, height: 235, borderRadius: 18, overflow: 'hidden', boxShadow: '0 18px 38px rgba(0,0,0,.32)', opacity: p * (.82 - mark * .18), transform: `translate(${(1 - p) * (i % 2 ? 520 : -520)}px, ${(1 - p) * (row ? 280 : -260)}px) rotate(${(1 - p) * (i % 2 ? 6 : -6)}deg) scale(${1.08 - .08 * p})` }}><Img src={img(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>; })}<div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: T.paper, textAlign: 'center', opacity: mark, transform: `translateY(${(1 - mark) * 24}px)` }}><Brand light /><div style={{ marginTop: 66, color: T.butter, fontFamily: serif, fontSize: 70 }}>Make room for today.</div><div style={{ marginTop: 24, fontFamily: mono, fontSize: 32, letterSpacing: 3, opacity: .88 }}>pocketroom-six.vercel.app</div></div></AbsoluteFill>;
}

function Scene({ shot, frame }: { shot: Shot; frame: number }) {
  if (shot.id === 'room-open') return <HeroSpotlight frame={frame} />;
  if (shot.id === 'room-map') return <WallReveal frame={frame} />;
  if (shot.id === 'voice-desk') return <VoiceWave frame={frame} />;
  if (shot.id === 'captain-window') return <DealCards frame={frame} title="The plan respects time." assets={['captures/timeline.png', 'captures/desk.png', 'captures/list.png', 'captures/room.png', 'captures/timeline.png', 'captures/desk.png', 'captures/list.png', 'captures/room.png']} />;
  if (shot.id === 'doorway-wardrobe') return <DealCards frame={frame} title="Leave with less friction." assets={['captures/doorway.png', 'captures/wardrobe.png', 'captures/doorway.png', 'captures/wardrobe.png', 'captures/doorway.png', 'captures/wardrobe.png', 'captures/doorway.png', 'captures/wardrobe.png']} />;
  if (shot.id === 'memory-room') return <Filmstrip frame={frame} />;
  if (shot.id === 'share-trust') return <Trust frame={frame} />;
  if (shot.id === 'architecture') return <Architecture frame={frame} />;
  if (shot.id === 'recap') return <Recap frame={frame} />;
  return <Outro frame={frame} />;
}

export const PocketroomLaunch: React.FC<Props> = ({ bgm = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shot = SHOTS.find((s) => frame >= s.from && frame < s.from + s.duration) ?? SHOTS[SHOTS.length - 1];
  const local = frame - shot.from;
  const index = SHOTS.indexOf(shot);
  return <AbsoluteFill style={{ background: T.ivory, fontFamily: sans }}>
    <Scene shot={shot} frame={local} />
    {shot.id !== 'outro' && <Caption shot={shot} frame={local} />}
    <Audio src={staticFile('audio/narration/eleven-master.mp3')} volume={1} />
    {SFX_CUES.map((cue) => <Sequence key={`${cue.src}-${cue.from}`} from={cue.from} durationInFrames={Math.min(80, TOTAL_FRAMES - cue.from)}><Audio src={staticFile(cue.src)} volume={cue.volume} /></Sequence>)}
    {bgm && <Audio src={staticFile('audio/bgm/pocketroom-bed.mp3')} loop volume={(f) => { const sec = f / fps; return sec < 2 || sec > 177 ? .08 : .13; }} />}
  </AbsoluteFill>;
};

export { FPS, HEIGHT, TOTAL_FRAMES, WIDTH };
