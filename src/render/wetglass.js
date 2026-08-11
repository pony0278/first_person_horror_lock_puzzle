/* One-shot wet-vision pass for Door 3's pipe rupture.
 *
 * This pass intentionally follows the user's Three.js Wet Glass v3.2
 * "Faithful Layer Baseline": four unmasked Layer() fields refract and defocus
 * the live pump room as one wet pane. The effect remains short-lived and keeps
 * the lower operator console legible, but no longer turns the reference field
 * into a few isolated, highlighted droplets.
 */
import * as THREE from 'three';
import { renderer } from './scene.js';

const WET_DURATION = 4;
const BLUR_SAMPLES = 16;
const FIXED_SEED = 1842;
const LAYER_COUNT = 4;
const REFERENCE_PROFILE = 'threejs-wet-glass-v3.2-faithful';
const REFERENCE_DISTORTION = 5;
const REFERENCE_BLUR_RADIUS = 0.0155;

const target = new THREE.WebGLRenderTarget(1, 1, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: true,
  stencilBuffer: false,
});
// Offscreen scene colour is linear. Tagging this as sRGB decodes it a second
// time when the post material samples it, which was the source of the large
// brightness drop during the wet pass.
target.texture.colorSpace = THREE.LinearSRGBColorSpace;
target.texture.name = 'door3-wet-glass-scene';

const uniforms = {
  uScene: { value: target.texture },
  uTime: { value: 0 },
  uWetAmount: { value: 0 },
  uFilmAmount: { value: 0 },
  uSeed: { value: FIXED_SEED },
  uResolution: { value: new THREE.Vector2(1, 1) },
};

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uScene;
  uniform float uTime;
  uniform float uWetAmount;
  uniform float uFilmAmount;
  uniform float uSeed;
  uniform vec2 uResolution;

  #define PI2 6.28318530718
  #define S(a,b,n) smoothstep(a,b,n)

  float N12(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345 + uSeed * 0.0001);
    return fract(p.x * p.y);
  }

  float noise21(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = N12(i);
    float b = N12(i + vec2(1.0, 0.0));
    float c = N12(i + vec2(0.0, 1.0));
    float d = N12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Original Alain-Barrios-style field used by the v3.2 faithful reference:
  // xy is the refraction offset and z is the continuous wet trail mask.
  vec3 Layer(vec2 uv0, float t) {
    vec2 asp = vec2(2.0, 1.0);
    vec2 uv1 = uv0 * 3.0 * asp;
    uv1.y += t * 0.25;
    vec2 gv = fract(uv1) - 0.5;
    vec2 id = floor(uv1);

    float n = N12(id);
    t += n * PI2;
    float w = uv0.y * 10.0;
    float x = (n - 0.5) * 0.8;
    x += (0.4 - abs(x)) * sin(3.0 * w) *
      pow(max(0.0, sin(w)), 6.0) * 0.45;
    float y = -sin(t + sin(t + sin(t) * 0.5)) * 0.44;
    y -= (gv.x - x) * (gv.x - x);

    vec2 dropPos = (gv - vec2(x, y)) / asp;
    float drop = S(0.03, 0.02, length(dropPos));
    vec2 trailPos = (gv - vec2(x, t * 0.25)) / asp;
    trailPos.y = (fract(trailPos.y * 8.0) - 0.5) / 8.0;
    float trail = S(0.02, 0.015, length(trailPos));
    float fogTrail = S(-0.05, 0.05, dropPos.y);
    fogTrail *= S(0.5, y, gv.y);
    trail *= fogTrail;
    fogTrail *= S(0.03, 0.015, abs(dropPos.x));

    return vec3(drop * dropPos + trail * trailPos, fogTrail);
  }

  vec2 burstField(vec2 uv, float t) {
    float sheet = S(0.26, 0.96,
      uv.y + sin(uv.x * 9.0 + t * 4.2) * 0.055);
    float bands = sin(uv.y * 48.0 - t * 9.0 +
      noise21(vec2(uv.x * 8.0, t * 0.3)) * 5.0);
    float n = noise21(vec2(uv.x * 12.0, uv.y * 9.0 - t * 1.6));
    float mask = sheet * uFilmAmount * (0.25 + 0.75 * n);
    return vec2((n - 0.5) * 0.010 + bands * 0.0025,
      -(0.006 + n * 0.012)) * mask;
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 1.80;
    vec3 drops = Layer(uv, t);
    drops += Layer(uv * 1.25 + 7.54, t);
    drops += Layer(uv * 1.35 + 1.54, t);
    drops += Layer(uv * 1.57 - 7.54, t);

    float wetness = clamp(uWetAmount, 0.0, 1.0);
    float trailMask = clamp(drops.z, 0.0, 1.0);
    float consoleProtection = 1.0 - S(0.14, 0.34,
      length(vec2((uv.x - 0.5) * 0.95, (uv.y - 0.23) * 1.72)));
    float readability = mix(1.0, 0.42, consoleProtection);

    vec2 distort = drops.xy * (${REFERENCE_DISTORTION.toFixed(1)} * wetness * readability);
    distort += burstField(uv, t) * readability;
    vec2 refractUv = clamp(uv + distort, vec2(0.002), vec2(0.998));

    // Faithful reference behaviour: the pane is softly defocused everywhere,
    // while the continuous Layer() trails locally pull the background sharp.
    float blur = ${REFERENCE_BLUR_RADIUS.toFixed(4)} * wetness *
      (1.0 - trailMask * 0.88);
    blur += uFilmAmount * 0.0014 * S(0.24, 0.92, uv.y);
    blur *= readability;
    vec2 aspect = vec2(uResolution.y / max(uResolution.x, 1.0), 1.0);

    vec4 wet = vec4(0.0);
    float angle = N12(gl_FragCoord.xy) * PI2;
    for (int i = 0; i < ${BLUR_SAMPLES}; i++) {
      float fi = float(i) + 1.0;
      float radius = sqrt(fract(sin(fi * 546.0) * 5424.0));
      vec2 offset = vec2(sin(angle), cos(angle)) * blur * radius * aspect;
      wet += texture2D(uScene,
        clamp(refractUv + offset, vec2(0.002), vec2(0.998)));
      angle += 1.0;
    }
    wet /= ${BLUR_SAMPLES.toFixed(1)};

    vec3 base = texture2D(uScene, uv).rgb;
    float paneMix = wetness * mix(0.96, 0.58, consoleProtection);
    vec3 colour = mix(base, wet.rgb, paneMix);
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader,
  fragmentShader,
  depthTest: false,
  depthWrite: false,
  toneMapped: true,
});
material.name = 'door3-wet-glass-material';

const postScene = new THREE.Scene();
const postCamera = new THREE.Camera();
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
quad.name = 'door3-wet-glass-quad';
quad.frustumCulled = false;
postScene.add(quad);

const state = {
  active: false,
  time: 0,
  amount: 0,
  film: 0,
  targetWidth: 1,
  targetHeight: 1,
};

const clamp01 = value => Math.max(0, Math.min(1, value));
const smoothstep = value => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};

function amountAt(time) {
  const splashIn = smoothstep(time / 0.12);
  const fadeOut = 1 - smoothstep((time - 2.35) / 1.65);
  return clamp01(splashIn * fadeOut * 0.90);
}

function filmAt(time) {
  const splashIn = smoothstep(time / 0.08);
  const drain = 1 - smoothstep((time - 0.22) / 0.78);
  return clamp01(splashIn * drain * 0.78);
}

export function triggerWetGlass() {
  state.active = true;
  state.time = 0;
  state.amount = 0;
  state.film = 0;
  uniforms.uTime.value = 0;
  uniforms.uWetAmount.value = 0;
  uniforms.uFilmAmount.value = 0;
}

export function resetWetGlass() {
  state.active = false;
  state.time = 0;
  state.amount = 0;
  state.film = 0;
  uniforms.uTime.value = 0;
  uniforms.uWetAmount.value = 0;
  uniforms.uFilmAmount.value = 0;
}

export function updateWetGlass(dt) {
  if (!state.active) return;
  state.time = Math.min(WET_DURATION, state.time + Math.max(0, dt));
  state.amount = amountAt(state.time);
  state.film = filmAt(state.time);
  uniforms.uTime.value = state.time;
  uniforms.uWetAmount.value = state.amount;
  uniforms.uFilmAmount.value = state.film;
  if (state.time >= WET_DURATION) {
    state.active = false;
    state.amount = 0;
    state.film = 0;
    uniforms.uWetAmount.value = 0;
    uniforms.uFilmAmount.value = 0;
  }
}

/** Set an exact frame for the opt-in Door 3 FX lab. */
export function seekWetGlass(time) {
  const nextTime = Math.max(0, Math.min(WET_DURATION, Number(time) || 0));
  state.active = nextTime < WET_DURATION;
  state.time = nextTime;
  state.amount = amountAt(nextTime);
  state.film = filmAt(nextTime);
  uniforms.uTime.value = nextTime;
  uniforms.uWetAmount.value = state.amount;
  uniforms.uFilmAmount.value = state.film;
  return wetGlassSnapshot();
}

function syncTargetSize() {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const width = Math.max(1, Math.floor(size.x));
  const height = Math.max(1, Math.floor(size.y));
  if (width === state.targetWidth && height === state.targetHeight) return;
  state.targetWidth = width;
  state.targetHeight = height;
  target.setSize(width, height);
  uniforms.uResolution.value.set(width, height);
}

/** Render directly when dry; pay for the extra scene pass only while wet. */
export function renderWithWetGlass(world, camera) {
  if (!state.active || state.amount <= 0.001) {
    renderer.setRenderTarget(null);
    renderer.render(world, camera);
    return false;
  }
  syncTargetSize();
  renderer.setRenderTarget(target);
  renderer.render(world, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCamera);
  return true;
}

export function wetGlassSnapshot() {
  return {
    active: state.active,
    time: +state.time.toFixed(2),
    amount: +state.amount.toFixed(3),
    film: +state.film.toFixed(3),
    blurSamples: BLUR_SAMPLES,
    layerCount: LAYER_COUNT,
    referenceProfile: REFERENCE_PROFILE,
    distortionStrength: REFERENCE_DISTORTION,
    blurRadius: REFERENCE_BLUR_RADIUS,
    fullPane: true,
    continuousTrailMask: true,
    seed: FIXED_SEED,
    targetColorSpace: target.texture.colorSpace,
    toneMapped: material.toneMapped,
    targetSize: [state.targetWidth, state.targetHeight],
  };
}
