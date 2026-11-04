import type { FC } from 'react';
import { Composition, registerRoot } from 'remotion';
import { InteractiveCut } from './InteractiveCut';
import { RawFilm } from './RawFilm';
export const FPS=30;
export const TOTAL_FRAMES=5640;
export const RAW_TOTAL_FRAMES=6990;

export const Root: FC = () => (
  <>
  <Composition
    id="PocketroomLaunch"
    component={InteractiveCut}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={{ bgm: true }}
  />
  <Composition
    id="PocketroomRawFilm"
    component={RawFilm}
    durationInFrames={RAW_TOTAL_FRAMES}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={{ bgm: true }}
  />
  </>
);

registerRoot(Root);
