# Verification results

Verified locally on 19 September 2026 with Node.js 20.19.5 and Chromium 153 through Playwright, after appending the final camera descent.

## Changes

- Added `public/videos/backyard-final.mp4`, copied byte-for-byte from the original `videos/backyard-final.mp4`.
- `scripts/extract-frames.mjs`: appended the fourth source configuration and updated the missing-input message. Extraction settings and all original sequence data remain unchanged.
- `src/main.js`: accepts four sequences, extends scrolling proportionally, preserves the original copy/navigation scroll positions, and preloads all sequence endpoints. The fourth stage now finishes at the ground-level view.
- `src/frame-cache.js`: pins every sequence endpoint within the existing 20-frame cache.
- `src/style.css`: makes only the section height dynamic; all other styling is unchanged.
- `tests/frames.test.mjs` and `tests/browser/experience.spec.js`: cover the fourth source, preservation of original pacing, and the new join under delayed loading and rapid reversals.
- `README.md` and this file: updated asset, scrolling, and verification documentation.
- Generated `public/frames/04-aerial-to-ground/`, updated the ignored manifest/cache, and rebuilt `dist`. Generated frames remain ignored by Git.

Sequence: `backyard-1-2.mp4` → `backyard-2-3.mp4` → `backyard-3-4.mp4` → `backyard-final.mp4`.

## Results

- `npm run frames`: generated 361 WebP frames (91 + 90 + 90 + 90), at 18 FPS and 1440 × 810. The appended sequence occupies global frames 271–360. A subsequent build reused all four sequences.
- Captured SHA-256 hashes of all 271 original WebP frames before editing. Every original frame hash and all three original sequence manifest records are unchanged.
- Captured nine pre-change desktop scroll positions and canvas pixel hashes. After appending, every position produced the identical frame, stage copy, and canvas pixel hash. The original 3420px scroll travel at a 900px viewport is preserved; total travel is now 4560px, inside a 5460px section (606.67vh).
- `npm test`: all 4 checks passed.
- `npm run build`: passed. Generated frames occupy approximately 52 MiB on disk; the full build, including source videos, is approximately 88 MiB.
- `npx playwright test`: all 9 checks passed against Vite development.
- `TEST_BASE_URL=http://127.0.0.1:4173 npx playwright test`: all 9 checks passed against production preview.
- The four-clip forward/reverse pixel test and delayed-loading join test both passed with the unmodified production build mounted at `/landscape-demo/` on a strict static HTTP server.
- No unexpected browser console errors or HTTP failures occurred during normal sequence and join tests. Separate failure tests intentionally return HTTP 404 to verify error messages. No lint command is configured; JavaScript syntax checks also passed.

| Overall scroll | Global frame (zero-based) | Text stage |
| --- | --- | --- |
| 0% | 0 | Concept sketch |
| 10% | 36 | Concept sketch |
| 25% | 90 | Architectural plan |
| 35% | 126 | Architectural plan |
| 50% | 180 | Materials and planting |
| 65% | 234 | Materials and planting |
| 75% | 270 | 3D visualisation — original aerial endpoint |
| 90% | 324 | 3D visualisation — camera descent |
| 100% | 360 | 3D visualisation — ground-level endpoint |

All nine images were distinct, and reverse scrolling returned identical canvas pixel hashes. Additional frame-by-frame checks crossed the new join in both directions. With new-sequence requests delayed by 180ms and rapid direction changes, sampled animation frames showed no blank canvas, loading placeholder, or geometry change. The final picture remained unchanged while idle at completion.

Mobile checks covered 390 × 844 portrait, landscape orientation, no horizontal overflow, and keyboard navigation. Reduced-motion checks selected all four representative frames immediately, including the new ground-level endpoint. Existing tests also passed for live motion-preference changes, Image decoding without createImageBitmap, a device-pixel-ratio cap of 1.5, missing manifest/frame responses, and JavaScript disabled. The retained decoded cache remained at or below 20 frames at sampled positions.

## Limitations

The local FFmpeg distribution lacks libwebp, so extraction used the existing FFmpeg + cwebp fallback. The standard direct-libwebp path was not exercised locally. The largest source video is approximately 17.6 MiB, below GitHub's 100 MiB limit.

Browser verification used desktop Chromium with mobile emulation, not physical iOS/Android devices. GitHub deployment was not executed. Very fast scrolling or a slow connection can temporarily display the closest cached image while the precise requested frame loads, following the existing renderer behaviour.
