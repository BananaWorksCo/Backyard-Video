# Landscape Vision

A full-screen, scroll-controlled landscape transformation. Vite, vanilla JavaScript, GSAP ScrollTrigger and Lenis drive a canvas of WebP frames; the original videos never play or seek in the browser.

## Run locally

Requires Node.js 20.19+ and npm, plus FFmpeg and FFprobe. On macOS:

```bash
brew install ffmpeg
```

Some minimal FFmpeg distributions omit the WebP encoder. The script also supports FFmpeg extraction followed by `cwebp`; install that optional fallback with `brew install webp`.

Place these original files in `public/videos/` (already populated in this project):

```text
backyard-1-2.mp4
backyard-2-3.mp4
backyard-3-4.mp4
backyard-final.mp4
```

```bash
npm install
npm run frames
npm run dev
```

Open the local URL printed by Vite. Both `dev` and `build` check the videos and automatically generate missing or changed sequences. Unchanged sequences are reused. To force a complete regeneration, delete `public/frames/` and run `npm run frames`.

```bash
npm run build
npm run preview
```

The build output is `dist/`. Source videos must remain below GitHub's 100 MiB individual-file limit; the extraction script checks this and provides a compression command if necessary.

## Edit the presentation

Edit **`src/content.js`** for all presentation messages, stage labels, and copy transition thresholds. Keep four stages with increasing progress values from 0 to 1, relative to the original sketch-to-aerial transformation. The app preserves those scroll positions when appending the camera descent. The fourth navigation button goes to the finished ground-level view. In reduced-motion mode, buttons select the four actual boundary frames immediately and scrolling does not animate the landscape.

Change `src/style.css` for typography/layout and `settings` in `scripts/extract-frames.mjs` for extraction quality. Current defaults: 18 FPS, maximum width 1440px, WebP quality 80. The first frame of sequences two, three and four is removed at the join. Global frame offsets in `public/frames/manifest.json` are zero-based and inclusive; filenames start at `frame-0001.webp` within each sequence.

The sticky presentation extends the original 480vh section to approximately 606.67vh (using svh where supported), keeping the original frames and copy at the same scroll distances. Its height is calculated from the generated frame counts. It contains the complete 16:9 image, centred with dark letterboxing. The canvas pixel ratio is capped at 1.5. A 20-frame LRU cache retains the opening frame and all four sequence endpoints, including both the aerial join and final ground-level view, plus approximately seven to eight surrounding frames in each direction, with at most three network requests in flight. Decoded bitmaps are closed on eviction. Fast scrolling may temporarily show the nearest cached frame while the precise frame loads; slow scrolling can reach every extracted intermediate frame. No network-dependent renderer can guarantee displaying every frame during an arbitrarily fast scroll.

## GitHub Pages

1. Create a GitHub repository and commit the project, including `package-lock.json` and the four files in `public/videos/`. Generated frames, `node_modules`, and `dist` are ignored. The old root `videos/` directory is retained locally and ignored.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
3. Push to `main`, or run **Deploy landscape to GitHub Pages** from the Actions tab.

The workflow installs Node 20 and FFmpeg, runs `npm ci` and `npm run build`, uploads `dist`, and deploys with the official Pages actions. Deployments are serialised. Vite uses `base: './'`; all frame URLs resolve through `import.meta.env.BASE_URL`, so a repository subdirectory works without hard-coding its name. Generated frames are included in `dist` even though they are ignored by Git.

## Verification

```bash
npm test
npx playwright test
```

Browser tests start a local Vite server and verify all four clips at nine scroll positions in both directions, original scroll pacing and copy timing, the new join under delayed loading and rapid reversals, final-frame persistence, mobile layout, keyboard navigation, reduced motion, error handling and the Image fallback. Install the test browser once if needed: `npx playwright install chromium`. To run the same checks against preview, start `npm run preview` and use `TEST_BASE_URL=http://127.0.0.1:4173 npx playwright test`.

If frames or JavaScript fail, the page displays an explanation. Frame failures after startup preserve the last usable picture and display a reload control. A disabled-JavaScript browser receives an explicit fallback message.
