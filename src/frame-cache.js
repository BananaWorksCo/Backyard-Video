export class FrameCache {
  constructor(manifest, { onLoad, onError, baseURL, maxSize = 20 }) {
    Object.assign(this, { manifest, onLoad, onError, baseURL, maxSize });
    this.frames = new Map();
    this.pending = new Map();
    this.failed = new Set();
    this.waiters = new Map();
    this.queue = [];
    this.pinned = new Set([...manifest.stageFrames, ...manifest.sequences.map(sequence => sequence.endFrame)]);
    this.wanted = new Set();
    this.disposed = false;
  }

  url(index) {
    const sequence = this.manifest.sequences.find(item => index >= item.startFrame && index <= item.endFrame);
    const file = `frame-${String(index - sequence.startFrame + 1).padStart(4, '0')}.webp`;
    return new URL(`${sequence.directory}/${file}`, this.baseURL).href;
  }

  get(index) {
    const frame = this.frames.get(index);
    if (frame) { this.frames.delete(index); this.frames.set(index, frame); }
    return frame;
  }

  closest(index) {
    let nearest;
    for (const key of this.frames.keys()) {
      if (nearest === undefined || Math.abs(key - index) < Math.abs(nearest - index)) nearest = key;
    }
    return nearest === undefined ? null : { index: nearest, image: this.get(nearest) };
  }

  setTarget(index, direction = 1) {
    const priority = [index];
    for (let offset = 1; offset <= 8; offset++) priority.push(index + offset * direction, index - offset * direction);
    const valid = priority.filter(frame => frame >= 0 && frame < this.manifest.totalFrames);
    // Keep the representative stages and every sequence endpoint ready at joins.
    const nearby = valid.filter(frame => !this.pinned.has(frame)).slice(0, this.maxSize - this.pinned.size);
    this.wanted = new Set([...this.pinned, ...nearby]);
    this.queue = [...new Set([index, ...nearby, ...this.pinned])].filter(frame => !this.frames.has(frame) && !this.pending.has(frame) && !this.failed.has(frame));
    for (const [frame, controller] of this.pending) if (!this.wanted.has(frame)) controller.abort();
    this.pump();
  }

  waitFor(index) {
    if (this.frames.has(index)) return Promise.resolve();
    if (this.failed.has(index)) return Promise.reject(new Error(`Could not load frame ${index + 1}.`));
    return new Promise((resolve, reject) => {
      const list = this.waiters.get(index) || [];
      list.push({ resolve, reject });
      this.waiters.set(index, list);
    });
  }

  pump() {
    while (!this.disposed && this.pending.size < 3 && this.queue.length) {
      const index = this.queue.shift();
      const controller = new AbortController();
      this.pending.set(index, controller);
      this.load(index, controller);
    }
  }

  async load(index, controller) {
    try {
      const response = await fetch(this.url(index), { signal: controller.signal });
      if (!response.ok) throw new Error(`Frame ${index + 1} returned HTTP ${response.status}.`);
      const blob = await response.blob();
      let image;
      if ('createImageBitmap' in window) {
        try { image = await createImageBitmap(blob); } catch { /* Fall back for unsupported bitmap decoders. */ }
      }
      if (!image) {
        const objectURL = URL.createObjectURL(blob);
        try { image = new Image(); image.src = objectURL; await image.decode(); }
        finally { URL.revokeObjectURL(objectURL); }
      }
      if (this.disposed || !this.wanted.has(index)) { image.close?.(); return; }
      while (this.frames.size >= this.maxSize) {
        const keys = [...this.frames.keys()];
        const victim = keys.find(key => !this.wanted.has(key)) ?? keys.find(key => !this.pinned.has(key));
        this.frames.get(victim)?.close?.();
        this.frames.delete(victim);
      }
      this.frames.set(index, image);
      for (const waiter of this.waiters.get(index) || []) waiter.resolve();
      this.waiters.delete(index);
      this.onLoad(index);
    } catch (error) {
      if (error.name !== 'AbortError') {
        this.failed.add(index);
        for (const waiter of this.waiters.get(index) || []) waiter.reject(error);
        this.waiters.delete(index);
        this.onError(error);
      }
    } finally {
      this.pending.delete(index);
      // A rapidly reversed scroll may want a frame whose aborted request just finished.
      if (!this.disposed && this.wanted.has(index) && !this.frames.has(index) && !this.failed.has(index) && !this.queue.includes(index)) this.queue.unshift(index);
      this.pump();
    }
  }

  destroy() {
    this.disposed = true;
    for (const controller of this.pending.values()) controller.abort();
    for (const frame of this.frames.values()) frame.close?.();
    this.frames.clear();
  }
}
