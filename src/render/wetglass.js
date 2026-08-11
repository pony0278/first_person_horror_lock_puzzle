/* One-shot wet-vision pass for Door 3's pipe rupture.
 *
 * The droplet/trail field keeps the reference Layer() construction, but the
 * effect is deliberately short-lived and edge-weighted. It reads the actual
 * rendered pump room, so lamps, pipes, and controls refract inside the water
 * instead of looking like DOM bubbles pasted over the game.
 */
import * as THREE from 'three';
import { renderer } from './scene.js';

const WET_DURATION = 4;
const BLUR_SAMPLES = 8;
const FIXED_SEED = 1842;

const target = new THREE.WebGLRenderTarget(1, 1, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: true,
  stencilBuffer: false,
});
target.texture.colorSpace = THREE.SRGBColorSpace;
target.texture.name = 'door3-wet-glass-scene';

const uniforms = {
  uScene: { value: target.texture },
  uTime: { value: 0 },
  uWetAmount: { value: 0 },
  uFilmAmount: { value: 0 },
  uSeed: { value: FIXED_SEED },
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

  #define PI2 6.28318530718
  #define S(a,b,n) smoothstep(a,b,n)

  float N12(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345 + uSeed * 0.0001);
    return fract(p.x * p.y);
  }

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
    x += (0.4 - abs(x)) * sin(3.0 * w) * pow(sin(w), 6.0) * 0.45;
    float y = -sin(t + sin(t + sin(t) * 0.5)) * 0.44;
    y -= (gv.x - x) * (gv.x - x);

    vec2 dropPos = (gv - vec2(x, y)) / asp;
    float drop = S(0.035, 0.018, length(dropPos));
    vec2 trailPos = (gv - vec2(x, t * 0.25)) / asp;
    trailPos.y = (fract(trailPos.y * 8.0) - 0.5) / 8.0;
    float trail = S(0.022, 0.012, length(trailPos));
    float fogTrail = S(-0.05, 0.05, dropPos.y);
    fogTrail *= S(0.5, y, gv.y);
    trail *= fogTrail;
    fogTrail *= S(0.032, 0.014, abs(dropPos.x));

    return vec3(drop * dropPos + trail * trailPos, max(drop, fogTrail));
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 1.80;
    vec3 drops = Layer(uv, t);

    // The splash lives mostly above the eyebrows and at the periphery. The
    // centre-lower console stays readable throughout the four-second effect.
    float topMask = S(0.52, 0.94, uv.y);
    float sideMask = S(0.28, 0.49, abs(uv.x - 0.5));
    float edgeMask = clamp(max(topMask, sideMask * 0.72), 0.0, 1.0);
    float consoleClear = S(0.18, 0.38,
      length(vec2((uv.x - 0.5) * 0.82, (uv.y - 0.42) * 1.20)));
    float coverage = edgeMask * consoleClear;

    drops.xy *= coverage;
    drops.z *= coverage;
    float film = uFilmAmount * topMask *
      (0.62 + 0.38 * sin(uv.x * 19.0 + uv.y * 7.0));
    float dropMask = clamp(drops.z * 1.22 + length(drops.xy) * 31.0 + film, 0.0, 1.0);

    vec2 filmNormal = vec2(
      N12(floor(uv * vec2(19.0, 11.0))) - 0.5,
      N12(floor(uv.yx * vec2(13.0, 17.0)) + 4.0) - 0.5
    ) * film * 0.006;
    vec2 refractUv = clamp(
      uv + (drops.xy * 0.72 + filmNormal * 0.68) * uWetAmount,
      vec2(0.002), vec2(0.998)
    );

    vec4 base = texture2D(uScene, uv);
    vec4 wet = vec4(0.0);
    float blur = 0.00105 * dropMask * uWetAmount;
    float angle = N12(uv + uSeed) * PI2;
    for (int i = 0; i < ${BLUR_SAMPLES}; i++) {
      float fi = float(i);
      float radius = sqrt((fi + 0.5) / ${BLUR_SAMPLES.toFixed(1)});
      vec2 offset = vec2(sin(angle), cos(angle)) * blur * radius;
      wet += texture2D(uScene, clamp(refractUv + offset, vec2(0.002), vec2(0.998)));
      angle += 2.39996323;
    }
    wet /= ${BLUR_SAMPLES.toFixed(1)};

    float effect = clamp(uWetAmount * coverage * (0.18 + dropMask * 0.62), 0.0, 0.72);
    vec3 colour = mix(base.rgb, wet.rgb, effect);
    float rim = S(0.18, 0.82, dropMask) * (1.0 - S(0.80, 1.0, dropMask));
    colour += vec3(0.035, 0.055, 0.06) * rim * uWetAmount * coverage;
    gl_FragColor = vec4(colour, 1.0);
  }
`;

const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader,
  fragmentShader,
  depthTest: false,
  depthWrite: false,
  toneMapped: false,
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

function syncTargetSize() {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const width = Math.max(1, Math.floor(size.x));
  const height = Math.max(1, Math.floor(size.y));
  if (width === state.targetWidth && height === state.targetHeight) return;
  state.targetWidth = width;
  state.targetHeight = height;
  target.setSize(width, height);
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
    seed: FIXED_SEED,
    targetSize: [state.targetWidth, state.targetHeight],
  };
}
