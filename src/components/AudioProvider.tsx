import React, {
  useEffect,
  useState,
  useContext,
  createContext,
  useRef,
  useCallback,
} from 'react';

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

// ─── Band values exposed to consumers ───────────────────────────────────────

export interface SmoothedBands {
  // Raw normalized [0.0 – 1.0]
  bass: number;
  mid: number;
  high: number;
  // Lerp-smoothed [0.0 – 1.0] — use these for shader uniforms
  smoothBass: number;
  smoothMid: number;
  smoothHigh: number;
}

interface AudioContextValue {
  analyzer: AnalyserNode | null;
  bands: SmoothedBands;
  smoothingFactor: number;
  setSmoothingFactor: (v: number) => void;
  isPlaying: boolean;
  togglePlay: () => void;
  isReady: boolean;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_BANDS: SmoothedBands = {
  bass: 0, mid: 0, high: 0,
  smoothBass: 0, smoothMid: 0, smoothHigh: 0,
};

const DEFAULT_SMOOTHING = 0.12; // α for Lerp — configurable via Leva (Phase 3)

// ─── Context ─────────────────────────────────────────────────────────────────

const AudioCtx = createContext<AudioContextValue | null>(null);

export const useAudioAnalyzer = () => useContext(AudioCtx)?.analyzer || null;
export const useAudioBands    = () => useContext(AudioCtx)?.bands ?? DEFAULT_BANDS;
export const useAudioState    = () => useContext(AudioCtx);

// ─── Provider ────────────────────────────────────────────────────────────────

interface AudioProviderProps {
  audioUrl: string | null;
  children: React.ReactNode;
}

const AudioProvider: React.FC<AudioProviderProps> = ({ audioUrl, children }) => {
  const [analyzer, setAnalyzer]           = useState<AnalyserNode | null>(null);
  const [isPlaying, setIsPlaying]         = useState(false);
  const [isReady, setIsReady]             = useState(false);
  const [smoothingFactor, setSmoothingFactor] = useState(DEFAULT_SMOOTHING);

  // Exposed band values — updated via requestAnimationFrame, not useState
  // We use a ref + forceUpdate pattern to avoid re-rendering the whole tree every frame
  const bandsRef  = useRef<SmoothedBands>({ ...DEFAULT_BANDS });
  const [bands, setBands] = useState<SmoothedBands>({ ...DEFAULT_BANDS });

  // Audio API refs
  const audioContextRef  = useRef<AudioContext | null>(null);
  const audioElementRef  = useRef<HTMLAudioElement | null>(null);
  const analyzerRef      = useRef<AnalyserNode | null>(null);
  const dataArrayRef     = useRef<Uint8Array<ArrayBufferLike> | null>(null);
  const rafRef           = useRef<number | null>(null);
  const smoothRef        = useRef({ bass: 0, mid: 0, high: 0 });
  const alphaRef         = useRef(smoothingFactor);

  // Keep alpha ref in sync with state
  useEffect(() => { alphaRef.current = smoothingFactor; }, [smoothingFactor]);

  // ── Lerp update loop ──────────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    const tick = () => {
      const az = analyzerRef.current;
      const da = dataArrayRef.current;
      if (az && da) {
        az.getByteFrequencyData(da as unknown as Uint8Array<ArrayBuffer>);

        // ── Raw band averages ──
        let bassSum = 0, midSum = 0, highSum = 0;
        for (let i = 0; i < 11; i++)   bassSum += da[i];
        for (let i = 11; i < 101; i++) midSum  += da[i];
        for (let i = 101; i < 256; i++) highSum += da[i];

        const rawBass = (bassSum / 11)   / 255;
        const rawMid  = (midSum  / 90)   / 255;
        const rawHigh = (highSum / 155)  / 255;

        // ── Lerp smoothing: V_final = V_prev + (V_target - V_prev) * α ──
        const α = alphaRef.current;
        smoothRef.current.bass += (rawBass - smoothRef.current.bass) * α;
        smoothRef.current.mid  += (rawMid  - smoothRef.current.mid)  * α;
        smoothRef.current.high += (rawHigh - smoothRef.current.high) * α;

        const next: SmoothedBands = {
          bass:       rawBass,
          mid:        rawMid,
          high:       rawHigh,
          smoothBass: smoothRef.current.bass,
          smoothMid:  smoothRef.current.mid,
          smoothHigh: smoothRef.current.high,
        };
        bandsRef.current = next;
        setBands({ ...next }); // shallow copy triggers re-render only when needed
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ── Audio setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!audioUrl) {
      setIsReady(false);
      stopLoop();
      return;
    }

    const setup = async () => {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      const element = new Audio(audioUrl);
      element.loop  = true;
      audioElementRef.current = element;

      const az = ctx.createAnalyser();
      az.fftSize               = 512;
      az.smoothingTimeConstant = 0.0; // We do our own smoothing via Lerp
      analyzerRef.current = az;
      dataArrayRef.current = new Uint8Array(az.frequencyBinCount) as unknown as Uint8Array<ArrayBufferLike>;

      const src = ctx.createMediaElementSource(element);
      src.connect(az);
      az.connect(ctx.destination);

      setAnalyzer(az);
      setIsReady(true);
      setIsPlaying(false);
      startLoop();
    };

    setup();

    return () => {
      stopLoop();
      audioElementRef.current?.pause();
      audioElementRef.current?.removeAttribute('src');
      audioElementRef.current = null;
      audioContextRef.current?.close();
      audioContextRef.current = null;
      analyzerRef.current = null;
      dataArrayRef.current = null;
      smoothRef.current = { bass: 0, mid: 0, high: 0 };
      setBands({ ...DEFAULT_BANDS });
      setAnalyzer(null);
      setIsReady(false);
      setIsPlaying(false);
    };
  }, [audioUrl, startLoop, stopLoop]);

  // ── Play/Pause ────────────────────────────────────────────────────────────
  const togglePlay = async () => {
    if (!audioContextRef.current || !audioElementRef.current) return;
    try {
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      if (isPlaying) {
        audioElementRef.current.pause();
        setIsPlaying(false);
      } else {
        await audioElementRef.current.play();
        setIsPlaying(true);
      }
    } catch (e) {
      console.error('Audio playback failed:', e);
    }
  };

  return (
    <AudioCtx.Provider value={{
      analyzer,
      bands,
      smoothingFactor,
      setSmoothingFactor,
      isPlaying,
      togglePlay,
      isReady,
    }}>
      {children}
    </AudioCtx.Provider>
  );
};

export default AudioProvider;
