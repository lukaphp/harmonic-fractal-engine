import React, { useEffect, useState, useContext, createContext } from 'react';

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

import { Engine } from '@babylonjs/core';

interface AudioContextValue {
  analyzer: AnalyserNode | null;
  isPlaying: boolean;
  togglePlay: () => void;
  isReady: boolean;
}

// Create a context so we can provide the Analyser instance deep into the tree
const AudioContext = createContext<AudioContextValue | null>(null);

export const useAudioAnalyzer = () => {
  const context = useContext(AudioContext);
  return context?.analyzer || null;
};

export const useAudioState = () => useContext(AudioContext);

interface AudioProviderProps {
  audioUrl: string | null;
  children: React.ReactNode;
}

const AudioProvider: React.FC<AudioProviderProps> = ({ audioUrl, children }) => {
  const [analyzer, setAnalyzer] = useState<AnalyserNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  
  // Refs to hold instances across renders
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const audioElementRef = React.useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioUrl) {
      setIsReady(false);
      return;
    }

    let audioSource: MediaElementAudioSourceNode | null = null;
    let localAnalyzer: AnalyserNode | null = null;

    const setupAudio = async () => {
      // Create Web Audio API context
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;
      
      // 2. Create Audio HTML Element
      const element = new Audio(audioUrl);
      element.loop = true;
      audioElementRef.current = element;
      
      // 3. Create Analyzer Node
      localAnalyzer = ctx.createAnalyser();
      if (localAnalyzer) {
        localAnalyzer.fftSize = 512;
        localAnalyzer.smoothingTimeConstant = 0.8;
      }

      // 4. Connect nodes
      audioSource = ctx.createMediaElementSource(element);
      if (audioSource && localAnalyzer && ctx) {
        audioSource.connect(localAnalyzer);
        localAnalyzer.connect(ctx.destination);
      }

      setAnalyzer(localAnalyzer);
      setIsReady(true);
      setIsPlaying(false);
    };

    setupAudio();

    return () => {
      // Cleanup
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.removeAttribute('src');
        audioElementRef.current.load();
        audioElementRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      setAnalyzer(null);
      setIsReady(false);
      setIsPlaying(false);
    };
  }, [audioUrl]);

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
      console.error("Audio playback failed:", e);
    }
  };

  return (
    <AudioContext.Provider value={{ analyzer, isPlaying, togglePlay, isReady }}>
      {children}
    </AudioContext.Provider>
  );
};

export default AudioProvider;
