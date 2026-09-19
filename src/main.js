import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import './style.css';
import { stages, presentation } from './content.js';
import { FrameCache } from './frame-cache.js';
import { CanvasRenderer } from './canvas-renderer.js';

gsap.registerPlugin(ScrollTrigger);
const $ = id => document.getElementById(id);
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
let renderer, cache, lenis, tween, ticker;
let activeStage = -1;
let copyTransition;
let ready = false;
let lastProgress = 0;
let manifest;
let transformationFraction = 1;
const playhead = { progress: 0 };
const baseURL = new URL(import.meta.env.BASE_URL, document.baseURI);

function setCopy(index) {
  const stage = stages[index];
  $('stage-number').textContent = stage.number;
  $('stage-label').textContent = stage.label;
  $('stage-heading').textContent = stage.heading;
  $('stage-body').textContent = stage.body;
}

function showStage(index, immediate = false) {
  if (index === activeStage) return;
  activeStage = index;
  const stage = stages[index];
  document.querySelectorAll('.stage-button').forEach((button, i) => {
    button.setAttribute('aria-current', i === index ? 'step' : 'false');
    button.classList.toggle('is-complete', i < index);
  });
  $('landscape').setAttribute('aria-label', `Landscape design: ${stage.label}. ${stage.body}`);
  $('stage-announcement').textContent = `Stage ${stage.number} of 04: ${stage.label}`;
  $('experience').dataset.stage = index;
  copyTransition?.kill();
  if (immediate || motion.matches) {
    setCopy(index);
    gsap.set($('copy'), { opacity: 1, y: 0 });
  } else {
    copyTransition = gsap.timeline()
      .to($('copy'), { opacity: 0, y: -8, duration: 0.15, ease: 'power1.out' })
      .call(() => setCopy(index))
      .set($('copy'), { y: 8 })
      .to($('copy'), { opacity: 1, y: 0, duration: 0.28, ease: 'power1.out' });
  }
}

function updateProgress(progress) {
  const direction = progress >= lastProgress ? 1 : -1;
  lastProgress = progress;
  renderer.request(Math.round(progress * (manifest.totalFrames - 1)), direction);
  const transformationProgress = progress / transformationFraction;
  let next = Math.max(0, activeStage);
  // Hysteresis prevents a trackpad hovering near a threshold from flickering the copy.
  while (next < stages.length - 1 && transformationProgress >= stages[next + 1].progress) next++;
  while (next > 0 && transformationProgress < stages[next].progress - 0.012) next--;
  showStage(next);
  updateIndicators(progress);
}

function updateIndicators(progress) {
  $('percent').textContent = String(Math.round(progress * 100)).padStart(3, '0');
  $('scroll-cue').textContent = motion.matches ? presentation.reducedMotionCue : progress < 0.06 * transformationFraction ? `↓  ${presentation.scrollCue}` : progress > 0.97 ? presentation.endCue : presentation.detail;
  document.querySelectorAll('.stage-button').forEach((button, i) => {
    const start = stages[i].progress * transformationFraction;
    const end = stages[i + 1] ? stages[i + 1].progress * transformationFraction : 1;
    const part = Math.max(0, Math.min(1, (progress - start) / (end - start)));
    button.style.setProperty('--stage-progress', part);
  });
}

function navigateStage(index) {
  if (!ready) return;
  if (motion.matches) {
    renderer.request(manifest.stageFrames[index], index >= activeStage ? 1 : -1);
    renderer.draw();
    showStage(index, true);
    updateIndicators(index === stages.length - 1 ? 1 : stages[index].progress * transformationFraction);
  } else {
    const progress = index === stages.length - 1 ? 1 : Math.min(1, stages[index].progress + (index ? 0.006 : 0)) * transformationFraction;
    const target = tween.scrollTrigger.start + (tween.scrollTrigger.end - tween.scrollTrigger.start) * progress;
    lenis.scrollTo(target, { duration: 1.15 });
  }
}

function configureMotion() {
  tween?.scrollTrigger?.kill();
  tween?.kill();
  if (ticker) gsap.ticker.remove(ticker);
  lenis?.destroy();
  lenis = undefined;
  $('experience').classList.toggle('is-reduced', motion.matches);
  if (motion.matches) {
    navigateStage(Math.max(0, activeStage));
    window.scrollTo(0, 0);
  } else {
    lenis = new Lenis({ lerp: 0.12, smoothWheel: true, autoRaf: false });
    lenis.on('scroll', ScrollTrigger.update);
    ticker = time => lenis.raf(time * 1000);
    gsap.ticker.add(ticker);
    gsap.ticker.lagSmoothing(0);
    tween = gsap.fromTo(playhead, { progress: 0 }, {
      progress: 1, ease: 'none', onUpdate: () => updateProgress(playhead.progress),
      scrollTrigger: { trigger: $('experience'), start: 'top top', end: 'bottom bottom', scrub: 0.18, invalidateOnRefresh: true },
    });
  }
  ScrollTrigger.refresh();
}

function fail(error) {
  clearTimeout(window.landscapeStartupTimeout);
  console.error(error);
  if (ready) { $('frame-error').hidden = false; return; }
  $('loading-label').textContent = `The landscape could not load. ${error.message} Check your connection or run npm run frames, then reload.`;
  $('loading-progress').hidden = true;
  $('loading-count').hidden = true;
  if (!$('loading').querySelector('button')) {
    const retry = document.createElement('button');
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => location.reload());
    $('loading').append(retry);
  }
}

async function start() {
  for (const key of ['brand', 'project', 'detail']) $(key).textContent = presentation[key];
  const nav = $('stage-navigation');
  nav.setAttribute('aria-label', presentation.navigationLabel);
  stages.forEach((stage, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stage-button';
    button.setAttribute('aria-label', `${stage.number}: ${stage.label}`);
    const number = document.createElement('span');
    number.className = 'nav-number';
    number.textContent = stage.number;
    const label = document.createElement('span');
    label.textContent = stage.label;
    button.append(number, label);
    button.addEventListener('click', () => navigateStage(index));
    button.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % stages.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + stages.length) % stages.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = stages.length - 1;
      if (next !== undefined) { event.preventDefault(); nav.children[next].focus(); navigateStage(next); }
    });
    nav.append(button);
  });
  const response = await fetch(new URL('frames/manifest.json', baseURL));
  if (!response.ok) throw new Error(`Frame manifest returned HTTP ${response.status}.`);
  manifest = await response.json();
  if (!Number.isInteger(manifest.totalFrames) || manifest.totalFrames < 4 || manifest.sequences?.length !== 4 || manifest.stageFrames?.length !== stages.length) throw new Error('The frame manifest is invalid.');
  // Preserve the original three clips' 380vh scroll travel, then append the descent.
  transformationFraction = manifest.sequences[2].endFrame / (manifest.totalFrames - 1);
  $('experience').style.setProperty('--scroll-height', 100 + 380 / transformationFraction);
  const initialFrames = [...new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, ...manifest.stageFrames, ...manifest.sequences.map(sequence => sequence.endFrame)])];
  const loaded = new Set();
  cache = new FrameCache(manifest, { baseURL, onLoad: index => {
    if (initialFrames.includes(index)) loaded.add(index);
    const progress = Math.round(loaded.size / initialFrames.length * 100);
    $('loading-progress').value = progress;
    $('loading-count').textContent = `${progress}%`;
    renderer?.schedule();
  }, onError: error => { if (ready) fail(error); } });
  cache.setTarget(0);
  await Promise.all(initialFrames.map(index => cache.waitFor(index)));
  $('experience').hidden = false;
  renderer = new CanvasRenderer($('landscape'), cache);
  renderer.canvas.dataset.requestedFrame = '0';
  renderer.draw();
  showStage(0, true);
  ready = true;
  configureMotion();
  clearTimeout(window.landscapeStartupTimeout);
  $('loading').hidden = true;
  document.body.classList.add('is-ready');
  motion.addEventListener('change', configureMotion);
  const resize = () => { renderer.resize(); lenis?.resize(); ScrollTrigger.refresh(); };
  window.addEventListener('orientationchange', resize);
  window.addEventListener('resize', resize);
  $('reload').addEventListener('click', () => location.reload());
}

start().catch(fail);
if (import.meta.hot) import.meta.hot.dispose(() => { cache?.destroy(); renderer?.destroy(); lenis?.destroy(); tween?.scrollTrigger?.kill(); tween?.kill(); if (ticker) gsap.ticker.remove(ticker); });
