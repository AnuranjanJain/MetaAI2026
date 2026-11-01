// Record player: uploads queue ahead of builtins, transport wraps across
// the combined queue, and removing the current upload never strands the index.
// The singleton is restored after each test so order does not matter.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { player, TRACKS } from '../src/music.js';

const saved = { custom: player.custom, index: player.index, playing: player.playing, notice: player.notice };

beforeEach(() => {
  player.custom = [];
  player.index = 0;
  player.playing = false;
  player.notice = '';
});

afterEach(() => {
  player.custom = saved.custom;
  player.index = saved.index;
  player.playing = saved.playing;
  player.notice = saved.notice;
});

describe('music queue', () => {
  it('queues uploads ahead of the builtin loops', () => {
    player.custom = [
      { id: 'up-a', title: 'My song', url: 'blob:1' },
      { id: 'up-b', title: 'Demo tape', url: 'blob:2' },
    ];
    assert.equal(player.queue.length, TRACKS.length + 2);
    assert.equal(player.queue[0].key, 'up-a');
    assert.equal(player.queue[0].custom, true);
    assert.equal(player.queue[2].key, TRACKS[0].id);
    assert.equal(player.queue[2].custom, false);
    assert.equal(player.track.title, 'My song');
    assert.ok(player.isCustom());
  });

  it('transport wraps across uploads and builtins', () => {
    player.custom = [{ id: 'up-a', title: 'My song', url: 'blob:1' }];
    player.prev(); // 0 -> last builtin
    assert.equal(player.index, TRACKS.length);
    assert.ok(!player.isCustom());
    player.next(); // wrap to the upload
    assert.equal(player.index, 0);
    assert.ok(player.isCustom());
  });

  it('removing the current upload drops it and keeps a valid index', async () => {
    player.custom = [{ id: 'up-a', title: 'My song', url: 'blob:1' }];
    await player.removeCurrentUpload();
    assert.equal(player.custom.length, 0);
    assert.equal(player.queue.length, TRACKS.length);
    assert.equal(player.index, 0);
  });

  it('removes one upload by id and leaves the rest queued', async () => {
    player.custom = [
      { id: 'up-a', title: 'First', url: 'blob:1' },
      { id: 'up-b', title: 'Second', url: 'blob:2' },
    ];
    await player.removeUpload('up-a');
    assert.deepEqual(player.custom.map((c) => c.id), ['up-b']);
    assert.equal(player.queue[0].key, 'up-b');
    await player.removeUpload('missing-id');
    assert.equal(player.custom.length, 1);
  });

  it('rejects non-audio files without touching the queue', async () => {
    const before = player.queue.length;
    await player.addUpload({ name: 'notes.txt', type: 'text/plain', size: 10 } as unknown as File);
    assert.equal(player.queue.length, before);
    assert.match(player.notice, /not an audio file/);
  });

  it('favourites are keyed per queue entry', () => {
    const key = player.track.key;
    assert.equal(player.isFavorite(), false);
    player.toggleFavorite();
    assert.equal(player.isFavorite(), true);
    player.toggleFavorite();
    assert.equal(player.isFavorite(), false);
    assert.ok(!player.favorites.has(key));
  });
});
