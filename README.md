# 🌀 Harmonic Fractal Engine

> A real-time 3D audio visualizer that maps the **identity of sound** — timbre, rhythm, and tonality — onto a Mandelbulb / Menger Sponge fractal via GPU raymarching.

![Harmonic Fractal Engine](https://img.shields.io/badge/Built%20with-Babylon.js%20%7C%20WebGPU-blueviolet?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## ✨ What makes this different

Most audio visualizers react to **volume**. Harmonic Fractal Engine reacts to the **musical identity** of the sound:

| Musical Feature | Extraction Method | Fractal Parameter |
| :--- | :--- | :--- |
| **Timbre (Brightness)** | Spectral Centroid | Surface reflectivity |
| **Harmonicity vs Noise** | Spectral Rolloff | SDF roughness / fractal detail |
| **Loudness** | RMS (auto-normalized) | Camera scale |
| **Rhythm (Beats)** | Adaptive Peak Detection | Power exponent spike + exponential decay |
| **Tonality (Chords)** | Chroma CQT (12 pitch classes) | Color palette (synesthetic LUT) |

A jazz track and a techno track produce **radically different geometries** — not because one is louder, but because they have different timbre, harmony, and rhythm.

---

## 🚀 Getting Started

```bash
# Clone the repository
git clone https://github.com/lukaphp/harmonic-fractal-engine.git
cd harmonic-fractal-engine

# Install dependencies
npm install

# Start the development server
npm start
# → Opens at http://localhost:3001
```

**Requirements:** Node.js 18+, a WebGPU-capable browser (Chrome 113+ / Edge 113+)

---

## 🎵 How to Use

1. Click **Load Audio** and select any audio file (MP3, WAV, OGG…)
2. Press **▶** to start playback
3. Watch the fractal come to life — shape, color, and geometry respond to the music in real time
4. Switch presets with buttons or keyboard shortcuts **`1`–`5`**
5. Fine-tune parameters with the **Fractal Controls** panel (top right)

---

## 🎛️ Controls

| Control | Range | Effect |
| :--- | :--- | :--- |
| Bass / Mid / High Sensitivity | 0–3 | Amplify frequency band influence |
| Smoothing | 0.01–1 | Lerp factor for temporal smoothing |
| Bulb Power | 2–12 | Mandelbulb exponent (shape complexity) |
| Beat Spike | 0–4 | How much a beat "inflates" the fractal |

### Presets

| Key | Preset | Fractal | Theme |
| :---: | :--- | :--- | :--- |
| `1` | 🌌 Nebulosa Pulsante | Mandelbulb | Scriabin |
| `2` | 💎 Cristallo Rigido | Mandelbulb | Temperature |
| `3` | 🌋 Lava Organica | Menger Sponge | Temperature |
| `4` | ⚡ Tempesta Elettrica | Menger Sponge | Rainbow |
| `5` | 🧘 Meditazione | Mandelbulb | Monochrome |

---

## 🏗️ Architecture

```
src/
├── components/
│   ├── AudioBrain.tsx        # Audio analysis engine (5 qualitative descriptors)
│   ├── FractalMesh.tsx       # Babylon.js fullscreen quad + ShaderMaterial
│   └── SceneContainer.tsx    # Reactylon scene wrapper
├── data/
│   ├── presets.ts            # 5 harmonic presets (fractalMode + chromaTheme)
│   └── chromaColors.ts       # 4 color themes × 12 pitch classes → RGB LUT
├── shaders/
│   ├── mandelbulb.frag.glsl  # (legacy reference)
│   └── fullscreen.vert.glsl  # (legacy reference)
└── utils/
    └── CircularBuffer.ts     # Ring buffer for beat detection + auto-normalize
```

### GPU Raymarching Shader

The fragment shader implements:
- **Mandelbulb SDF** with melodic Constant C offset and beat-driven Power Exponent
- **Menger Sponge SDF** with rolloff-scaled iteration count
- **Orbit Trap coloring** — beat-driven wave of dominant chroma color across the surface
- **Chroma-weighted blending** — 12 pitch classes each contribute their synesthetic color
- **Blinn-Phong shading** with centroid-driven specular intensity
- **Procedural starfield** background

---

## 🔬 Audio Analysis Details

### Spectral Centroid
Measures frequency brightness: `C = Σ(freq × amp) / Σ(amp)`. High values = bright sounds (hi-hat, violin). Maps to surface reflectivity.

### Spectral Rolloff
The frequency below which 85% of spectral energy lies. Low value = tonal/harmonic; high value = noisy/percussive. Maps to SDF roughness.

### Beat Detection
Adaptive threshold: `threshold = avg(bassHistory) + 1.5 × σ(bassHistory)` over a 43-frame (~1s) circular buffer. Cooldown of 8 frames prevents double-triggers. Post-beat exponential decay: `pulse(t) *= 0.88` per frame (τ ≈ 120ms).

### Chroma CQT
FFT bins mapped to MIDI note numbers → pitch class mod 12. Each of the 12 classes accumulates energy. The normalized vector drives the color LUT blend.

---

## 🛠️ Tech Stack

- **[Reactylon](https://reactylon.com/)** — React bindings for Babylon.js
- **[Babylon.js](https://babylonjs.com/)** v8 — WebGPU rendering engine
- **[Leva](https://github.com/pmndrs/leva)** — GUI controls
- **Web Audio API** — `AnalyserNode` + custom DSP
- **Webpack 5** + TypeScript 5

---

## 📄 License

MIT © 2026 Gianluca Stefanelli
