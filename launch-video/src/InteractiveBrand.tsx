import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';

/** Shotcraft adaptations: word-relay-geometry, word-relay-filmstrip,
 * outro-group-photo-launch. See INTERACTIVE_CARDS.md for source provenance. */
export const INTRO_FRAMES = 600;
export const OUTRO_FRAMES = 90;
const C = { ink: '#20302a', paper: '#fbf7ec', sage: '#9db4a0', butter: '#f2d675', terra: '#c96f4a', line: '#d9cdb4', teal: '#6f9a94' };
const serif = 'Georgia, "Times New Roman", serif';
const sans = '"Segoe UI", Arial, sans-serif';
const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };
const swift = Easing.bezier(.3, 0, .2, 1);
const snappy = Easing.bezier(.16, 1, .3, 1);
const fly = Easing.bezier(.34, 1.4, .44, 1);
const p = (f: number, start: number, length: number, ease = swift) => interpolate(f, [start, start + length], [0, 1], { ...clamp, easing: ease });
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function Logo({ frame, start = 0, size = 100 }: { frame: number; start?: number; size?: number }) {
  const q = p(frame, start, 20, fly);
  return <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: 'visible', opacity: q, transform: `translateY(${(1 - q) * 34}px) rotate(${(1 - q) * -12}deg) scale(${.75 + q * .25})` }}>
    <rect x="0" y="0" width="100" height="100" rx="26" fill={C.terra} />
    <path d="M21 52 50 26 79 52M29 45V78H71V45" stroke={C.paper} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - p(frame, start + 8, 25)} />
    <rect x="44" y="56" width="15" height="22" rx="3" fill={C.butter} opacity={p(frame, start + 22, 12)} />
  </svg>;
}

function Letters({ text, frame, start, size = 100, color = C.ink, stagger = 1.8 }: { text: string; frame: number; start: number; size?: number; color?: string; stagger?: number }) {
  return <div style={{ fontFamily: serif, fontSize: size, fontWeight: 600, lineHeight: 1.2, letterSpacing: '-.045em', whiteSpace: 'pre' }}>{Array.from(text).map((ch, i) => {
    const q = p(frame, start + i * stagger, 16, snappy);
    return <span key={i} style={{ display: 'inline-block', color, opacity: q, transform: `translateY(${(1 - q) * size * .8}px) rotateX(${(1 - q) * 65}deg)`, filter: q < .995 ? `blur(${(1 - q) * 7}px)` : undefined }}>{ch}</span>;
  })}</div>;
}

function Orbit({ frame, opacity = 1 }: { frame: number; opacity?: number }) {
  const grow = p(frame, 0, 22, snappy);
  const spin = -90 - 160 * (1 - grow) + frame * .9;
  return <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, opacity }}>
    <g transform={`translate(960 520) scale(${mix(.4, 1, grow)})`}>
      <circle r="380" fill="none" stroke={C.sage} strokeWidth="2" strokeDasharray="10 16" transform={`rotate(${spin})`} />
      <g transform={`rotate(${40 * (1 - grow) - frame * .35})`}>{Array.from({ length: 120 }, (_, k) => { const a = k / 120 * Math.PI * 2; const r = 430 - (k % 10 === 0 ? 18 : 8); return <line key={k} x1={r * Math.cos(a)} y1={r * Math.sin(a)} x2={430 * Math.cos(a)} y2={430 * Math.sin(a)} stroke={C.line} strokeWidth={k % 10 === 0 ? 2 : 1} />; })}</g>
      <circle r="380" fill="none" stroke={C.terra} strokeWidth="5" strokeDasharray="100 2288" strokeLinecap="round" transform={`rotate(${-90 + frame * 7.5 - 220 * (1 - grow)})`} />
    </g>
  </svg>;
}

function BrandOpening({ frame }: { frame: number }) {
  const exit = p(frame, 126, 24);
  return <AbsoluteFill style={{ opacity: 1 - exit, transform: `scale(${1 + exit * .045})`, alignItems: 'center', justifyContent: 'center' }}>
    <Orbit frame={frame} opacity={.5} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 34, transform: `translateY(${-20 + Math.sin(frame / 20) * 3}px)` }}><Logo frame={frame} size={120} /><Letters text="Pocketroom" frame={frame} start={8} size={142} /></div>
    <div style={{ position: 'absolute', top: 680, fontFamily: sans, fontSize: 35, letterSpacing: 6, color: C.ink, opacity: p(frame, 28, 18), transform: `translateY(${(1 - p(frame, 28, 18)) * 22}px)` }}>YOUR WHOLE DAY, HOME.</div>
    <div style={{ position: 'absolute', top: 758, height: 3, width: 450, background: C.terra, transform: `scaleX(${p(frame, 38, 24)})` }} />
  </AbsoluteFill>;
}

const FRAGMENTS = [
  { title: 'Notes here.', detail: 'An idea worth keeping', color: C.butter, x: 150, y: 265, angle: -8, glyph: '✎' },
  { title: 'Plans there.', detail: '10:30 · Design review', color: '#e2eadf', x: 1110, y: 220, angle: 6, glyph: '◷' },
  { title: 'What to wear?', detail: 'One less morning decision', color: '#eed5c4', x: 1020, y: 655, angle: -5, glyph: '⌁' },
  { title: 'Don’t forget.', detail: 'Keys · adapter · notebook', color: '#dbe7e3', x: 160, y: 690, angle: 5, glyph: '✓' },
];

function FragmentStory({ frame }: { frame: number }) {
  const local = frame - 150;
  const gather = p(frame, 338, 52);
  const leave = p(frame, 390, 20);
  return <AbsoluteFill style={{ opacity: p(frame, 150, 14) * (1 - leave) }}>
    <div style={{ position: 'absolute', top: 72, width: '100%', textAlign: 'center' }}><Letters text="THE DAY IS IN PIECES." frame={frame} start={154} size={83} color={C.terra} /></div>
    {FRAGMENTS.map((card, i) => { const enter = p(frame, 180 + i * 25, 28, fly); const dx = mix(card.x, 760, gather); const dy = mix(card.y, 420, gather); const drift = Math.sin((local + i * 31) / 26) * 9 * (1 - gather); return <div key={card.title} style={{ position: 'absolute', left: dx, top: dy, width: 570, height: 240, padding: '30px 36px', borderRadius: 24, boxSizing: 'border-box', background: card.color, boxShadow: '0 22px 55px rgba(32,48,42,.12)', opacity: enter * (1 - gather * .75), transform: `translateY(${(1 - enter) * 120 + drift}px) rotate(${card.angle * (1 - gather)}deg) scale(${1 - gather * .4})` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 62, color: C.terra, fontFamily: serif }}><span>{card.glyph}</span><span style={{ fontFamily: sans, fontSize: 23, letterSpacing: 3, paddingTop: 13 }}>0{i + 1}</span></div>
      <div style={{ fontFamily: serif, fontSize: 47, color: C.ink }}>{card.title}</div><div style={{ marginTop: 15, fontFamily: sans, fontSize: 27, color: C.ink, opacity: .75 }}>{card.detail}</div>
    </div>; })}
    <div style={{ position: 'absolute', left: 735, top: 445, opacity: p(frame, 285, 30), transform: `scale(${.85 + p(frame, 300, 90) * .25})` }}><Logo frame={frame} start={285} size={150} /></div>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 865, textAlign: 'center', color: C.terra, fontFamily: serif, fontSize: 54, opacity: p(frame, 355, 18), transform: `translateY(${(1 - p(frame, 355, 18)) * 22}px)` }}>One room. One clearer day.</div>
  </AbsoluteFill>;
}

const EVIDENCE = [
  { verb: 'Capture.', image: 'desk.png', note: 'A thought becomes a next step.' },
  { verb: 'Plan.', image: 'timeline.png', note: 'Make space for what matters.' },
  { verb: 'Make it yours.', image: 'room.png', note: 'One cozy room. Your real day.' },
];

function SolutionRelay({ frame }: { frame: number }) {
  // Shotcraft filmstrip: exact one-card steps in 18f windows, no ambient scrolling.
  const switches = [405, 465, 525];
  const step = switches.slice(1).reduce((total, at) => total + p(frame, at, 18), 0);
  const idx = frame < 465 ? 0 : frame < 525 ? 1 : 2;
  const inAt = switches[idx] + 7;
  const evidence = EVIDENCE[idx];
  const enter = p(frame, 395, 22);
  return <AbsoluteFill style={{ background: C.ink, opacity: enter, transform: `translateY(${(1 - enter) * 35}px)` }}>
    <div style={{ position: 'absolute', left: 100, top: 80, fontFamily: sans, fontSize: 31, letterSpacing: 5, color: C.butter }}>SCATTERED → SETTLED</div>
    <div style={{ position: 'absolute', left: 100, top: 260, width: 940, height: 530, borderRadius: 24, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.28)' }}>
      {EVIDENCE.map((e, i) => <div key={e.verb} style={{ position: 'absolute', left: 0, top: (i - step) * 635, width: 940, height: 530, background: i % 2 === 0 ? C.paper : C.sage, overflow: 'hidden', borderRadius: 24 }}><Img src={staticFile(`captures/${e.image}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: i === idx ? 1 : .25 }} /></div>)}
    </div>
    <div style={{ position: 'absolute', left: 1115, top: 374, color: C.paper }}><div style={{ fontFamily: serif, fontSize: 69, color: C.paper, opacity: .6 }}>Your day.</div><div style={{ overflow: 'hidden', marginTop: 18, height: 120 }}><Letters text={evidence.verb} frame={frame} start={inAt} size={evidence.verb.length > 10 ? 78 : 106} color={C.butter} stagger={1.2} /></div><div style={{ fontFamily: sans, fontSize: 30, color: C.paper, maxWidth: 650, marginTop: 26, opacity: p(frame, inAt + 15, 16) }}>{evidence.note}</div></div>
    <div style={{ position: 'absolute', left: 1060, top: 524, width: 40 * p(frame, inAt, 16), height: 2, background: C.butter }} />
    <div style={{ position: 'absolute', left: 100, right: 100, bottom: 125, display: 'flex', gap: 20 }}>{EVIDENCE.map((e, i) => <div key={e.verb} style={{ flex: 1, height: 4, background: '#496053' }}><div style={{ width: `${p(frame, switches[i], 60) * 100}%`, height: '100%', background: C.butter }} /></div>)}</div>
    <div style={{ position: 'absolute', right: 110, bottom: 65, color: C.paper, fontSize: 28, fontFamily: sans, opacity: p(frame, 565, 18) }}>A little room for all of it →</div>
  </AbsoluteFill>;
}

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: C.paper, overflow: 'hidden' }}>
    <AbsoluteFill style={{ background: 'linear-gradient(125deg,#fbf7ec 30%,#e7efe4)', transform: `scale(${1 + frame / 600 * .025})` }} />
    {frame < 150 && <BrandOpening frame={frame} />}
    {frame >= 150 && frame < 415 && <FragmentStory frame={frame} />}
    {frame >= 395 && <SolutionRelay frame={frame} />}
  </AbsoluteFill>;
};

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const crane = p(frame, 0, 40);
  const recede = p(frame, 42, 8);
  const rule = p(frame, 58, 12);
  const captures = ['desk.png', 'decorate.png', 'wardrobe.png', 'timeline.png', 'clatter.png', 'doorway.png'];
  return <AbsoluteFill style={{ background: C.paper, overflow: 'hidden' }}>
    <AbsoluteFill style={{ transform: `perspective(1400px) rotateX(${4 * (1 - crane)}deg) scale(${1.06 - .06 * crane + .035 * p(frame, 36, 114)})` }}>
      {captures.map((name, i) => { const q = p(frame, 4 + i * 3, 12, fly); const col = i % 3; const row = Math.floor(i / 3); return <div key={name} style={{ position: 'absolute', left: 90 + col * 650, top: 140 + row * 580, width: 430, height: 235, borderRadius: 20, overflow: 'hidden', opacity: q * (1 - .4 * recede), boxShadow: '0 20px 40px rgba(32,48,42,.16)', transform: `translate(${(1 - q) * (col === 0 ? -500 : 500)}px,${(1 - q) * (row === 0 ? -260 : 300)}px) rotate(${(1 - q) * (i % 2 === 0 ? -8 : 8)}deg) scale(${1.12 - .12 * q})` }}><Img src={staticFile(`captures/${name}`)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>; })}
    </AbsoluteFill>
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}><div style={{ display: 'flex', alignItems: 'center', gap: 28 }}><Logo frame={frame} start={38} size={110} /><Letters text="Pocketroom" frame={frame} start={42} size={122} /></div><div style={{ width: 420, height: 4, background: C.terra, marginTop: 30, transform: `scaleX(${rule})` }} /><div style={{ fontFamily: serif, fontSize: 51, marginTop: 28, color: C.ink, opacity: p(frame, 68, 12) }}>Make room for today.</div><div style={{ fontFamily: sans, fontSize: 34, letterSpacing: 2, marginTop: 24, color: C.ink, opacity: p(frame, 78, 15) }}>pocketroom-six.vercel.app</div></AbsoluteFill>
  </AbsoluteFill>;
};

