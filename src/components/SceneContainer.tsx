import React from 'react';
import { Scene } from 'reactylon';

import { Engine } from 'reactylon/web';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import FractalMesh, { FractalMeshProps } from './FractalMesh';

type SceneContainerProps = Omit<FractalMeshProps, never>;

const SceneContainer: React.FC<SceneContainerProps> = (props) => {
  return (
    <Engine engineOptions={{ antialias: true, adaptToDeviceRatio: true }} canvasId="reactylon-canvas">
      <Scene>
        <freeCamera name="camera1" position={new Vector3(0, 0, -5)} lockedTarget={new Vector3(0, 0, 0)} />
        <FractalMesh {...props} />
      </Scene>
    </Engine>
  );
};

export default SceneContainer;
