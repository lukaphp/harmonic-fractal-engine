import React, { useRef } from 'react';
import { useScene } from 'reactylon';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { useAudioAnalyzer } from './AudioProvider';
import { useControls } from 'leva';

const Visualizer: React.FC = () => {
  const analyzer = useAudioAnalyzer();
  
  // Refs per le 3 mesh principali
  const bassRef = useRef<Mesh>(null);
  const midRef = useRef<Mesh>(null);
  const highRef = useRef<Mesh>(null);
  const { useEffect } = React;

  // Leva controls
  const { bassSensitivity, midSensitivity, highSensitivity, rotateSpeed } = useControls({
    bassSensitivity: { value: 1.5, min: 0.1, max: 5, step: 0.1 },
    midSensitivity: { value: 2.0, min: 0.1, max: 5, step: 0.1 },
    highSensitivity: { value: 0.05, min: 0.01, max: 0.5, step: 0.01 },
    rotateSpeed: { value: 0.02, min: 0.001, max: 0.1, step: 0.001 }
  });

  const scene = useScene();

  useEffect(() => {
    const renderLoop = () => {
      if (!analyzer) return;
      
      // Otteniamo i dati della frequenza in byte (0-255)
      // FFT size è 512, quindi frequencyBinCount è 256
      const dataArray = new Uint8Array(analyzer.frequencyBinCount);
      analyzer.getByteFrequencyData(dataArray);

      // 1. BASSI (0-10) -> Scala Y
      if (bassRef.current) {
          let bassSum = 0;
          for (let i = 0; i < 11; i++) bassSum += dataArray[i];
          const bassAvg = bassSum / 11;
          // Normalizziamo e applichiamo la sensibilità
          const scaleY = 1 + (bassAvg / 255) * 5 * bassSensitivity;
          bassRef.current.scaling.y = scaleY;
      }

      // 2. MEDI (11-100) -> Colore Emissivo
      if (midRef.current && midRef.current.material) {
          let midSum = 0;
          for (let i = 11; i < 101; i++) midSum += dataArray[i];
          const midAvg = midSum / 90;
          // Cambiamo il colore da scuro a molto luminoso in base all'audio
          const intensity = (midAvg / 255) * midSensitivity;
          (midRef.current.material as any).emissiveColor = new Color3(0.2 + intensity, 0.8 * intensity, 1.0);
      }

      // 3. ALTI (101-255) -> Rotazione Y (velocità)
      if (highRef.current) {
          let highSum = 0;
          for (let i = 101; i < 256; i++) highSum += dataArray[i];
          const highAvg = highSum / 155;
          // Aumenta la velocità di rotazione in base agli alti
          highRef.current.rotation.y += rotateSpeed + ((highAvg / 255) * highSensitivity);
          highRef.current.rotation.x += rotateSpeed * 0.5;
      }
    };

    scene.registerBeforeRender(renderLoop);
    return () => scene.unregisterBeforeRender(renderLoop);
  }, [analyzer, bassSensitivity, midSensitivity, highSensitivity, rotateSpeed, scene]);

  return (
    <>
      <box 
        name="bassBox" 
        ref={bassRef} 
        options={{ size: 2 }}
        position={new Vector3(-4, 0, 0)}
      >
        <standardMaterial name="bassMat" diffuseColor={new Color3(1, 0.2, 0.5)} emissiveColor={new Color3(0.2, 0, 0.1)} />
      </box>

      <sphere 
        name="midSphere" 
        ref={midRef} 
        options={{ diameter: 2.5, segments: 32 }}
        position={new Vector3(0, 0, 0)}
      >
        <standardMaterial name="midMat" diffuseColor={new Color3(0.1, 0.5, 1)} />
      </sphere>

      <torus 
        name="highTorus" 
        ref={highRef} 
        options={{ diameter: 2.5, thickness: 0.5, tessellation: 64 }}
        position={new Vector3(4, 0, 0)}
      >
        <standardMaterial name="highMat" diffuseColor={new Color3(0.5, 1, 0.2)} emissiveColor={new Color3(0.1, 0.2, 0.05)} wireframe={true} />
      </torus>
      
      {/* Base Plane */}
       <ground name="ground1" options={{ width: 20, height: 20, subdivisions: 2 }} position={new Vector3(0, -3, 0)}>
         <standardMaterial name="groundMat" diffuseColor={new Color3(0.05, 0.05, 0.05)} specularColor={new Color3(0.1, 0.1, 0.1)} />
       </ground>
    </>
  );
};

export default Visualizer;
