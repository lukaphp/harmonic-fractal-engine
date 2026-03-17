import React, { useState } from 'react';
import SceneContainer from './components/SceneContainer';
import AudioProvider, { useAudioState } from './components/AudioProvider';
import './index.css';

interface AppProps {
  havok?: any;
}

function App({ havok }: AppProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
    }
  };

  const UIOverlay = () => {
    const audioState = useAudioState();

    return (
      <div className="ui-overlay">
        <h1>Auryon 3D Spectrum</h1>
        <div className="file-input-wrapper">
          <input 
            type="file" 
            accept="audio/mp3, audio/wav, audio/ogg" 
            onChange={handleFileUpload} 
            className="file-input"
          />
          <p className="hint">Select an audio file to analyze</p>
        </div>

        {audioUrl && audioState && (
          <div className="playback-controls">
            <button 
              className={`play-button ${audioState.isPlaying ? 'playing' : ''}`}
              onClick={audioState.togglePlay}
              disabled={!audioState.isReady}
            >
              {audioState.isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <AudioProvider audioUrl={audioUrl}>
      <div className="app-container">
        <UIOverlay />
      
        <div className="canvas-container">
          <SceneContainer audioUrl={audioUrl} />
        </div>
      </div>
    </AudioProvider>
  );
}

export default App;