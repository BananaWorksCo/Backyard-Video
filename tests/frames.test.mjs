import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { containRect } from '../src/canvas-renderer.js';
import { FrameCache } from '../src/frame-cache.js';
const manifest = JSON.parse(await readFile(new URL('../public/frames/manifest.json', import.meta.url), 'utf8'));

test('all manifest offsets and on-disk frames are contiguous', async () => {
  let offset = 0;
  for (const [index, sequence] of manifest.sequences.entries()) {
    assert.equal(sequence.startFrame, offset);
    assert.equal(sequence.endFrame, offset + sequence.frameCount - 1);
    assert.equal(sequence.droppedOpeningFrames, index > 0 ? 1 : 0);
    assert.equal(sequence.fps, 18);
    const files = (await readdir(new URL(`../public/${sequence.directory}/`, import.meta.url))).sort();
    assert.equal(files.length, sequence.frameCount);
    files.forEach((file, index) => assert.equal(file, `frame-${String(index + 1).padStart(4, '0')}.webp`));
    offset += sequence.frameCount;
  }
  assert.equal(offset, manifest.totalFrames);
  assert.deepEqual(manifest.stageFrames, [0, manifest.sequences[0].endFrame, manifest.sequences[1].endFrame, offset - 1]);
});

test('contain drawing preserves the full image in portrait and ultrawide viewports', () => {
  for (const [width, height] of [[390, 844], [2560, 1080], [1440, 900]]) {
    const rect = containRect(1920, 1080, width, height);
    assert.ok(rect.x >= 0 && rect.y >= 0);
    assert.ok(rect.width <= width && rect.height <= height);
    assert.ok(Math.abs(rect.width / rect.height - 16 / 9) < 0.001);
    assert.equal(rect.x * 2 + rect.width, width);
    assert.equal(rect.y * 2 + rect.height, height);
  }
});

test('global sequence joins produce valid subdirectory-relative frame URLs', () => {
  const cache = new FrameCache(manifest, { baseURL: new URL('https://example.com/project/'), onLoad() {}, onError() {} });
  for (const sequence of manifest.sequences) {
    assert.equal(cache.url(sequence.startFrame), `https://example.com/project/${sequence.directory}/frame-0001.webp`);
    assert.match(cache.url(sequence.endFrame), new RegExp(`frame-${String(sequence.frameCount).padStart(4, '0')}\\.webp$`));
  }
});

test('the camera descent is appended and both the aerial join and final view stay pinned', () => {
  assert.deepEqual(manifest.sequences.map(sequence => sequence.source), [
    'backyard-1-2.mp4', 'backyard-2-3.mp4', 'backyard-3-4.mp4', 'backyard-final.mp4',
  ]);
  assert.deepEqual(manifest.sequences.map(sequence => sequence.startFrame), [0, 91, 181, 271]);
  assert.deepEqual(manifest.sequences.slice(0, 3).map(sequence => sequence.frameCount), [91, 90, 90]);
  const cache = new FrameCache(manifest, { baseURL: new URL('https://example.com/project/'), onLoad() {}, onError() {} });
  assert.deepEqual([...cache.pinned].sort((a, b) => a - b), [0, 90, 180, 270, manifest.totalFrames - 1]);
  assert.equal(cache.maxSize, 20);
});
