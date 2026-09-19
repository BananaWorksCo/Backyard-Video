import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, stat, readdir, rm, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'public/frames');
const settings = { fps: 18, maxWidth: 1440, quality: 80, version: 1 };
const sources = [
  ['Sketch to plan', 'backyard-1-2.mp4', '01-sketch-to-plan'],
  ['Plan to colour', 'backyard-2-3.mp4', '02-plan-to-colour'],
  ['Colour to 3D', 'backyard-3-4.mp4', '03-colour-to-3d'],
  ['Aerial to ground', 'backyard-final.mp4', '04-aerial-to-ground'],
];

function command(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error?.code === 'ENOENT') {
    throw new Error(`${binary} is missing. Install FFmpeg (includes FFprobe): brew install ffmpeg (macOS), or sudo apt-get install ffmpeg (Ubuntu).`);
  }
  if (result.error || result.status !== 0) throw new Error(`${binary} failed: ${result.error?.message || result.stderr}`);
  return result.stdout;
}

async function json(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}

async function main() {
  command('ffmpeg', ['-version']);
  command('ffprobe', ['-version']);
  const nativeWebp = /\blibwebp\s/.test(command('ffmpeg', ['-hide_banner', '-encoders']));
  if (!nativeWebp) {
    try { command('cwebp', ['-version']); }
    catch { throw new Error('This FFmpeg build has no libwebp encoder. Install a WebP-enabled FFmpeg build, or install the fallback encoder: brew install webp'); }
    console.log('FFmpeg has no libwebp encoder; using FFmpeg extraction + cwebp encoding.');
  }
  // Validate every input before modifying any existing frames.
  const inputs = await Promise.all(sources.map(async ([name, source, directory], index) => {
    const file = path.join(root, 'public/videos', source);
    const info = await stat(file).catch(() => { throw new Error(`Missing video: public/videos/${source}. Place all ${sources.length} original MP4 files in public/videos/ and run npm run frames.`); });
    if (info.size >= 100 * 1024 * 1024) {
      throw new Error(`${source} is ${(info.size / 1024 / 1024).toFixed(1)} MiB, exceeding GitHub's 100 MiB individual-file limit. Compress to a separate file, verify its size, then replace the source:\nffmpeg -i "${file}" -vf "scale='min(1440,iw)':-2" -c:v libx264 -crf 24 -preset slow -an "${file.replace('.mp4', '-compressed.mp4')}"`);
    }
    const duration = Number(command('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]).trim());
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Cannot read a valid duration from ${source}.`);
    return { name, source, directory, file, duration, skipOpening: index > 0, fingerprint: { size: info.size, mtimeMs: info.mtimeMs, settings, skipOpening: index > 0 } };
  }));
  await mkdir(output, { recursive: true });
  const previous = await json(path.join(output, '.generation-cache.json')) || {};
  const cache = {};
  const sequences = [];
  let totalFrames = 0;

  for (const input of inputs) {
    const destination = path.join(output, input.directory);
    const old = previous[input.source];
    const files = (await readdir(destination).catch(() => [])).sort();
    const complete = old?.frameCount > 0 && files.length === old.frameCount && files.every((name, i) => name === `frame-${String(i + 1).padStart(4, '0')}.webp`);
    let frameCount = old?.frameCount;
    if (JSON.stringify(old?.fingerprint) === JSON.stringify(input.fingerprint) && complete) {
      console.log(`Unchanged: ${input.source} (${frameCount} frames)`);
    } else {
      const temp = `${destination}.tmp`;
      await rm(temp, { recursive: true, force: true });
      await mkdir(temp, { recursive: true });
      console.log(`Extracting ${input.source}: ${input.duration.toFixed(3)}s, ${settings.fps} FPS…`);
      const filters = [`fps=${settings.fps}`, `scale='min(${settings.maxWidth},iw)':-2`];
      // Drop exactly the first sampled frame at each shared sequence boundary.
      if (input.skipOpening) filters.push("select='gte(n,1)'");
      const encoder = nativeWebp ? ['-c:v', 'libwebp', '-quality', String(settings.quality), '-compression_level', '4'] : ['-c:v', 'png'];
      command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input.file, '-map', '0:v:0', '-vf', filters.join(','), '-fps_mode', 'vfr', ...encoder, '-an', '-start_number', '1', path.join(temp, nativeWebp ? 'frame-%04d.webp' : 'frame-%04d.png')]);
      if (!nativeWebp) {
        for (const file of (await readdir(temp)).filter(file => file.endsWith('.png')).sort()) {
          command('cwebp', ['-quiet', '-q', String(settings.quality), '-m', '4', path.join(temp, file), '-o', path.join(temp, file.replace('.png', '.webp'))]);
          await rm(path.join(temp, file));
        }
      }
      frameCount = (await readdir(temp)).filter(file => /^frame-\d{4}\.webp$/.test(file)).length;
      if (!frameCount) throw new Error(`FFmpeg produced no frames for ${input.source}.`);
      await rm(destination, { recursive: true, force: true });
      await rename(temp, destination);
    }
    cache[input.source] = { fingerprint: input.fingerprint, frameCount };
    sequences.push({ name: input.name, source: input.source, directory: `frames/${input.directory}`, frameCount, duration: input.duration, fps: settings.fps, startFrame: totalFrames, endFrame: totalFrames + frameCount - 1, droppedOpeningFrames: input.skipOpening ? 1 : 0 });
    totalFrames += frameCount;
  }
  const manifest = { version: 1, settings, totalFrames, sequences, stageFrames: [0, sequences[0].endFrame, sequences[1].endFrame, totalFrames - 1] };
  await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(output, '.generation-cache.json'), `${JSON.stringify(cache, null, 2)}\n`);
  console.log(`Ready: ${totalFrames} frames across ${sequences.length} sequences.`);
}

main().catch(error => { console.error(`\nFrame generation failed: ${error.message}\n`); process.exitCode = 1; });
