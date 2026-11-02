// Record player: uploads queue ahead of builtins, transport wraps across
// the combined queue, and removing the current upload never strands the index.
// The singleton is restored after each test so order does not matter.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { player, sanitizePlaylists, TRACKS } from '../src/music.js';

const saved = {
  custom: player.custom, index: player.index, playing: player.playing, notice: player.notice,
  playlists: player.playlists, activePlaylistId: player.activePlaylistId,
};

beforeEach(() => {
  player.custom = [];
  player.index = 0;
  player.playing = false;
  player.notice = '';
  player.playlists = [];
  player.activePlaylistId = null;
});

afterEach(() => {
  player.custom = saved.custom;
  player.index = saved.index;
  player.playing = saved.playing;
  player.notice = saved.notice;
  player.playlists = saved.playlists;
  player.activePlaylistId = saved.activePlaylistId;
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

  it('refuses more uploads once the shelf is full', async () => {
    player.custom = Array.from({ length: 200 }, (_, i) => ({ id: `up-${i}`, title: `Song ${i}`, url: `blob:${i}` }));
    await player.addUpload({ name: 'one-more.mp3', type: 'audio/mpeg', size: 10 } as unknown as File);
    assert.equal(player.custom.length, 200);
    assert.match(player.notice, /shelf is full/);
  });
});

describe('music playlists', () => {
  it('creates playlists with trimmed names and rejects blanks', () => {
    assert.equal(player.createPlaylist('   '), null);
    const pl = player.createPlaylist('  Focus mix  ');
    assert.ok(pl);
    assert.equal(pl.name, 'Focus mix');
    assert.deepEqual(pl.keys, []);
    assert.equal(player.playlists.length, 1);
  });

  it('adds builtin and upload keys once each, rejects unknown keys', () => {
    const pl = player.createPlaylist('Mix')!;
    player.custom = [{ id: 'up-a', title: 'My song', url: 'blob:1' }];
    assert.equal(player.addToPlaylist(pl.id, TRACKS[0].id), true);
    assert.equal(player.addToPlaylist(pl.id, 'up-a'), true);
    assert.equal(player.addToPlaylist(pl.id, 'up-a'), false); // no dupes
    assert.equal(player.addToPlaylist(pl.id, 'nope'), false);
    assert.deepEqual(pl.keys, [TRACKS[0].id, 'up-a']);
  });

  it('playing a playlist narrows the queue to its members in order', () => {
    const pl = player.createPlaylist('Mix')!;
    player.custom = [{ id: 'up-a', title: 'My song', url: 'blob:1' }];
    player.addToPlaylist(pl.id, 'up-a');
    player.addToPlaylist(pl.id, TRACKS[1].id);
    player.playPlaylist(pl.id);
    assert.deepEqual(player.queue.map((q) => q.key), ['up-a', TRACKS[1].id]);
    assert.equal(player.track.title, 'My song');
    player.next();
    assert.equal(player.track.key, TRACKS[1].id);
    player.playPlaylist(null);
    assert.equal(player.queue.length, TRACKS.length + 1);
  });

  it('leaving a mix returns to the library on the same track', () => {
    const pl = player.createPlaylist('Mix')!;
    player.addToPlaylist(pl.id, TRACKS[2].id);
    player.addToPlaylist(pl.id, TRACKS[4].id);
    player.playPlaylist(pl.id);
    player.next();
    assert.equal(player.track.key, TRACKS[4].id);
    player.exitPlaylist();
    assert.equal(player.activePlaylistId, null);
    assert.equal(player.queue.length, TRACKS.length);
    assert.equal(player.track.key, TRACKS[4].id);
  });

  it('drops missing uploads from a playlist queue without breaking', () => {
    const pl = player.createPlaylist('Mix')!;
    player.addToPlaylist(pl.id, TRACKS[0].id);
    pl.keys.push('up-gone'); // upload removed behind our back
    player.playPlaylist(pl.id);
    assert.deepEqual(player.queue.map((q) => q.key), [TRACKS[0].id]);
  });

  it('removing an upload strips it from every playlist', async () => {
    const pl = player.createPlaylist('Mix')!;
    player.custom = [{ id: 'up-a', title: 'My song', url: 'blob:1' }];
    player.addToPlaylist(pl.id, 'up-a');
    player.addToPlaylist(pl.id, TRACKS[0].id);
    await player.removeUpload('up-a');
    assert.deepEqual(pl.keys, [TRACKS[0].id]);
  });

  it('removes members and deletes playlists', () => {
    const pl = player.createPlaylist('Mix')!;
    player.addToPlaylist(pl.id, TRACKS[0].id);
    assert.equal(player.removeFromPlaylist(pl.id, TRACKS[1].id), false);
    assert.equal(player.removeFromPlaylist(pl.id, TRACKS[0].id), true);
    assert.deepEqual(pl.keys, []);
    assert.equal(player.deletePlaylist('missing'), false);
    assert.equal(player.deletePlaylist(pl.id), true);
    assert.equal(player.playlists.length, 0);
  });

  it('sanitizes stored playlists and drops malformed rows', () => {
    const cleaned = sanitizePlaylists([
      { id: 'pl-1', name: '  Road  ', keys: ['morning', 7, 'x'.repeat(300)] },
      { id: 'pl-2', name: '', keys: [] },
      'junk',
      null,
    ]);
    assert.deepEqual(cleaned, [{ id: 'pl-1', name: 'Road', keys: ['morning'] }]);
  });
});
