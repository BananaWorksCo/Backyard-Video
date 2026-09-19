import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
const frameCounts = new WeakMap();
const transformationFractions = new WeakMap();

async function ready(page) {
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('canvas')).toHaveAttribute('data-displayed-frame', '0');
  const manifest = await page.evaluate(async () => (await (await fetch(new URL('frames/manifest.json', document.baseURI))).json()));
  frameCounts.set(page, manifest.totalFrames);
  transformationFractions.set(page, manifest.sequences[2].endFrame / (manifest.totalFrames - 1));
}
async function scroll(page, progress) {
  await page.evaluate(progress => {
    const section = document.querySelector('#experience');
    window.scrollTo(0, progress * (section.offsetHeight - innerHeight));
  }, progress);
  await expect.poll(async () => Number(await page.locator('#percent').textContent())).toBe(Math.round((progress + Number.EPSILON) * 100));
  // A rounded percentage can arrive before the scrub tween reaches its exact frame.
  await expect(page.locator('canvas')).toHaveAttribute('data-requested-frame', String(Math.round(progress * (frameCounts.get(page) - 1))));
  await expect.poll(async () => page.locator('canvas').evaluate(el => el.dataset.requestedFrame === el.dataset.displayedFrame)).toBe(true);
}

test('all four animations render intermediate frames forward and backward without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await ready(page);
  const positions = [0, .1, .25, .35, .5, .65, .75, .9, 1];
  const hashes = new Map();
  for (const p of positions) {
    await scroll(page, p);
    // Let the short copy transition complete before checking visible text.
    const originalProgress = p / transformationFractions.get(page);
    const expectedStage = originalProgress >= .9 ? 3 : originalProgress >= .64 ? 2 : originalProgress >= .32 ? 1 : 0;
    await expect(page.locator('#experience')).toHaveAttribute('data-stage', String(expectedStage));
    await expect(page.locator('#stage-number')).toHaveText(`0${expectedStage + 1}`);
    const data = await page.locator('canvas').evaluate(el => el.toDataURL());
    hashes.set(p, createHash('sha256').update(data).digest('hex'));
    expect(Number(await page.locator('canvas').getAttribute('data-cache-size'))).toBeLessThanOrEqual(20);
    console.log(`Progress ${Math.round(p * 100)}%: frame ${await page.locator('canvas').getAttribute('data-displayed-frame')}, stage ${expectedStage + 1}`);
  }
  expect(new Set(hashes.values()).size).toBe(positions.length);
  for (const p of [...positions].reverse()) {
    await scroll(page, p);
    const data = await page.locator('canvas').evaluate(el => el.toDataURL());
    expect(createHash('sha256').update(data).digest('hex')).toBe(hashes.get(p));
  }
  expect(errors).toEqual([]);
  await expect(page.locator('#copy')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'test-results/desktop-opening.png' });
  await scroll(page, 1);
  await expect(page.locator('#stage-number')).toHaveText('04');
  await expect(page.locator('#copy')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'test-results/desktop-finished.png' });
});

test('mobile contains the complete landscape, resizes, and supports keyboard navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await scroll(page, .5 * transformationFractions.get(page));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.locator('#stage-number')).toHaveText('02');
  await expect(page.locator('#copy')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'test-results/mobile.png' });
  await page.locator('.stage-button').first().focus();
  await page.keyboard.press('End');
  await expect(page.locator('.stage-button').last()).toBeFocused();
  await expect(page.locator('#percent')).toHaveText('100');
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => page.locator('canvas').evaluate(el => el.width)).toBe(844);
  await expect(page.locator('#copy')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'test-results/mobile-landscape.png' });
});

test('reduced motion selects all four representative frames immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  const manifest = await page.evaluate(async () => (await fetch(new URL('frames/manifest.json', document.baseURI))).json());
  for (let i = 0; i < 4; i++) {
    await page.locator('.stage-button').nth(i).click();
    await expect(page.locator('canvas')).toHaveAttribute('data-displayed-frame', String(manifest.stageFrames[i]));
    await expect(page.locator('#stage-number')).toHaveText(`0${i + 1}`);
  }
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(900);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('#experience')).not.toHaveClass(/is-reduced/);
  await scroll(page, .5);
});

test('Image decoder fallback and capped device pixel ratio work', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, deviceScaleFactor: 3, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => { delete window.createImageBitmap; });
  await ready(page);
  expect(await page.locator('canvas').evaluate(el => el.width)).toBe(585);
  await scroll(page, .65);
  await context.close();
});

test('missing manifest displays a clear error', async ({ page }) => {
  await page.route('**/frames/manifest.json', route => route.fulfill({ status: 404, body: 'Missing' }));
  await page.goto('./');
  await expect(page.locator('#loading-label')).toContainText('could not load');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('missing intermediate frame preserves a picture and offers reload', async ({ page }) => {
  await ready(page);
  await page.route('**/frames/**/frame-0040.webp', route => route.fulfill({ status: 404, body: 'Missing' }));
  await scroll(page, 38 / (frameCounts.get(page) - 1));
  await expect(page.locator('#frame-error')).toBeVisible();
  expect(Number(await page.locator('canvas').getAttribute('data-displayed-frame'))).toBeGreaterThanOrEqual(0);
});

test('disabled JavaScript has a readable fallback', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'This landscape needs JavaScript.' })).toBeVisible();
  await expect(page.locator('#loading')).toBeHidden();
  await context.close();
});

test('original frame pacing, copy thresholds, and earlier navigation targets are preserved', async ({ page }) => {
  await ready(page);
  const originalEndFrame = Math.round((frameCounts.get(page) - 1) * transformationFractions.get(page));
  const travel = await page.evaluate(() => innerHeight * 3.8);
  for (const originalProgress of [0, .1, .25, .35, .5, .65, .75, .9, 1]) {
    await page.evaluate(y => scrollTo(0, y), travel * originalProgress);
    await expect(page.locator('canvas')).toHaveAttribute('data-requested-frame', String(Math.round(originalProgress * originalEndFrame)));
    await expect.poll(() => page.locator('canvas').evaluate(el => el.dataset.requestedFrame === el.dataset.displayedFrame)).toBe(true);
    const stage = originalProgress >= .9 ? 4 : originalProgress >= .64 ? 3 : originalProgress >= .32 ? 2 : 1;
    await expect(page.locator('#stage-number')).toHaveText(`0${stage}`);
  }
  // Forward threshold and backward hysteresis retain their original scroll positions.
  for (const [progress, stage] of [[.30, '01'], [.33, '02'], [.315, '02'], [.30, '01']]) {
    await scroll(page, progress * transformationFractions.get(page));
    await expect(page.locator('#stage-number')).toHaveText(stage);
  }
  for (const [index, originalTarget] of [[0, 0], [1, .326], [2, .646]]) {
    await page.locator('.stage-button').nth(index).click();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(Math.round(travel * originalTarget));
  }
  await expect(page.locator('.stage-button')).toHaveCount(4);
});

test('the appended join remains filled during delayed loads and rapid reversals, and holds the final frame', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await ready(page);
  const lastFrame = frameCounts.get(page) - 1;
  const join = Math.round(lastFrame * transformationFractions.get(page));
  await page.route('**/frames/04-aerial-to-ground/*.webp', async route => {
    await new Promise(resolve => setTimeout(resolve, 180));
    await route.continue();
  });
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const initial = canvas.getBoundingClientRect();
    window.joinCheck = { running: true, samples: 0, failures: [] };
    function sample() {
      const rect = canvas.getBoundingClientRect();
      const context = canvas.getContext('2d');
      const points = [.3, .4, .5, .6, .7].map(x => [...context.getImageData(Math.round(canvas.width * x), Math.round(canvas.height * .5), 1, 1).data]);
      const blank = points.every(([r, g, b]) => (r === 17 && g === 21 && b === 18) || (r === 0 && g === 0 && b === 0));
      if (blank || canvas.dataset.displayedFrame === undefined) window.joinCheck.failures.push('blank frame');
      if (rect.width !== initial.width || rect.height !== initial.height || rect.top !== initial.top) window.joinCheck.failures.push('layout shift');
      if (!document.querySelector('#loading').hidden) window.joinCheck.failures.push('loading placeholder');
      window.joinCheck.samples++;
      if (window.joinCheck.running) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  for (const frame of [join - 2, join - 1, join, join + 1, join + 2, join + 10, lastFrame - 20, lastFrame]) {
    await scroll(page, frame / lastFrame);
  }
  await page.evaluate(async () => {
    const travel = document.querySelector('#experience').offsetHeight - innerHeight;
    for (const progress of [.74, .80, .72, .95, .76, 1]) {
      scrollTo(0, travel * progress);
      await new Promise(resolve => setTimeout(resolve, 40));
    }
  });
  await expect(page.locator('canvas')).toHaveAttribute('data-displayed-frame', String(lastFrame));
  const finalImage = await page.locator('canvas').evaluate(el => el.toDataURL());
  await page.waitForTimeout(700);
  expect(await page.locator('canvas').evaluate(el => el.toDataURL())).toBe(finalImage);
  for (const frame of [join + 10, join + 2, join + 1, join, join - 1, join - 2]) await scroll(page, frame / lastFrame);
  const check = await page.evaluate(() => { window.joinCheck.running = false; return window.joinCheck; });
  expect(check.samples).toBeGreaterThan(20);
  expect(check.failures).toEqual([]);
  await page.unrouteAll({ behavior: 'wait' });
  expect(errors).toEqual([]);
});
