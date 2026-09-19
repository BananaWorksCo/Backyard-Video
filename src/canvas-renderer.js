export function containRect(sourceWidth, sourceHeight, width, height) {
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  return { x: (width - drawWidth) / 2, y: (height - drawHeight) / 2, width: drawWidth, height: drawHeight };
}

export class CanvasRenderer {
  constructor(canvas, cache) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: false });
    if (!this.context) throw new Error('Your browser could not initialise the canvas. Please try a current browser.');
    this.cache = cache;
    this.requested = 0;
    this.displayed = -1;
    this.dirty = true;
    this.raf = 0;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.dirty = true;
      this.schedule();
    }
  }

  request(index, direction) {
    if (index !== this.requested || !this.cache.frames.size) {
      this.requested = index;
      this.canvas.dataset.requestedFrame = index;
      this.cache.setTarget(index, direction);
      this.schedule();
    }
  }

  schedule() {
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }

  draw() {
    const exact = this.cache.get(this.requested);
    const frame = exact ? { index: this.requested, image: exact } : this.cache.closest(this.requested);
    if (!frame || (!this.dirty && this.displayed === frame.index)) return;
    const { width, height } = this.canvas;
    const bounds = containRect(frame.image.width, frame.image.height, width, height);
    this.context.fillStyle = '#111512';
    this.context.fillRect(0, 0, width, height);
    this.context.drawImage(frame.image, bounds.x, bounds.y, bounds.width, bounds.height);
    this.displayed = frame.index;
    this.canvas.dataset.displayedFrame = frame.index;
    this.canvas.dataset.cacheSize = this.cache.frames.size;
    this.dirty = false;
  }

  destroy() { this.observer.disconnect(); cancelAnimationFrame(this.raf); }
}
