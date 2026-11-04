export type Shot = {
  id: string;
  from: number;
  duration: number;
  title: string;
  caption: string;
  asset?: string;
};

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const TOTAL_FRAMES = 5400;

// Chapter boundaries follow the measured narration segments after the final
// tempo normalization, so the visual change lands with the next sentence.
export const SHOTS: Shot[] = [
  { id: 'room-open', from: 0, duration: 450, title: 'POCKETROOM', caption: 'Everything you need for today, in one little place.', asset: 'captures/room.png' },
  { id: 'room-map', from: 450, duration: 450, title: 'A DAY YOU CAN SEE', caption: 'Your day becomes a room you can read.', asset: 'captures/room.png' },
  { id: 'voice-desk', from: 900, duration: 600, title: 'SAY IT. CONFIRM IT.', caption: 'Your words become a proposal, never a surprise.', asset: 'captures/voice-assistant.png' },
  { id: 'captain-window', from: 1500, duration: 500, title: 'A PLAN THAT RESPECTS TIME', caption: 'Fixed events stay fixed. Open time stays honest.', asset: 'captures/timeline.png' },
  { id: 'doorway-wardrobe', from: 2000, duration: 450, title: 'LEAVE WITH LESS FRICTION', caption: 'Pack by routine. Dress from what you actually own.', asset: 'captures/doorway.png' },
  { id: 'memory-room', from: 2450, duration: 450, title: 'REMEMBER THE DETAILS', caption: 'Last recorded, never guessed. Personal, quiet, undoable.', asset: 'captures/storage.png' },
  { id: 'share-trust', from: 2900, duration: 600, title: 'YOUR DAY STAYS YOURS', caption: 'Share when you choose. Keep the rest on this device.', asset: 'captures/ai-setup.png' },
  { id: 'recap', from: 3500, duration: 1000, title: 'ONE CALM SURFACE', caption: 'Capture. Plan. Pack. Find. Move on.', asset: 'captures/room.png' },
  { id: 'architecture', from: 4500, duration: 750, title: 'UNDER THE ROOM', caption: 'Browser-first state. Optional Muse routes. App-owned rules.', asset: 'captures/list.png' },
  { id: 'outro', from: 5250, duration: 150, title: 'MAKE ROOM FOR TODAY', caption: 'pocketroom-six.vercel.app', asset: 'captures/room.png' },
];

export const SFX_CUES = [
  { from: 82, src: 'audio/sfx/fs-728515.mp3', volume: 0.26, label: 'room resolves' },
  { from: 940, src: 'audio/sfx/fs-876011.mp3', volume: 0.18, label: 'voice proposal lands' },
  { from: 1540, src: 'audio/sfx/fs-876011.mp3', volume: 0.16, label: 'plan cards settle' },
  { from: 2040, src: 'audio/sfx/fs-876011.mp3', volume: 0.16, label: 'leaving list settles' },
  { from: 2490, src: 'audio/sfx/fs-876011.mp3', volume: 0.14, label: 'memory strip switches' },
  { from: 2940, src: 'audio/sfx/fs-728515.mp3', volume: 0.16, label: 'trust section resolves' },
  { from: 3590, src: 'audio/sfx/fs-876011.mp3', volume: 0.16, label: 'recap montage glint' },
  { from: 4540, src: 'audio/sfx/fs-728515.mp3', volume: 0.22, label: 'architecture locks' },
  { from: 5310, src: 'audio/sfx/fs-876011.mp3', volume: 0.3, label: 'logo resolves' },
];

export const CAPTION_LINES = [
  'A cozy, local-first day planner.',
  'Room · voice · plan · leave',
  'Nothing saves without your tap.',
  'The app checks before it changes anything.',
  'Routines become a leaving list.',
  'Ambiguous matches stay visible.',
  'Demo paths and live paths are labelled.',
  'Local state first. Optional intelligence second.',
  'One room. Many small decisions.',
  'Try the live demo today.',
];
