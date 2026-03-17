import React, { useEffect, useRef } from 'react';
import { useScene } from 'reactylon';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Effect } from '@babylonjs/core/Materials/effect';
import { useAudioBrain } from './AudioBrain';
import { getChromaLUT, ChromaTheme } from '../data/chromaColors';

// ─── Shader Sources ──────────────────────────────────────────────────────────

const VERTEX_SHADER = `
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUV;
void main(void) { vUV = uv; gl_Position = vec4(position, 1.0); }
`;

const FRAGMENT_SHADER = `
precision highp float;

// ── Time & screen ──────────────────────────────────────────────────────────
uniform float uTime;
uniform vec2  uResolution;

// ── Phase 1 AudioBrain descriptors ────────────────────────────────────────
uniform float uRMS;         // [0-1] auto-normalized loudness  → camera scale
uniform float uCentroid;    // [0-1] spectral brightness       → reflectivity
uniform float uRolloff;     // [0-1] harmonicity vs noise      → surface roughness
uniform float uBeatPulse;   // [0-1] exponential decay         → power exponent spike
uniform float uChroma0; uniform float uChroma1; uniform float uChroma2;
uniform float uChroma3; uniform float uChroma4; uniform float uChroma5;
uniform float uChroma6; uniform float uChroma7; uniform float uChroma8;
uniform float uChroma9; uniform float uChroma10; uniform float uChroma11;

float getChroma(int i) {
    if (i==0) return uChroma0; if (i==1) return uChroma1;
    if (i==2) return uChroma2; if (i==3) return uChroma3;
    if (i==4) return uChroma4; if (i==5) return uChroma5;
    if (i==6) return uChroma6; if (i==7) return uChroma7;
    if (i==8) return uChroma8; if (i==9) return uChroma9;
    if (i==10) return uChroma10; return uChroma11;
}

// ── Phase 2 shader parameters ─────────────────────────────────────────────
uniform float uPower;       // base Mandelbulb exponent [4-12]
uniform vec3  uC;           // melodic constant offset
uniform float uFractalMode; // 0.0 = Mandelbulb, 1.0 = Menger Sponge
uniform float uBeatAmplitude; // max exponent spike on beat [0-4]

// ── Phase 3 color ─────────────────────────────────────────────────────────
uniform vec3  uChromaColors[12]; // LUT [12 × rgb]
uniform vec3  uTrapPoint;        // orbit trap position (beat-driven)
uniform float uTrapRadius;       // orbit trap influence radius

// ── Legacy / sensitivity ──────────────────────────────────────────────────
uniform float uSensitivity;
uniform float uSmoothedBass; // kept for background color

// ─── IQ cosine palette ────────────────────────────────────────────────────
vec3 iqPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
}

// ─── Chroma-weighted color ────────────────────────────────────────────────
vec3 chromaBlend() {
    vec3 col = vec3(0.0);
    float w = 0.0;
    for (int i = 0; i < 12; i++) {
        float c = getChroma(i);
        col += uChromaColors[i] * c;
        w   += c;
    }
    return w > 0.0 ? col / w : vec3(0.45, 0.45, 0.65);
}

// ─── Orbit trap color ─────────────────────────────────────────────────────
// Returns [0,1] influence of the trap (max near uTrapPoint)
float orbitTrapInfluence(vec3 z) {
    return exp(-length(z - uTrapPoint) * 2.5 / max(uTrapRadius, 0.01));
}

// ─── Mandelbulb SDF ──────────────────────────────────────────────────────
vec2 mandelbulbDE(vec3 pos) {
    vec3  z    = pos;
    float dr   = 1.0;
    float r    = 0.0;
    float trap = 1e10;
    float trapMax = 0.0;
    float effectivePower = uPower + uBeatPulse * uBeatAmplitude;

    for (int i = 0; i < 12; i++) {
        r = length(z);
        if (r > 2.0) break;

        float theta = acos(clamp(z.z / r, -1.0, 1.0));
        float phi   = atan(z.y, z.x);
        float zr    = pow(r, effectivePower);
        dr = pow(r, effectivePower - 1.0) * effectivePower * dr + 1.0;

        // Rolloff modulates surface roughness via angle perturbation
        theta *= 1.0 + uRolloff * 0.12 * sin(uTime * 0.4 + float(i));
        phi   += uRolloff * 0.07 * cos(uTime * 0.6 + float(i) * 0.8);

        z = zr * vec3(
            sin(theta) * cos(phi),
            sin(theta) * sin(phi),
            cos(theta)
        ) + pos + uC; // Melodic constant C shifts the attractor

        // Orbit trap: record minimum distance to trap point
        float ot = orbitTrapInfluence(z);
        trapMax = max(trapMax, ot);
        trap = min(trap, dot(z - uTrapPoint, z - uTrapPoint));
    }
    return vec2(0.5 * log(r) * r / dr, trapMax);
}

// ─── Menger Sponge SDF ───────────────────────────────────────────────────
float boxDE(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

float mengerDE(vec3 pos) {
    float d = boxDE(pos, vec3(1.0));
    float scale = 1.0;
    int iters = int(3.0 + uRolloff * 2.0); // more iterations for noisy sounds
    for (int i = 0; i < 5; i++) {
        if (i >= iters) break;
        vec3 a = mod(pos * scale, 2.0) - 1.0;
        scale *= 3.0;
        vec3 rv = abs(1.0 - 3.0 * abs(a));
        float da = max(rv.x, rv.y);
        float db = max(rv.y, rv.z);
        float dc = max(rv.z, rv.x);
        float c = (min(da, min(db, dc)) - 1.0) / scale;
        d = max(d, c);
    }
    return d;
}

// ─── Scene SDF (blend Mandelbulb / Menger based on uFractalMode) ─────────
vec2 sceneSDF(vec3 pos) {
    // Slow auto-rotation
    float angle = uTime * 0.10;
    float ca = cos(angle), sa = sin(angle);
    vec3 p = vec3(ca * pos.x - sa * pos.z, pos.y, sa * pos.x + ca * pos.z);

    // RMS → scale (auto-normalized)
    float scale = 0.85 + uRMS * 0.30 * uSensitivity;
    p /= scale;

    vec2 res;
    if (uFractalMode < 0.5) {
        res = mandelbulbDE(p);
    } else {
        // Menger: no orbit trap color data
        res.x = mengerDE(p);
        res.y = uBeatPulse; // use beatPulse as "trap" for coloring
    }
    res.x *= scale;
    return res;
}

// ─── Normal estimation ───────────────────────────────────────────────────
vec3 calcNormal(vec3 p) {
    const float eps = 0.001;
    return normalize(vec3(
        sceneSDF(p + vec3(eps,0,0)).x - sceneSDF(p - vec3(eps,0,0)).x,
        sceneSDF(p + vec3(0,eps,0)).x - sceneSDF(p - vec3(0,eps,0)).x,
        sceneSDF(p + vec3(0,0,eps)).x - sceneSDF(p - vec3(0,0,eps)).x
    ));
}

// ─── Raymarching ─────────────────────────────────────────────────────────
#define MAX_STEPS 96
#define MAX_DIST  20.0
#define SURF_DIST 0.0005

vec4 raymarch(vec3 ro, vec3 rd) {
    float t = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3  p   = ro + rd * t;
        vec2  res = sceneSDF(p);
        if (res.x < SURF_DIST) {
            vec3 n = calcNormal(p);
            vec3 lD = normalize(vec3(1.0, 2.0, -1.5));
            float diff = max(dot(n, lD), 0.0);
            float spec = pow(max(dot(normalize(lD - rd), n), 0.0), 64.0);
            float ao   = clamp(float(i) / float(MAX_STEPS), 0.0, 1.0);

            // Base color: chroma blend
            vec3 base = chromaBlend();

            // Orbit trap pulse: flash trap color on beat
            vec3 trapCol = mix(base, uChromaColors[0], res.y * 0.8);

            // Centroid → specular intensity (brighter sounds = more reflective)
            float specMult = 0.3 + uCentroid * 1.2;
            vec3 col = trapCol * (0.4 + 0.6 * diff) + vec3(spec * specMult);
            col *= 1.0 - ao * 0.35;

            return vec4(col, 1.0);
        }
        if (t > MAX_DIST) break;
        t += res.x * 0.55;
    }
    return vec4(0.0);
}

// ─── Main ────────────────────────────────────────────────────────────────
void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;

    // Camera orbits — distance modulated by RMS
    float camDist   = 3.2 - uRMS * 0.6 * uSensitivity;
    float camAngleY = uTime * 0.08;
    float camAngleX = sin(uTime * 0.05) * 0.35;

    vec3 ro = vec3(
        camDist * sin(camAngleY) * cos(camAngleX),
        camDist * sin(camAngleX),
        camDist * cos(camAngleY) * cos(camAngleX)
    );
    vec3 forward = normalize(-ro);
    vec3 right   = normalize(cross(vec3(0,1,0), forward));
    vec3 up      = cross(forward, right);
    vec3 rd      = normalize(forward + 1.5 * (uv.x * right + uv.y * up));

    vec4 col = raymarch(ro, rd);

    // Background: deep space tinted by dominant chroma
    if (col.a < 0.5) {
        vec3 chromaTint = chromaBlend() * 0.06;
        float stars = fract(sin(dot(uv * 400.0, vec2(127.1, 311.7))) * 43758.5453);
        float sg    = step(0.997, stars) * (0.5 + 0.5 * uRMS);
        vec3 bg = mix(vec3(0.01, 0.01, 0.03), vec3(0.03) + chromaTint, length(uv) * 0.4);
        col = vec4(bg + sg, 1.0);
    }

    float grain = (fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898,78.233))) * 43758.55) - 0.5) * 0.02;
    col.rgb += grain;
    gl_FragColor = col;
}
`;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface FractalMeshProps {
  bassSensitivity: number;
  midSensitivity:  number;
  highSensitivity: number;
  power:           number;
  beatAmplitude:   number;
  fractalMode:     'mandelbulb' | 'menger';
  chromaTheme:     ChromaTheme;
}

const SHADER_NAME = 'harmonicFractal';

// ─── Component ───────────────────────────────────────────────────────────────

const FractalMesh: React.FC<FractalMeshProps> = (props) => {
  const scene = useScene();
  const brain = useAudioBrain();

  const matRef   = useRef<ShaderMaterial | null>(null);
  const brainRef = useRef(brain);
  const propsRef = useRef(props);

  // Beat-driven trap point (animated)
  const trapPtRef  = useRef(new Vector3(0, 0, 0));
  const prevBeatRef = useRef(0);

  brainRef.current = brain;
  propsRef.current = props;

  useEffect(() => {
    if (!scene) return;

    if (!Effect.ShadersStore[`${SHADER_NAME}VertexShader`]) {
      Effect.ShadersStore[`${SHADER_NAME}VertexShader`]   = VERTEX_SHADER;
      Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT_SHADER;
    }

    const quad = MeshBuilder.CreatePlane('fractalQuad', { width: 2, height: 2 }, scene);
    quad.isPickable = false;

    const mat = new ShaderMaterial(
      'harmonicFractalMat', scene,
      { vertex: SHADER_NAME, fragment: SHADER_NAME },
      {
        attributes: ['position', 'uv'],
        uniforms: [
          'uTime', 'uResolution',
          'uRMS', 'uCentroid', 'uRolloff', 'uBeatPulse',
          'uChroma0','uChroma1','uChroma2','uChroma3','uChroma4','uChroma5',
          'uChroma6','uChroma7','uChroma8','uChroma9','uChroma10','uChroma11',
          'uPower', 'uC', 'uFractalMode', 'uBeatAmplitude',
          'uChromaColors',
          'uTrapPoint', 'uTrapRadius',
          'uSensitivity', 'uSmoothedBass',
        ],
      },
    );
    mat.backFaceCulling = false;

    // ── Seed default uniforms so fractal renders immediately (before audio) ──
    mat.setFloat('uTime',        0);
    mat.setVector2('uResolution', new Vector2(800, 600));
    mat.setFloat('uRMS',         0.35);   // fractal visible at rest
    mat.setFloat('uCentroid',    0.4);
    mat.setFloat('uRolloff',     0.3);
    mat.setFloat('uBeatPulse',   0.0);
    for (let i = 0; i < 12; i++) mat.setFloat(`uChroma${i}`, 1.0 / 12.0); // equal chroma
    mat.setFloat('uPower',       props.power);
    mat.setVector3('uC',         Vector3.Zero());
    mat.setFloat('uFractalMode', 0.0);
    mat.setFloat('uBeatAmplitude', props.beatAmplitude);
    mat.setArray3('uChromaColors', Array.from(getChromaLUT(props.chromaTheme)));
    mat.setVector3('uTrapPoint', Vector3.Zero());
    mat.setFloat('uTrapRadius',  0.4);
    mat.setFloat('uSensitivity', 1.0);
    mat.setFloat('uSmoothedBass', 0.0);

    quad.material = mat;
    matRef.current = mat;

    const engine = scene.getEngine();

    const obs = scene.onBeforeRenderObservable.add(() => {
      const m = matRef.current;
      if (!m) return;

      const b = brainRef.current;
      const p = propsRef.current;

      // Beat spike on leading edge: trap point jumps to new position
      if (b.beatPulse > 0.8 && prevBeatRef.current <= 0.8) {
        const angle = Math.random() * Math.PI * 2;
        trapPtRef.current.set(
          Math.cos(angle) * 0.75,
          (Math.random() - 0.5) * 0.5,
          Math.sin(angle) * 0.75,
        );
      }
      prevBeatRef.current = b.beatPulse;
      // Trap point slowly pulls back to center
      trapPtRef.current.scaleInPlace(0.96);

      const t = performance.now() / 1000;
      const centroidNorm = b.centroid;
      const mOffset = (centroidNorm - 0.5) * 0.25;

      m.setFloat('uTime',          t);
      m.setVector2('uResolution',  new Vector2(engine.getRenderWidth(), engine.getRenderHeight()));
      m.setFloat('uRMS',           b.rms);
      m.setFloat('uCentroid',      b.centroid);
      m.setFloat('uRolloff',       b.rolloff);
      m.setFloat('uBeatPulse',     b.beatPulse);
      // uChroma: 12 individual floats (ShaderMaterial has no plain float-array setter)
      b.chroma.forEach((v, i) => m.setFloat(`uChroma${i}`, v));
      m.setFloat('uPower',         p.power);
      m.setVector3('uC',           new Vector3(
        Math.sin(t * 0.2) * mOffset,
        mOffset,
        Math.cos(t * 0.2) * mOffset * 0.5,
      ));
      m.setFloat('uFractalMode',   p.fractalMode === 'mandelbulb' ? 0.0 : 1.0);
      m.setFloat('uBeatAmplitude', p.beatAmplitude);
      m.setArray3('uChromaColors',  Array.from(getChromaLUT(p.chromaTheme)));
      m.setVector3('uTrapPoint',   trapPtRef.current);
      m.setFloat('uTrapRadius',    0.4 + b.beatPulse * 0.6);
      m.setFloat('uSensitivity',   1.0);
      m.setFloat('uSmoothedBass',  b.smoothBass);
    });

    return () => {
      scene.onBeforeRenderObservable.remove(obs);
      mat.dispose();
      quad.dispose();
      matRef.current = null;
    };
  }, [scene]);

  return null;
};

export default FractalMesh;
