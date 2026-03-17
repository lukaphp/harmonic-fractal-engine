/**
 * Generic circular (ring) buffer with O(1) push/get and statistical helpers.
 * Used by AudioBrain for beat detection history and temporal smoothing.
 */
export class CircularBuffer {
  private readonly buf: Float32Array;
  private head: number = 0;
  private filled: boolean = false;
  readonly size: number;

  constructor(size: number, defaultValue = 0) {
    this.size = size;
    this.buf = new Float32Array(size).fill(defaultValue);
  }

  push(value: number): void {
    this.buf[this.head % this.size] = value;
    this.head++;
    if (this.head >= this.size) this.filled = true;
  }

  /** ageInFrames = 0 → most recent, 1 → previous frame, etc. */
  get(ageInFrames = 0): number {
    const idx = ((this.head - 1 - ageInFrames) % this.size + this.size) % this.size;
    return this.buf[idx];
  }

  /** Returns the filled slice (excludes unfilled slots on startup). */
  private activeSlice(): Float32Array {
    if (this.filled) return this.buf;
    return this.buf.slice(0, this.head);
  }

  average(): number {
    const s = this.activeSlice();
    if (s.length === 0) return 0;
    return s.reduce((a, v) => a + v, 0) / s.length;
  }

  variance(): number {
    const s = this.activeSlice();
    if (s.length === 0) return 0;
    const avg = this.average();
    return s.reduce((a, v) => a + (v - avg) ** 2, 0) / s.length;
  }

  max(): number {
    const s = this.activeSlice();
    if (s.length === 0) return 0;
    return s.reduce((m, v) => Math.max(m, v), -Infinity);
  }

  /** Copy the last `n` values into a Float32Array (oldest → newest). */
  last(n: number): Float32Array {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      out[n - 1 - i] = this.get(i);
    }
    return out;
  }
}
