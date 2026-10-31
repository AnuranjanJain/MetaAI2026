// Pocketroom shared record types. Records link by stable ids; views never
// duplicate source data.

export type Id = string;

export type CaptureKind = 'note' | 'image';
export type CaptureStatus = 'inbox' | 'confirmed' | 'archived';
export type ProposalType = 'task' | 'event' | 'item' | 'reference';

export interface Proposal {
  type: ProposalType;
  title: string;
  /** YYYY-MM-DD, only when the source supports it */
  date?: string;
  /** HH:MM 24h, only when the source supports it */
  time?: string;
  endTime?: string;
  place?: string;
  prep?: string;
  durationMin?: number;
  itemName?: string;
  locationHint?: string;
  confidence: 'high' | 'medium' | 'low';
  /** Human-readable gaps, e.g. "no date found in source". Never invented. */
  missing: string[];
  rationale: string;
}

export interface Capture {
  id: Id;
  kind: CaptureKind;
  /** Note text, or user-added caption / OCR-less note for images. */
  text: string;
  imageDataUrl?: string;
  name: string;
  status: CaptureStatus;
  proposal?: Proposal;
  /** Id of the record created from this capture, if any. */
  resultId?: Id;
  resultKind?: ProposalType;
  createdAt: string;
}

export interface Task {
  id: Id;
  title: string;
  notes?: string;
  durationMin: number;
  flexible: true;
  /** ISO datetime when scheduled, local time. */
  start?: string;
  done: boolean;
  sourceCaptureId?: Id;
  createdAt: string;
  updatedAt: string;
}

export interface CalEvent {
  id: Id;
  title: string;
  /** YYYY-MM-DD in the user's local timezone. */
  date: string;
  /** HH:MM 24h. */
  start: string;
  end?: string;
  place?: string;
  prep?: string;
  fixed: true;
  outfitId?: Id;
  sourceCaptureId?: Id;
  createdAt: string;
}

export interface Belonging {
  id: Id;
  name: string;
  description?: string;
  locationId?: Id;
  photoDataUrl?: string;
  history: { locationId: Id | null; at: string; note?: string }[];
  createdAt: string;
}

export interface StorageLocation {
  id: Id;
  name: string;
  note?: string;
  photoDataUrl?: string;
  createdAt: string;
}

export type ClothingState = 'available' | 'worn' | 'laundry' | 'unavailable';

export interface Clothing {
  id: Id;
  name: string;
  category: 'top' | 'bottom' | 'shoes' | 'outer' | 'other';
  color?: string;
  tags: string[];
  state: ClothingState;
  /** True for built-in explorable items the user does not own. */
  sample?: boolean;
  createdAt: string;
}

export interface Outfit {
  id: Id;
  name: string;
  itemIds: Id[];
  occasion?: string;
  eventId?: Id;
  createdAt: string;
}

export interface Routine {
  id: Id;
  name: string;
  belongingIds: Id[];
  tasks: { id: Id; title: string }[];
}

export type CheckState = 'needed' | 'packed' | 'skipped' | 'unresolved';

export interface CheckItem {
  id: Id;
  label: string;
  belongingId?: Id;
  state: CheckState;
  eventId?: Id;
  routineId?: Id;
}

export interface SoundPrefs {
  enabled: boolean;
  muted: boolean;
}

export interface DecorPrefs {
  wall: 'ivory' | 'sage' | 'butter' | 'sky' | 'blush';
  poster: 'none' | 'sunset' | 'peaks' | 'quote' | 'garden' | 'custom';
  /** Downscaled JPEG data URL for poster 'custom'; stays on this device. */
  customPoster?: string;
}

export interface AppState {
  version: 1;
  captures: Capture[];
  tasks: Task[];
  events: CalEvent[];
  belongings: Belonging[];
  locations: StorageLocation[];
  clothing: Clothing[];
  outfits: Outfit[];
  routines: Routine[];
  checklist: CheckItem[];
  sound: SoundPrefs;
  /** Optional so saves from before wall decor still load cleanly. */
  decor?: DecorPrefs;
  updatedAt: string;
}
