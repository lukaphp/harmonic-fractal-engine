import { ChromaTheme } from '../data/chromaColors';

export interface HarmonicPreset {
  name: string;
  emoji: string;
  // Sensitivity
  bassSensitivity: number;
  midSensitivity:  number;
  highSensitivity: number;
  smoothingFactor: number;
  // Fractal shape
  power:           number;  // Mandelbulb exponent
  beatAmplitude:   number;  // how much a beat spikes the exponent [0–4]
  fractalMode:     'mandelbulb' | 'menger';
  // Color
  chromaTheme:     ChromaTheme;
}

export const PRESETS: HarmonicPreset[] = [
  {
    name: 'Nebulosa Pulsante', emoji: '🌌',
    bassSensitivity: 2.0, midSensitivity: 0.8, highSensitivity: 1.2,
    smoothingFactor: 0.06, power: 8.0, beatAmplitude: 1.5,
    fractalMode: 'mandelbulb', chromaTheme: 'scriabin',
  },
  {
    name: 'Cristallo Rigido', emoji: '💎',
    bassSensitivity: 0.5, midSensitivity: 2.5, highSensitivity: 2.0,
    smoothingFactor: 0.45, power: 10.0, beatAmplitude: 2.5,
    fractalMode: 'mandelbulb', chromaTheme: 'temperature',
  },
  {
    name: 'Lava Organica', emoji: '🌋',
    bassSensitivity: 1.5, midSensitivity: 1.0, highSensitivity: 0.3,
    smoothingFactor: 0.04, power: 6.0, beatAmplitude: 1.0,
    fractalMode: 'menger', chromaTheme: 'temperature',
  },
  {
    name: 'Tempesta Elettrica', emoji: '⚡',
    bassSensitivity: 3.0, midSensitivity: 3.0, highSensitivity: 3.0,
    smoothingFactor: 0.90, power: 12.0, beatAmplitude: 4.0,
    fractalMode: 'menger', chromaTheme: 'rainbow',
  },
  {
    name: 'Meditazione', emoji: '🧘',
    bassSensitivity: 0.3, midSensitivity: 0.3, highSensitivity: 0.5,
    smoothingFactor: 0.02, power: 7.0, beatAmplitude: 0.3,
    fractalMode: 'mandelbulb', chromaTheme: 'monochrome',
  },
];

export const loadPresetsFromStorage = (): HarmonicPreset[] => {
  try {
    const saved = localStorage.getItem('harmonicPresets');
    if (saved) return [...PRESETS, ...JSON.parse(saved)];
  } catch (_) {}
  return [...PRESETS];
};

export const saveCustomPreset = (preset: HarmonicPreset) => {
  try {
    const saved = JSON.parse(localStorage.getItem('harmonicPresets') || '[]');
    saved.push(preset);
    localStorage.setItem('harmonicPresets', JSON.stringify(saved));
  } catch (_) {}
};
