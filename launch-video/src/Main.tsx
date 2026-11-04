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
import { CAPTION_LINES, HEIGHT, SHOTS, SFX_CUES, TOTAL_FRAMES, WIDTH, type Shot } from './content';

type Props = { bgm?: boolean };

const C = {
  ivory: '#f3edde',
  paper: '#fbf7ec',
  ink: '#20302a',
  soft: '#43544c',
  line: '#e0d5bd',
  sage: '#9db4a0',
  sageWash: '#e7efe4',
  butter: '#f2d675',
  terra: '#c96f4a',
  teal: '#6f9a94',
};

const ease = Easing.bezier(0.25, 0.46, 0.45, 0.94);
const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function fade(frame: number, duration: number, inFrames = 28, outFrames = 28): number {
  return Math.min(
    interpolate(frame, [0, inFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    interpolate(frame, [duration - outFrames, duration], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  );
}

function fontFamily(display = false): string {
  return display ? 'Georgia, "Times New Roman", serif' : '"Segoe UI", Arial, sans-serif';
}

function asset(name: string): string {
  return staticFile(name);
}

function Caption({ shot, frame }: { shot: Shot; frame: number }): React.ReactNode {
  const op = fade(frame, shot.duration, 22, 22);
  const y = interpolate(frame, [0, 24], [18, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  return (
    <div style={{ position: 'absolute', left: 92, right: 92, bottom: 66, opacity: op, transform: `translateY(${y}px)`, zIndex: 20 }}>
      <div style={{ display: 'inline-block', color: C.ink, background: 'rgba(251,247,236,.88)', border: `1px solid ${C.line}`, borderRadius: 999, padding: '13px 22px 12px', boxShadow: '0 12px 35px rgba(32,48,42,.12)' }}>
        <span style={{ fontFamily: fontFamily(), fontSize: 18, letterSpacing: 0.6 }}>{shot.caption}</span>
      </div>
    </div>
  );
}

function BrandMark({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }): React.ReactNode {
  const color = dark ? C.paper : C.ink;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 10 : 16, color }}>
      <div style={{ width: compact ? 30 : 46, height: compact ? 30 : 46, borderRadius: compact ? 9 : 14, background: C.terra, display: 'grid', placeItems: 'center', color: C.paper, fontFamily: fontFamily(true), fontSize: compact ? 18 : 27, fontWeight: 700 }}>P</div>
      <div>
        <div style={{ fontFamily: fontFamily(true), fontSize: compact ? 21 : 34, lineHeight: 1 }}>Pocketroom</div>
        {!compact && <div style={{ marginTop: 6, fontFamily: fontFamily(), fontSize: 12, letterSpacing: 2.8, textTransform: 'uppercase', opacity: .7 }}>make room for today</div>}
      </div>
    </div>
  );
}

function RoomBackdrop({ src, frame, zoom = 1, dim = 0, position = 'center' }: { src: string; frame: number; zoom?: number; dim?: number; position?: string }): React.ReactNode {
  const pulse = 1 + Math.sin(frame / 55) * 0.004;
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: C.ivory }}>
      <Img src={asset(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: position, transform: `scale(${zoom * pulse})`, filter: `saturate(0.98) contrast(1.02)` }} />
      <AbsoluteFill style={{ background: `rgba(32,48,42,${dim})` }} />
      <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 42%, transparent 42%, rgba(32,48,42,.18) 100%)', mixBlendMode: 'multiply' }} />
    </AbsoluteFill>
  );
}

function FloatingLabel({ text, x, y, color = C.ink, fill = C.paper, delay = 0 }: { text: string; x: number; y: number; color?: string; fill?: string; delay?: number }): React.ReactNode {
  const frame = useCurrentFrame();
  const p = spring({ frame: Math.max(0, frame - delay), fps: 30, config: { damping: 18, stiffness: 95, mass: 0.7 } });
  return <div style={{ position: 'absolute', left: x, top: y, opacity: p, transform: `translateY(${(1 - p) * 24}px)`, background: fill, color, border: `1px solid ${C.line}`, borderRadius: 999, padding: '12px 18px', fontFamily: fontFamily(), fontSize: 17, boxShadow: '0 14px 30px rgba(32,48,42,.12)' }}>{text}</div>;
}

function PanelCard({ src, x = 470, y = 120, w = 1320, h = 780, scale = 1, rotate = 0, delay = 0, radius = 26 }: { src: string; x?: number; y?: number; w?: number; h?: number; scale?: number; rotate?: number; delay?: number; radius?: number }): React.ReactNode {
  const frame = useCurrentFrame();
  const p = spring({ frame: Math.max(0, frame - delay), fps: 30, config: { damping: 19, stiffness: 100, mass: 0.8 } });
  return <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: radius, overflow: 'hidden', background: C.paper, border: `2px solid rgba(32,48,42,.15)`, boxShadow: '0 26px 70px rgba(32,48,42,.26)', transform: `translateY(${(1 - p) * 50}px) scale(${(0.94 + p * 0.06) * scale}) rotate(${rotate}deg)`, opacity: p }}><Img src={asset(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>;
}

function ChapterHeading({ text, sub, frame, dark = false }: { text: string; sub: string; frame: number; dark?: boolean }): React.ReactNode {
  const op = interpolate(frame, [0, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  const y = interpolate(frame, [0, 34], [28, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  return <div style={{ position: 'absolute', left: 96, top: 82, opacity: op, transform: `translateY(${y}px)`, zIndex: 10, color: dark ? C.paper : C.ink }}><div style={{ fontFamily: fontFamily(), textTransform: 'uppercase', fontWeight: 700, letterSpacing: 4, fontSize: 15, color: dark ? C.butter : C.terra }}>{text}</div><div style={{ marginTop: 10, fontFamily: fontFamily(true), fontSize: 51, lineHeight: 1.05, maxWidth: 830 }}>{sub}</div></div>;
}

function ShotRoomOpen({ shot, frame }: { shot: Shot; frame: number }): React.ReactNode {
  const zoom = interpolate(frame, [0, shot.duration], [1.04, 1.0], { extrapolateRight: 'clamp', easing: ease });
  const logoP = spring({ frame: Math.max(0, frame - 18), fps: 30, config: { damping: 22, stiffness: 80 } });
  return <AbsoluteFill><RoomBackdrop src={shot.asset!} frame={frame} zoom={zoom} /><AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(243,237,222,.88) 0%, rgba(243,237,222,.16) 42%, rgba(32,48,42,.1) 100%)' }} /><div style={{ position: 'absolute', left: 102, top: 118, opacity: logoP, transform: `translateY(${(1 - logoP) * 22}px)` }}><BrandMark /></div><div style={{ position: 'absolute', left: 102, top: 292, width: 700, color: C.ink, fontFamily: fontFamily(true), fontSize: 74, lineHeight: 1.04, opacity: fade(frame, shot.duration, 34, 32) }}>A calmer way to carry a day.</div><div style={{ position: 'absolute', left: 108, bottom: 172, fontFamily: fontFamily(), fontSize: 19, color: C.soft, letterSpacing: 1.5, opacity: fade(frame, shot.duration, 40, 32) }}>LOCAL-FIRST · CONFIRM-BEFORE-SAVE · MADE FOR REAL DAYS</div></AbsoluteFill>;
}

function ShotRoomMap({ shot, frame }: { shot: Shot; frame: number }): React.ReactNode {
  return <AbsoluteFill><RoomBackdrop src={shot.asset!} frame={frame} zoom={interpolate(frame, [0, shot.duration], [1.09, 1.02], { extrapolateRight: 'clamp', easing: ease })} dim={0.04} /><ChapterHeading text="THE ROOM IS THE INTERFACE" sub="A day you can see." frame={frame} /><FloatingLabel text="DESK · captures" x={520} y={780} delay={20} fill={C.butter} /><FloatingLabel text="WINDOW · timeline" x={1260} y={290} delay={34} fill={C.sageWash} /><FloatingLabel text="DOORWAY · leaving prep" x={1490} y={720} delay={48} fill={C.paper} /><div style={{ position: 'absolute', right: 96, top: 105, width: 250, padding: 18, background: 'rgba(251,247,236,.85)', border: `1px solid ${C.line}`, borderRadius: 18, fontFamily: fontFamily(), color: C.soft, fontSize: 16, lineHeight: 1.5, opacity: fade(frame, shot.duration, 50, 28) }}>One small surface for plans, tasks, belongings, clothes, and the moment before you leave.</div></AbsoluteFill>;
}

function ShotVoiceDesk({ shot, frame }: { shot: Shot; frame: number }): React.ReactNode {
  const t = interpolate(frame, [0, shot.duration], [0, 1], { extrapolateRight: 'clamp', easing: ease });
  return <AbsoluteFill><RoomBackdrop src="captures/room.png" frame={frame} zoom={1.01} dim={0.34} /><PanelCard src="captures/voice-assistant.png" x={610} y={130} w={1200} h={820} delay={10} scale={interpolate(t, [0, 1], [1.02, 1], { extrapolateRight: 'clamp' })} /><PanelCard src="captures/desk.png" x={118} y={400} w={700} h={500} rotate={-2} delay={26} scale={0.82} /><ChapterHeading text="VOICE + DESK" sub="Say it. Confirm it." frame={frame} dark /><FloatingLabel text="MUSE ON · path visible" x={1320} y={176} delay={34} color={C.ink} fill={C.butter} /></AbsoluteFill>;
}

function ShotCaptainWindow({ shot, frame }: { shot: Shot; frame: number }): React.ReactNode {
  return <AbsoluteFill><RoomBackdrop src="captures/timeline.png" frame={frame} zoom={1.03} dim={0.18} position="right center" /><ChapterHeading text="MORNING CAPTAIN" sub="A plan that respects time." frame={frame} dark /><div style={{ position: 'absolute', left: 100, top: 360, width: 480, color: C.paper, fontFamily: fontFamily(), fontSize: 23, lineHeight: 1.5, opacity: fade(frame, shot.duration, 44, 26) }}><div style={{ borderLeft: `4px solid ${C.butter}`, paddingLeft: 24 }}>Fixed events stay fixed.<br />Open windows stay honest.<br />Every proposal is checked before it lands.</div></div><div style={{ position: 'absolute', right: 92, bottom: 86, padding: '14px 20px', background: 'rgba(32,48,42,.83)', border: `1px solid rgba(251,247,236,.26)`, borderRadius: 999, color: C.butter, fontFamily: fontFamily(), letterSpacing: 1.2, fontSize: 15 }}>VERIFY → ACCEPT → UNDO</div></AbsoluteFill>;
}

function ShotDoorwayWardrobe({ shot, frame }: { shot: Shot; frame: number }): React.ReactNode {
  const split = interpolate(frame, [0, 32], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  return <AbsoluteFill style={{ background: C.ivory }}><div style={{ position: 'absolute', inset: 0, background: C.ink, opacity: .06 }} /><div style={{ position: 'absolute', left: 50, top: 120, width: 885, height: 820, overflow: 'hidden', borderRadius: 28, boxShadow: '0 24px 60px rgba(32,48,42,.22)', transform: `translateX(${(1 - split) * -80}px)`, opacity: split }}><Img src={asset('captures/doorway.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'right center' }} /></div><div style={{ position: 'absolute', right: 50, top: 120, width: 885, height: 820, overflow: 'hidden', borderRadius: 28, boxShadow: '0 24px 60px rgba(32,48,42,.22)', transform: `translateX(${(1 - split) * 80}px)`, opacity: split }}><Img src={asset('captures/wardrobe.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'right center' }} /></div><div style={{ position: 'absolute', left: 94, top: 70, fontFamily: fontFamily(), textTransform: 'uppercase', letterSpacing: 4, fontSize: 15, color: C.terra }}>LEAVING PREP + WARDROBE</div><div style={{ position: 'absolute', left: 94, top: 842, color: C.ink, fontFamily: fontFamily(true), fontSize: 38, opacity: fade(frame, shot.duration, 38, 22) }}>Leave with less friction.</div><div style={{ position: 'absolute', right: 94, top: 842, color: C.soft, fontFamily: fontFamily(), fontSize: 18, opacity: fade(frame, shot.duration, 42, 22) }}>Pack the real list. Dress from the real closet.</div></AbsoluteFill>;
}

function ShotMemoryRoom({ shot, frame }: { shot: Shot; frame: number }): React.ReactNode {
  return <AbsoluteFill style={{ background: C.paper }}><PanelCard src="captures/storage.png" x={100} y={150} w={1060} h={760} delay={8} /><PanelCard src="captures/decorate.png" x={1120} y={225} w={700} h={500} rotate={2} delay={30} scale={.92} /><div style={{ position: 'absolute', left: 1180, bottom: 176, fontFamily: fontFamily(true), fontSize: 40, color: C.ink, maxWidth: 620, opacity: fade(frame, shot.duration, 42, 22) }}>Remember the details. Then make the room yours.</div><FloatingLabel text="LAST RECORDED · NEVER GUESSED" x={150} y={188} delay={38} color={C.paper} fill={C.ink} /><FloatingLabel text="CLATTER · OPTIONAL" x={1270} y={160} delay={54} color={C.ink} fill={C.butter} /></AbsoluteFill>;
}

function TrustBadge({ label, x, y, delay }: { label: string; x: number; y: number; delay: number }): React.ReactNode {
  const frame = useCurrentFrame();
  const p = spring({ frame: Math.max(0, frame - delay), fps: 30, config: { damping: 16, stiffness: 90 } });
  return <div style={{ position: 'absolute', left: x, top: y, opacity: p, transform: `scale(${.9 + p * .1})`, background: C.sageWash, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 16, padding: '14px 18px', fontFamily: fontFamily(), fontSize: 18, boxShadow: '0 16px 28px rgba(32,48,42,.12)' }}>✓ {label}</div>;
}

function ShotShareTrust({ shot, frame }: { shot: Shot; frame: number }): React.ReactNode {
  return <AbsoluteFill><RoomBackdrop src="captures/ai-setup.png" frame={frame} zoom={1.03} dim={0.42} position="right center" /><div style={{ position: 'absolute', left: 110, top: 150, color: C.paper, fontFamily: fontFamily(true), fontSize: 63, lineHeight: 1.06, maxWidth: 710, opacity: fade(frame, shot.duration, 30, 26) }}>Your day stays yours.</div><div style={{ position: 'absolute', left: 116, top: 400, color: 'rgba(251,247,236,.78)', fontFamily: fontFamily(), fontSize: 22, maxWidth: 540, lineHeight: 1.5, opacity: fade(frame, shot.duration, 46, 26) }}>Share a poster when you choose. Keep your notes, images, and audio on this device by default.</div><TrustBadge label="confirm before save" x={118} y={688} delay={46} /><TrustBadge label="demo and live paths labelled" x={118} y={760} delay={60} /><TrustBadge label="local-first by design" x={118} y={832} delay={74} /></AbsoluteFill>;
}

function ArchitectureBox({ label, sub, x, y, color, delay }: { label: string; sub: string; x: number; y: number; color: string; delay: number }): React.ReactNode {
  const frame = useCurrentFrame();
  const p = spring({ frame: Math.max(0, frame - delay), fps: 30, config: { damping: 18, stiffness: 100 } });
  return <div style={{ position: 'absolute', left: x, top: y, width: 300, minHeight: 118, padding: '18px 20px', borderRadius: 18, border: `2px solid ${color}`, background: 'rgba(251,247,236,.94)', color: C.ink, boxShadow: '0 20px 45px rgba(32,48,42,.14)', opacity: p, transform: `translateY(${(1 - p) * 26}px)` }}><div style={{ fontFamily: fontFamily(), textTransform: 'uppercase', letterSpacing: 2.2, fontSize: 13, color }}>{label}</div><div style={{ marginTop: 10, fontFamily: fontFamily(true), fontSize: 27 }}>{sub}</div></div>;
}

function Connector({ x1, y1, x2, y2, delay }: { x1: number; y1: number; x2: number; y2: number; delay: number }): React.ReactNode {
  const frame = useCurrentFrame();
  const p = spring({ frame: Math.max(0, frame - delay), fps: 30, config: { damping: 22, stiffness: 60 } });
  const width = x2 - x1;
  return <div style={{ position: 'absolute', left: x1, top: y1, width: width * p, height: 3, background: C.terra, transformOrigin: 'left center', opacity: p }} />;
}

function ShotArchitecture({ shot, frame }: { shot: Shot; frame: number }): React.ReactNode {
  return <AbsoluteFill style={{ background: C.ivory }}><div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 20%, #fffdf6 0%, #f3edde 58%, #e7efe4 100%)' }} /><ChapterHeading text="SYSTEM DESIGN" sub="Simple foundations. Honest paths." frame={frame} /><div style={{ position: 'absolute', left: 160, top: 390, width: 1600, height: 3, background: C.line }} /><ArchitectureBox label="UI" sub="interactive room" x={130} y={420} color={C.terra} delay={20} /><ArchitectureBox label="STATE" sub="AppState + undo" x={500} y={420} color={C.sage} delay={36} /><ArchitectureBox label="STORAGE" sub="localStorage + IndexedDB" x={870} y={420} color={C.butter} delay={52} /><ArchitectureBox label="OPTIONAL AI" sub="Vercel → Meta Muse" x={1240} y={420} color={C.teal} delay={68} /><ArchitectureBox label="SAFETY" sub="confirm + verify" x={610} y={710} color={C.ink} delay={92} /><Connector x1={430} y1={478} x2={500} y2={478} delay={28} /><Connector x1={800} y1={478} x2={870} y2={478} delay={44} /><Connector x1={1170} y1={478} x2={1240} y2={478} delay={60} /><Connector x1={1020} y1={540} x2={790} y2={710} delay={86} /><div style={{ position: 'absolute', right: 120, bottom: 124, color: C.soft, fontFamily: fontFamily(), fontSize: 18, letterSpacing: 1.1, opacity: fade(frame, shot.duration, 110, 20) }}>FALLBACK IS VISIBLE · RULES STAY IN APP CODE</div></AbsoluteFill>;
}

function ShotRecap({ shot, frame }: { shot: Shot; frame: number }): React.ReactNode {
  const assets = ['captures/room.png', 'captures/voice-assistant.png', 'captures/timeline.png', 'captures/doorway.png', 'captures/wardrobe.png', 'captures/storage.png'];
  return <AbsoluteFill style={{ background: C.ink }}><div style={{ position: 'absolute', left: 100, top: 90, color: C.paper, fontFamily: fontFamily(true), fontSize: 58 }}>One calm surface.</div><div style={{ position: 'absolute', left: 104, top: 178, color: C.butter, fontFamily: fontFamily(), textTransform: 'uppercase', letterSpacing: 3, fontSize: 14 }}>CAPTURE · PLAN · PACK · FIND</div>{assets.map((src, i) => { const col = i % 3; const row = Math.floor(i / 3); const delay = i * 10; const p = spring({ frame: Math.max(0, frame - delay), fps: 30, config: { damping: 15, stiffness: 95 } }); return <div key={src} style={{ position: 'absolute', left: 110 + col * 585, top: 270 + row * 310, width: 540, height: 275, overflow: 'hidden', borderRadius: 20, border: `1px solid rgba(251,247,236,.28)`, boxShadow: '0 16px 38px rgba(0,0,0,.24)', opacity: p, transform: `translateY(${(1 - p) * 30}px) scale(${.94 + p * .06})` }}><Img src={asset(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>; })}<div style={{ position: 'absolute', right: 112, top: 96, color: C.paper, fontFamily: fontFamily(), fontSize: 18, opacity: fade(frame, shot.duration, 50, 22) }}>No accounts. No tracking. Your tap decides.</div></AbsoluteFill>;
}

function ShotOutro({ shot, frame }: { shot: Shot; frame: number }): React.ReactNode {
  const p = spring({ frame: Math.max(0, frame - 24), fps: 30, config: { damping: 22, stiffness: 70 } });
  return <AbsoluteFill style={{ background: C.ink, alignItems: 'center', justifyContent: 'center' }}><div style={{ opacity: p, transform: `translateY(${(1 - p) * 28}px)`, textAlign: 'center' }}><BrandMark dark /><div style={{ marginTop: 62, color: C.butter, fontFamily: fontFamily(true), fontSize: 58 }}>Make room for today.</div><div style={{ marginTop: 26, color: 'rgba(251,247,236,.7)', fontFamily: fontFamily(), fontSize: 19, letterSpacing: 1.8 }}>pocketroom-six.vercel.app</div></div><div style={{ position: 'absolute', bottom: 70, color: 'rgba(251,247,236,.42)', fontFamily: fontFamily(), fontSize: 13, letterSpacing: 3, textTransform: 'uppercase', opacity: fade(frame, shot.duration, 70, 20) }}>a local-first day planner by Anuranjan Jain</div></AbsoluteFill>;
}

function RenderShot({ shot, frame }: { shot: Shot; frame: number }): React.ReactNode {
  if (shot.id === 'room-open') return <ShotRoomOpen shot={shot} frame={frame} />;
  if (shot.id === 'room-map') return <ShotRoomMap shot={shot} frame={frame} />;
  if (shot.id === 'voice-desk') return <ShotVoiceDesk shot={shot} frame={frame} />;
  if (shot.id === 'captain-window') return <ShotCaptainWindow shot={shot} frame={frame} />;
  if (shot.id === 'doorway-wardrobe') return <ShotDoorwayWardrobe shot={shot} frame={frame} />;
  if (shot.id === 'memory-room') return <ShotMemoryRoom shot={shot} frame={frame} />;
  if (shot.id === 'share-trust') return <ShotShareTrust shot={shot} frame={frame} />;
  if (shot.id === 'architecture') return <ShotArchitecture shot={shot} frame={frame} />;
  if (shot.id === 'recap') return <ShotRecap shot={shot} frame={frame} />;
  return <ShotOutro shot={shot} frame={frame} />;
}

export const PocketroomLaunch: React.FC<Props> = ({ bgm = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shot = SHOTS.find((candidate) => frame >= candidate.from && frame < candidate.from + candidate.duration) ?? SHOTS[SHOTS.length - 1];
  const localFrame = frame - shot.from;
  const chapterIndex = SHOTS.indexOf(shot);

  return <AbsoluteFill style={{ background: C.ivory, fontFamily: fontFamily() }}>
    <RenderShot shot={shot} frame={localFrame} />
    {chapterIndex < CAPTION_LINES.length && <Caption shot={{ ...shot, caption: CAPTION_LINES[chapterIndex] }} frame={localFrame} />}
    {SFX_CUES.map((cue) => <Sequence key={`${cue.src}-${cue.from}`} from={cue.from} durationInFrames={Math.min(80, TOTAL_FRAMES - cue.from)}><Audio src={staticFile(cue.src)} volume={cue.volume} /></Sequence>)}
    <Audio src={staticFile('audio/narration/narration-master.mp3')} volume={1} />
    {bgm && <Audio src={staticFile('audio/bgm/pocketroom-bed.mp3')} loop volume={(f) => {
      const sec = f / fps;
      const duck = sec < 2 || sec > 177 ? 0.08 : 0.13;
      return duck;
    }} />}
  </AbsoluteFill>;
};

export { SHOTS };
