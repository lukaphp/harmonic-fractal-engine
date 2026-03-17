import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { CircularBuffer } from '../utils/CircularBuffer';

declare global {
  interface Window { webkitAudioContext: typeof AudioContext; }
}

// ─── Descriptor interface ────────────────────────────────────────────────────

export interface AudioDescriptors {
  // Qualitative descriptors (Fase 1)
  centroid:   number;       // [0–1] spectral brightness
  rolloff:    number;       // [0–1] harmonicity vs noise
  rms:        number;       // [0–1] perceived loudness (auto-normalized)
  beatPulse:  number;       // [0–1] exponential decay post-beat
  chroma:     Float32Array; // [12] pitch-class energy (C…B)

  // Legacy smoothed bands — backward compat with FractalMesh
  smoothBass: number;
  smoothMid:  number;
  smoothHigh: number;

  // Playback state
  isPlaying: boolean;
  isReady:   boolean;
  togglePlay: () => void;
  setSmoothingFactor: (v: number) => void;
  smoothingFactor: number;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_DESCRIPTORS: AudioDescriptors = {
  centroid: 0, rolloff: 0, rms: 0, beatPulse: 0,
  chroma: new Float32Array(12),
  smoothBass: 0, smoothMid: 0, smoothHigh: 0,
  isPlaying: false, isReady: false,
  togglePlay: () => {},
  setSmoothingFactor: () => {},
  smoothingFactor: 0.12,
};

// ─── Context ─────────────────────────────────────────────────────────────────

const BrainCtx = createContext<AudioDescriptors>(DEFAULT_DESCRIPTORS);
export const useAudioBrain  = () => useContext(BrainCtx);
export const useAudioBands  = () => {
  const d = useContext(BrainCtx);
  return { smoothBass: d.smoothBass, smoothMid: d.smoothMid, smoothHigh: d.smoothHigh };
};

// ─── Beat Detection constants ─────────────────────────────────────────────────

const BEAT_HISTORY  = 43;   // ~1s @ 43fps
const BEAT_MULT     = 1.5;  // adaptive threshold multiplier
const BEAT_DECAY    = 0.88; // per-frame exponential decay (τ ≈ 120ms @ 60fps)
const BEAT_COOLDOWN = 8;    // minimum frames between beats

// ─── Auto-normalize constants ─────────────────────────────────────────────────

const NORM_HISTORY  = 300;  // ~5s @ 60fps
const NORM_FLOOR    = 0.01; // don't normalize near-silence

// ─── Provider ────────────────────────────────────────────────────────────────

interface AudioBrainProps {
  audioUrl: string | null;
  children: React.ReactNode;
}

const AudioBrain: React.FC<AudioBrainProps> = ({ audioUrl, children }) => {
  const [descriptors, setDescriptors] = useState<AudioDescriptors>(DEFAULT_DESCRIPTORS);
  const [smoothingFactor, setSmoothingFactor] = useState(0.12);

  // Audio API refs
  const ctxRef        = useRef<AudioContext | null>(null);
  const elemRef       = useRef<HTMLAudioElement | null>(null);
  const azRef         = useRef<AnalyserNode | null>(null);
  const dataRef       = useRef<Uint8Array | null>(null);
  const rafRef        = useRef<number | null>(null);
  const isPlayingRef  = useRef(false);
  const alphaRef      = useRef(smoothingFactor);

  useEffect(() => { alphaRef.current = smoothingFactor; }, [smoothingFactor]);

  // Smoothed refs (avoid React re-renders per frame)
  const smooth        = useRef({ bass: 0, mid: 0, high: 0, centroid: 0, rolloff: 0, rms: 0 });
  const beatPulseRef  = useRef(0);
  const beatCooldown  = useRef(0);
  const chromaRef     = useRef(new Float32Array(12));

  // Circular buffers
  const bassHistory   = useRef(new CircularBuffer(BEAT_HISTORY, 0));
  const normHistory   = useRef(new CircularBuffer(NORM_HISTORY, 0));

  // ── Descriptor computation (called every RAF frame) ───────────────────────
  const computeFrame = useCallback(() => {
    const az = azRef.current;
    const da = dataRef.current;
    const ctx = ctxRef.current;
    if (!az || !da || !ctx) return;

    az.getByteFrequencyData(da as unknown as Uint8Array<ArrayBuffer>);

    const N = da.length;
    const sampleRate = ctx.sampleRate;
    const fftSize = az.fftSize;

    // ── 1. Band averages (legacy smoothed) ────────────────────────────────
    let bassSum = 0, midSum = 0, highSum = 0;
    for (let i = 0;   i < 11;  i++) bassSum += da[i];
    for (let i = 11;  i < 101; i++) midSum  += da[i];
    for (let i = 101; i < 256; i++) highSum += da[i];
    const rawBass = (bassSum / 11)  / 255;
    const rawMid  = (midSum  / 90)  / 255;
    const rawHigh = (highSum / 155) / 255;
    const α = alphaRef.current;
    smooth.current.bass += (rawBass - smooth.current.bass) * α;
    smooth.current.mid  += (rawMid  - smooth.current.mid)  * α;
    smooth.current.high += (rawHigh - smooth.current.high) * α;

    // ── 2. Spectral Centroid ───────────────────────────────────────────────
    let cNum = 0, cDen = 0;
    for (let k = 0; k < N; k++) {
      const f = (k * sampleRate) / fftSize;
      cNum += f * da[k];
      cDen += da[k];
    }
    const rawCentroid = cDen > 0 ? (cNum / cDen) / (sampleRate / 2) : 0;
    smooth.current.centroid += (rawCentroid - smooth.current.centroid) * 0.08;

    // ── 3. Spectral Rolloff (85% energy threshold) ────────────────────────
    const total85 = cDen * 0.85;
    let cumsum = 0, rolloffBin = 0;
    for (let k = 0; k < N; k++) {
      cumsum += da[k];
      if (cumsum >= total85) { rolloffBin = k; break; }
    }
    const rawRolloff = rolloffBin / N;
    smooth.current.rolloff += (rawRolloff - smooth.current.rolloff) * 0.08;

    // ── 4. RMS + Auto-Normalize ────────────────────────────────────────────
    let rmsSum = 0;
    for (let k = 0; k < N; k++) rmsSum += da[k] * da[k];
    const rawRms = Math.sqrt(rmsSum / N) / 255;
    normHistory.current.push(rawRms);
    const peak = normHistory.current.max();
    const normalizedRms = peak > NORM_FLOOR ? Math.min(rawRms / peak, 1.0) : rawRms;
    smooth.current.rms += (normalizedRms - smooth.current.rms) * 0.15;

    // ── 5. Beat Detection (adaptive threshold on bass energy) ─────────────
    bassHistory.current.push(rawBass);
    if (beatCooldown.current > 0) {
      beatCooldown.current--;
    } else {
      const avg = bassHistory.current.average();
      const variance = bassHistory.current.variance();
      const threshold = avg + BEAT_MULT * Math.sqrt(variance);
      if (rawBass > threshold && rawBass > 0.05) {
        beatPulseRef.current = 1.0; // spike
        beatCooldown.current = BEAT_COOLDOWN;
      }
    }
    beatPulseRef.current *= BEAT_DECAY; // exponential decay every frame

    // ── 6. Chroma (CQT approximation via FFT bin grouping) ────────────────
    const chroma = chromaRef.current;
    chroma.fill(0);
    for (let k = 1; k < N; k++) {
      const freq = (k * sampleRate) / fftSize;
      if (freq < 27.5 || freq > 14080) continue; // A0–A9 piano range
      const midi = Math.round(12 * Math.log2(freq / 440) + 69);
      const pc = ((midi % 12) + 12) % 12;
      chroma[pc] += da[k] / 255;
    }
    // Normalize chroma to [0, 1]
    let maxC = 0;
    for (let i = 0; i < 12; i++) if (chroma[i] > maxC) maxC = chroma[i];
    if (maxC > 0) {
      for (let i = 0; i < 12; i++) chroma[i] /= maxC;
    }
    // Lerp toward new chroma slowly (harmony is stable)
    // chroma already updated in-place; expose directly

    // ── 7. Publish state ──────────────────────────────────────────────────
    setDescriptors(prev => ({
      ...prev,
      centroid:   smooth.current.centroid,
      rolloff:    smooth.current.rolloff,
      rms:        smooth.current.rms,
      beatPulse:  beatPulseRef.current,
      chroma:     new Float32Array(chroma), // shallow copy for React equality check
      smoothBass: smooth.current.bass,
      smoothMid:  smooth.current.mid,
      smoothHigh: smooth.current.high,
    }));
  }, []);

  // ── RAF loop ──────────────────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    const tick = () => {
      computeFrame();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [computeFrame]);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ── Audio setup / teardown ─────────────────────────────────────────────────
  useEffect(() => {
    if (!audioUrl) {
      setDescriptors(d => ({ ...d, isReady: false }));
      return;
    }

    const setup = async () => {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtxClass();
      ctxRef.current = ctx;

      const elem = new Audio(audioUrl);
      elem.loop = true;
      elemRef.current = elem;

      const az = ctx.createAnalyser();
      az.fftSize = 2048;             // higher resolution for centroid/rolloff
      az.smoothingTimeConstant = 0;  // we lerp manually
      azRef.current = az;
      dataRef.current = new Uint8Array(az.frequencyBinCount);

      ctx.createMediaElementSource(elem).connect(az);
      az.connect(ctx.destination);

      setDescriptors(d => ({ ...d, isReady: true, isPlaying: false }));
      startLoop();
    };

    setup();

    return () => {
      stopLoop();
      elemRef.current?.pause();
      elemRef.current?.removeAttribute('src');
      elemRef.current = null;
      ctxRef.current?.close();
      ctxRef.current = null;
      azRef.current = null;
      dataRef.current = null;
      smooth.current = { bass: 0, mid: 0, high: 0, centroid: 0, rolloff: 0, rms: 0 };
      beatPulseRef.current = 0;
      chromaRef.current.fill(0);
      normHistory.current = new CircularBuffer(NORM_HISTORY, 0);
      bassHistory.current = new CircularBuffer(BEAT_HISTORY, 0);
      setDescriptors({ ...DEFAULT_DESCRIPTORS });
    };
  }, [audioUrl, startLoop, stopLoop]);

  // ── Play/Pause ────────────────────────────────────────────────────────────
  const togglePlay = useCallback(async () => {
    const ctx = ctxRef.current;
    const elem = elemRef.current;
    if (!ctx || !elem) return;
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      if (isPlayingRef.current) {
        elem.pause();
        isPlayingRef.current = false;
        setDescriptors(d => ({ ...d, isPlaying: false }));
      } else {
        await elem.play();
        isPlayingRef.current = true;
        setDescriptors(d => ({ ...d, isPlaying: true }));
      }
    } catch (e) {
      console.error('Audio playback failed:', e);
    }
  }, []);

  // ── Inject stable callbacks into descriptors ──────────────────────────────
  useEffect(() => {
    setDescriptors(d => ({
      ...d,
      togglePlay,
      setSmoothingFactor,
      smoothingFactor,
    }));
  }, [togglePlay, smoothingFactor]);

  return <BrainCtx.Provider value={descriptors}>{children}</BrainCtx.Provider>;
};

export default AudioBrain;
