precision highp float;

// ─── Uniforms (from FractalMesh.tsx) ────────────────────────────────────────
uniform float uTime;
uniform vec2  uResolution;
uniform float uBass;       // smoothed bass  [0.0 – 1.0]
uniform float uMid;        // smoothed mid   [0.0 – 1.0]
uniform float uHigh;       // smoothed high  [0.0 – 1.0]
uniform float uIterations; // 4.0 – 12.0  (bass driven)
uniform float uWarp;       // 0.5 – 2.0   (mid driven)
uniform float uColorShift; // 0.0 – 1.0   (high driven)
uniform float uPower;      // Mandelbulb exponent (2.0 – 12.0), default 8.0
uniform float uSensitivity;// global multiplier

// ─── IQ Palette (cosine-based procedural gradient) ──────────────────────────
// From Inigo Quilez: https://iquilezles.org/articles/palettes/
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
}

vec3 fractalColor(float dist, float iters) {
    // Shift hue based on high frequencies
    float t = dist + uColorShift * 0.5 + uTime * 0.04;
    vec3 col = palette(
        t + iters * 0.015,
        vec3(0.5, 0.5, 0.5),
        vec3(0.5, 0.5, 0.5),
        vec3(1.0, 1.0, 0.5),
        vec3(0.80 + uColorShift * 0.2, 0.90, 0.30 + uMid * 0.3)
    );
    return col;
}

// ─── Mandelbulb Signed Distance Estimator ────────────────────────────────────
// Returns (distance, trap) — trap is used for coloring
vec2 mandelbulbDE(vec3 pos) {
    vec3  z    = pos;
    float dr   = 1.0;
    float r    = 0.0;
    float trap = 1e10;
    int   iMax = int(uIterations); // [4 – 12]

    for (int i = 0; i < 12; i++) {
        if (i >= iMax) break;

        r = length(z);
        if (r > 2.0) break;

        // Spherical coordinates
        float theta = acos(clamp(z.z / r, -1.0, 1.0));
        float phi   = atan(z.y, z.x);
        float zr    = pow(r, uPower);

        // Derivative update
        dr = pow(r, uPower - 1.0) * uPower * dr + 1.0;

        // Apply audio warp: slight perturbation of angles
        theta *= uWarp * (1.0 + uMid * 0.15 * sin(uTime * 0.3 + float(i)));
        phi   += uMid * 0.08 * sin(uTime * 0.5 + float(i) * 0.7);

        // Convert back to Cartesian
        z = zr * vec3(
            sin(theta) * cos(phi),
            sin(theta) * sin(phi),
            cos(theta)
        );
        z += pos; // c = pos (Mandelbulb, not Mandelbrot)

        // Color trap (orbit trap technique)
        trap = min(trap, dot(z, z));
    }

    float dist = 0.5 * log(r) * r / dr;
    return vec2(dist, trap);
}

// ─── Scene SDF (adds subtle audio-driven rotation to the bulb) ───────────────
vec2 sceneSDF(vec3 pos) {
    // Slow auto-rotation + bass-pulse scale
    float angle = uTime * 0.12;
    float ca = cos(angle), sa = sin(angle);
    vec3 p = vec3(
        ca * pos.x - sa * pos.z,
        pos.y,
        sa * pos.x + ca * pos.z
    );

    // Bass makes the bulb swell slightly
    float scale = 1.0 + uBass * 0.18 * uSensitivity;
    p /= scale;
    vec2 res = mandelbulbDE(p);
    res.x *= scale;
    return res;
}

// ─── Normal via central differences ─────────────────────────────────────────
vec3 calcNormal(vec3 p) {
    const float eps = 0.001;
    return normalize(vec3(
        sceneSDF(p + vec3(eps, 0.0, 0.0)).x - sceneSDF(p - vec3(eps, 0.0, 0.0)).x,
        sceneSDF(p + vec3(0.0, eps, 0.0)).x - sceneSDF(p - vec3(0.0, eps, 0.0)).x,
        sceneSDF(p + vec3(0.0, 0.0, eps)).x - sceneSDF(p - vec3(0.0, 0.0, eps)).x
    ));
}

// ─── Raymarching ─────────────────────────────────────────────────────────────
#define MAX_STEPS 96
#define MAX_DIST  20.0
#define SURF_DIST 0.0005

vec4 raymarch(vec3 ro, vec3 rd) {
    float t = 0.0;
    float trap = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3  p   = ro + rd * t;
        vec2  res = sceneSDF(p);
        float d   = res.x;
        trap      = res.y;

        if (d < SURF_DIST) {
            // HIT — compute shading
            vec3 n = calcNormal(p);

            // Blinn-Phong
            vec3  lightDir = normalize(vec3(1.0, 2.0, -1.5));
            float diff     = max(dot(n, lightDir), 0.0);
            vec3  halfVec  = normalize(lightDir - rd);
            float spec     = pow(max(dot(n, halfVec), 0.0), 64.0);
            float ao       = clamp(float(i) / float(MAX_STEPS), 0.0, 1.0);

            // Color: orbit trap drives hue variation
            vec3 col = fractalColor(trap * 0.4, float(i));
            col = col * (0.4 + 0.6 * diff) + vec3(spec * 0.6);
            // Slight ambient occlusion darkening at deep iterations
            col *= 1.0 - ao * 0.35;

            return vec4(col, 1.0);
        }

        if (t > MAX_DIST) break;
        t += d * 0.55; // conservative step ratio for stability
    }
    return vec4(0.0); // MISS
}

// ─── Main ─────────────────────────────────────────────────────────────────────
void main() {
    // UV in [-1, 1] with correct aspect ratio
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;

    // Camera: slowly orbits, distance pulled by bass
    float camDist = 3.2 - uBass * 0.5 * uSensitivity;
    float camAngleY = uTime * 0.08;
    float camAngleX = sin(uTime * 0.05) * 0.35;

    vec3 ro = vec3(
        camDist * sin(camAngleY) * cos(camAngleX),
        camDist * sin(camAngleX),
        camDist * cos(camAngleY) * cos(camAngleX)
    );

    vec3 target = vec3(0.0);
    vec3 forward = normalize(target - ro);
    vec3 right   = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
    vec3 up      = cross(forward, right);

    float fov = 1.5;
    vec3 rd = normalize(forward + fov * (uv.x * right + uv.y * up));

    // Render
    vec4 col = raymarch(ro, rd);

    // Background: deep space gradient with high-frequency shimmer
    if (col.a < 0.5) {
        float stars = fract(sin(dot(uv * 400.0, vec2(127.1, 311.7))) * 43758.5453);
        float starGlow = step(0.997, stars) * (0.6 + 0.4 * uHigh);
        vec3 bg = mix(
            vec3(0.01, 0.01, 0.03),
            vec3(0.03 + uHigh * 0.05, 0.01, 0.06 + uBass * 0.04),
            length(uv) * 0.5
        );
        col = vec4(bg + starGlow, 1.0);
    }

    // Subtle film grain
    float grain = (fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.55) - 0.5) * 0.025;
    col.rgb += grain;

    gl_FragColor = col;
}
