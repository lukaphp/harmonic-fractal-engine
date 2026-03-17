import React, { useState, useEffect, useCallback } from 'react';
import { useControls } from 'leva';
import SceneContainer from './components/SceneContainer';
import AudioBrain, { useAudioBrain } from './components/AudioBrain';
import { PRESETS, HarmonicPreset } from './data/presets';
import './index.css';

// ─── UIOverlay ────────────────────────────────────────────────────────────────

const UIOverlay: React.FC<{
  onFileLoad: (url: string) => void;
  onPresetSelect: (preset: HarmonicPreset, index: number) => void;
  activePreset: number;
}> = ({ onFileLoad, onPresetSelect, activePreset }) => {
  const brain = useAudioBrain();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileLoad(URL.createObjectURL(file));
  };

  return (
    <div className="ui-overlay">
      <h1 className="app-title">
        <span className="title-glow">Harmonic</span> Fractal
      </h1>

      <div className="file-section">
        <label className="file-label" htmlFor="audio-input">
          <span className="file-icon">🎵</span>
          <span>Load Audio</span>
        </label>
        <input
          id="audio-input"
          type="file"
          accept="audio/*"
          onChange={handleFile}
          className="file-input-hidden"
        />
      </div>

      {brain.isReady && (
        <button
          className={`play-button ${brain.isPlaying ? 'playing' : ''}`}
          onClick={brain.togglePlay}
        >
          {brain.isPlaying ? '⏸' : '▶'}
        </button>
      )}

      {/* Live descriptor meters */}
      {brain.isPlaying && (
        <div className="meters">
          <Meter label="Centroid" value={brain.centroid} color="#8af" />
          <Meter label="RMS"      value={brain.rms}      color="#af8" />
          <Meter label="Rolloff"  value={brain.rolloff}  color="#fa8" />
          <Meter label="Beat"     value={brain.beatPulse} color="#f8a" accent />
        </div>
      )}

      {/* Presets */}
      <div className="preset-panel">
        <p className="preset-label">Presets <span className="hint-text">(keys 1–5)</span></p>
        <div className="preset-grid">
          {PRESETS.map((p, i) => (
            <button
              key={p.name}
              className={`preset-btn ${activePreset === i ? 'active' : ''}`}
              onClick={() => onPresetSelect(p, i)}
              title={`${p.name} — ${p.fractalMode}`}
            >
              {p.emoji} <span className="preset-name">{p.name}</span>
              <span className="preset-tag">{p.fractalMode === 'menger' ? 'M' : 'B'}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const Meter: React.FC<{ label: string; value: number; color: string; accent?: boolean }> = ({
  label, value, color, accent,
}) => (
  <div className="meter">
    <span className="meter-label">{label}</span>
    <div className="meter-track">
      <div
        className={`meter-fill ${accent ? 'accent' : ''}`}
        style={{ width: `${Math.round(value * 100)}%`, background: color }}
      />
    </div>
  </div>
);

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [audioUrl,     setAudioUrl]     = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState(0);

  // Leva controls — initialized from first preset
  const [controls, setLevaValues] = useControls('Fractal Controls', () => ({
    bassSensitivity: { value: PRESETS[0].bassSensitivity, min: 0, max: 3,  step: 0.05, label: 'Bass Sens.' },
    midSensitivity:  { value: PRESETS[0].midSensitivity,  min: 0, max: 3,  step: 0.05, label: 'Mid Sens.' },
    highSensitivity: { value: PRESETS[0].highSensitivity, min: 0, max: 3,  step: 0.05, label: 'High Sens.' },
    smoothingFactor: { value: PRESETS[0].smoothingFactor, min: 0.01, max: 1, step: 0.01, label: 'Smoothing' },
    power:           { value: PRESETS[0].power,           min: 2, max: 12, step: 0.5,  label: 'Bulb Power' },
    beatAmplitude:   { value: PRESETS[0].beatAmplitude,   min: 0, max: 4,  step: 0.1,  label: 'Beat Spike' },
  }));

  const applyPreset = useCallback((preset: HarmonicPreset, index: number) => {
    setActivePreset(index);
    setLevaValues({
      bassSensitivity: preset.bassSensitivity,
      midSensitivity:  preset.midSensitivity,
      highSensitivity: preset.highSensitivity,
      smoothingFactor: preset.smoothingFactor,
      power:           preset.power,
      beatAmplitude:   preset.beatAmplitude,
    });
  }, [setLevaValues]);

  // Keyboard shortcuts 1–5
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < PRESETS.length) applyPreset(PRESETS[idx], idx);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [applyPreset]);

  // Derive fractalMode + chromaTheme from active preset (not in Leva — too complex for sliders)
  const activePresetData = PRESETS[activePreset];

  return (
    <AudioBrain audioUrl={audioUrl}>
      <div className="app-container">
        <UIOverlay
          onFileLoad={setAudioUrl}
          onPresetSelect={applyPreset}
          activePreset={activePreset}
        />
        <div className="canvas-container">
          <SceneContainer
            bassSensitivity={controls.bassSensitivity}
            midSensitivity={controls.midSensitivity}
            highSensitivity={controls.highSensitivity}
            power={controls.power}
            beatAmplitude={controls.beatAmplitude}
            fractalMode={activePresetData.fractalMode}
            chromaTheme={activePresetData.chromaTheme}
          />
        </div>
      </div>
    </AudioBrain>
  );
}