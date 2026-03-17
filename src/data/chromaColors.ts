/**
 * Chroma theme color lookup tables.
 * Each theme maps 12 chromatic pitch classes (C, C#, D … B) → RGB color.
 *
 * Used by FractalMesh to populate the uChromaColors[12] uniform.
 */

export type ChromaTheme = 'scriabin' | 'temperature' | 'rainbow' | 'monochrome';

/** [r, g, b] tuples in [0.0–1.0] range — index = pitch class (0 = C, 11 = B) */
const THEMES: Record<ChromaTheme, [number, number, number][]> = {
  /**
   * Scriabin synesthetic mapping — based on Scriabin's "clavier à lumières".
   * Warm keys (G, D) → warm light; dissonant intervals → contrasting hues.
   */
  scriabin: [
    [1.00, 1.00, 1.00], // C     — White
    [0.60, 0.00, 0.80], // C#/Db — Violet
    [1.00, 0.95, 0.00], // D     — Yellow
    [0.55, 0.27, 0.07], // D#/Eb — Dark orange
    [0.53, 0.81, 0.98], // E     — Ice blue
    [0.80, 0.00, 0.05], // F     — Deep red
    [0.00, 0.80, 0.20], // F#/Gb — Bright green
    [1.00, 0.55, 0.00], // G     — Orange
    [0.80, 0.20, 0.80], // G#/Ab — Violet-pink
    [0.90, 0.10, 0.10], // A     — Red
    [1.00, 0.85, 0.00], // A#/Bb — Golden yellow
    [0.53, 0.81, 0.98], // B     — Sky blue
  ],

  /**
   * Temperature mapping — perceptually monotonic:
   * cold frequencies (low pitches) → blue; warm (high) → red/orange.
   */
  temperature: [
    [0.00, 0.10, 0.90], // C     — Deep blue
    [0.00, 0.40, 0.95], // C#/Db — Blue
    [0.00, 0.75, 0.85], // D     — Cyan
    [0.00, 0.85, 0.55], // D#/Eb — Teal
    [0.20, 0.90, 0.20], // E     — Green
    [0.70, 0.95, 0.00], // F     — Yellow-green
    [1.00, 0.85, 0.00], // F#/Gb — Yellow
    [1.00, 0.65, 0.00], // G     — Amber
    [1.00, 0.40, 0.00], // G#/Ab — Orange
    [1.00, 0.15, 0.00], // A     — Red-orange
    [0.90, 0.00, 0.10], // A#/Bb — Red
    [0.70, 0.00, 0.30], // B     — Deep red
  ],

  /**
   * Rainbow — simple hue rotation across 12 semitones.
   */
  rainbow: [
    [1.00, 0.20, 0.20], // C
    [1.00, 0.50, 0.10], // C#
    [1.00, 0.85, 0.00], // D
    [0.70, 1.00, 0.00], // D#
    [0.20, 1.00, 0.20], // E
    [0.00, 1.00, 0.70], // F
    [0.00, 0.80, 1.00], // F#
    [0.00, 0.40, 1.00], // G
    [0.30, 0.00, 1.00], // G#
    [0.70, 0.00, 1.00], // A
    [1.00, 0.00, 0.70], // A#
    [1.00, 0.00, 0.30], // B
  ],

  /**
   * Monochrome — all notes produce shades of blue-violet.
   * Energy level modulates brightness; hue stays constant.
   */
  monochrome: [
    [0.30, 0.30, 0.80], // C
    [0.32, 0.32, 0.82], // C#
    [0.34, 0.34, 0.84], // D
    [0.36, 0.36, 0.86], // D#
    [0.38, 0.38, 0.88], // E
    [0.40, 0.40, 0.90], // F
    [0.42, 0.42, 0.92], // F#
    [0.44, 0.44, 0.93], // G
    [0.46, 0.46, 0.94], // G#
    [0.48, 0.48, 0.95], // A
    [0.50, 0.50, 0.96], // A#
    [0.52, 0.52, 0.97], // B
  ],
};

/**
 * Returns the 12-color lookup table for a given theme.
 * Format suitable for ShaderMaterial.setArray3('uChromaColors', flat).
 */
export function getChromaLUT(theme: ChromaTheme): Float32Array {
  const lut = THEMES[theme];
  const flat = new Float32Array(36); // 12 × 3
  for (let i = 0; i < 12; i++) {
    flat[i * 3 + 0] = lut[i][0];
    flat[i * 3 + 1] = lut[i][1];
    flat[i * 3 + 2] = lut[i][2];
  }
  return flat;
}

export { THEMES };
