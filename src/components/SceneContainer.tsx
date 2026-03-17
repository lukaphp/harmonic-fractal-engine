import { Scene } from 'reactylon';
import { Engine } from 'reactylon/web';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import AudioProvider from './AudioProvider';
import Visualizer from './Visualizer';

interface SceneContainerProps {
  audioUrl: string | null;
}

const SceneContainer: React.FC<SceneContainerProps> = ({ audioUrl }) => {
  return (
    <Engine engineOptions={{ antialias: true, adaptToDeviceRatio: true }} canvasId="reactylon-canvas">
      <Scene>
        <freeCamera
          name="camera1"
          position={new Vector3(0, 5, -15)}
          lockedTarget={new Vector3(0, 0, 0)}
        />
        <hemisphericLight
          name="light1"
          intensity={0.7}
          direction={new Vector3(0, 1, 0)}
        />
        <directionalLight 
           name="dirLight" 
           direction={new Vector3(-1, -2, -1)} 
           intensity={0.5} 
           position={new Vector3(20, 40, 20)} 
        />
        
          <Visualizer />
      </Scene>
    </Engine>
  );
};

export default SceneContainer;
