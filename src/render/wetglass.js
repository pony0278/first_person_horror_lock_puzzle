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
const LAYER_COUNT = 3;

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

  vec3 Layer(vec2 uv0, float t, float scale, float fallSpeed, float seedOffset) {
    vec2 asp = vec2(max(1.0, uResolution.x / uResolution.y), 1.0);
    vec2 uv1 = uv0 * scale * asp;
    uv1.y += t * fallSpeed;
    vec2 gv = fract(uv1) - 0.5;
    vec2 id = floor(uv1);

    float n = N12(id + seedOffset);
    t += n * PI2;
    float w = uv0.y * 10.0;
    float x = (n - 0.5) * 0.8;
    x += (0.4 - abs(x)) * sin(3.0 * w) * pow(sin(w), 6.0) * 0.45;
    float y = -sin(t + sin(t + sin(t) * 0.5)) * 0.44;
    y -= (gv.x - x) * (gv.x - x);

    vec2 dropPos = (gv - vec2(x, y)) / asp;
    float drop = S(0.035, 0.018, length(dropPos));
    vec2 trailPos = (gv - vec2(x, t * fallSpeed)) / asp;
    trailPos.y = (fract(trailPos.y * 8.0) - 0.5) / 8.0;
    float trail = S(0.022, 0.012, length(trailPos));
    float fogTrail = S(-0.05, 0.05, dropPos.y);
    fogTrail *= S(0.5, y, gv.y);
    trail *= fogTrail;
    fogTrail *= S(0.032, 0.014, abs(dropPos.x));

    // Trails still bend the scene slightly, but only the actual droplet body
    // receives the blue rim. Highlighting the repeated trail samples creates
    // an artificial dotted-string pattern on dark backgrounds.
    return vec3(drop * dropPos + trail * trailPos, drop);
  }

  vec3 HeroDrop(vec2 uv, vec2 centre, float radius, float tailLength) {
    vec2 aspect = vec2(max(1.0, uResolution.x / uResolution.y), 1.0);
    vec2 p = (uv - centre) * aspect;
    p.y += min(0.22, uTime * 0.035);
    p.x += sin(p.y * 47.0 + centre.x * 31.0) * radius * 0.07;
    float bodyDistance = length(vec2(p.x * 1.08, p.y * 0.88));
    float body = S(radius, radius * 0.72, bodyDistance);
    float tailWidth = radius * 0.30;
    float tail = S(tailWidth, tailWidth * 0.42, abs(p.x));
    tail *= S(tailLength, 0.0, max(0.0, p.y));
    tail *= S(-radius * 0.12, radius * 0.56, p.y);
    float mask = max(body, tail * 0.78);
    // Hero drops guarantee a readable silhouette but must not magnify a lamp
    // into a large black lens. Their normal is intentionally proportional to
    // the small local offset rather than normalized to unit length.
    vec2 normal = p * 0.12;
    normal.y -= tail * radius * 0.08;
    return vec3(normal * mask, mask);
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 1.80;
    vec3 largeDrops = Layer(uv + vec2(0.015, 0.0), t * 0.72, 2.15, 0.18, 13.0);
    vec3 mediumDrops = Layer(uv + vec2(-0.021, 0.013), t, 3.40, 0.25, 41.0);
    vec3 smallDrops = Layer(uv + vec2(0.008, -0.018), t * 1.18, 5.10, 0.31, 73.0);
    vec3 heroes = HeroDrop(uv, vec2(0.37, 0.82), 0.047, 0.12);
    heroes += HeroDrop(uv, vec2(0.53, 0.89), 0.035, 0.09);
    heroes += HeroDrop(uv, vec2(0.66, 0.76), 0.042, 0.11);
    vec3 drops;
    drops.xy = largeDrops.xy * 0.86 + mediumDrops.xy * 0.72 +
      smallDrops.xy * 0.42 + heroes.xy * 0.54;
    drops.z = clamp(max(max(largeDrops.z, mediumDrops.z * 0.92),
      max(smallDrops.z * 0.72, heroes.z)), 0.0, 1.0);

    // Keep the lower operator controls readable, but allow water across the
    // upper centre so the effect reads immediately instead of hiding entirely
    // in the dark periphery.
    float topMask = S(0.40, 0.90, uv.y);
    float sideMask = S(0.27, 0.49, abs(uv.x - 0.5));
    float upperField = clamp(max(topMask * 0.92, sideMask * 0.66), 0.0, 1.0);
    float consoleClear = S(0.14, 0.34,
      length(vec2((uv.x - 0.5) * 0.95, (uv.y - 0.23) * 1.72)));
    float coverage = max(upperField, heroes.z * 0.92) * consoleClear;

    drops.xy *= coverage;
    drops.z *= coverage;
    float splashWave = 0.76 + 0.24 * sin(uv.x * 17.0 + uv.y * 8.0 + uTime * 4.0);
    float splashSheet = uFilmAmount * S(0.34, 0.94, uv.y +
      sin(uv.x * 11.0 + uTime * 7.0) * 0.055) * splashWave * consoleClear;
    float edgeFilm = uFilmAmount * max(topMask, sideMask * 0.58) * 0.46;
    float film = clamp(splashSheet + edgeFilm, 0.0, 1.0);
    float dropMask = clamp(drops.z * 1.18 + length(drops.xy) * 24.0 + film, 0.0, 1.0);

    vec2 filmNormal = vec2(
      N12(floor(uv * vec2(19.0, 11.0))) - 0.5,
      N12(floor(uv.yx * vec2(13.0, 17.0)) + 4.0) - 0.5
    ) * film * 0.006;
    vec2 refractUv = clamp(
      uv + (drops.xy * 0.035 + filmNormal * 0.25) * uWetAmount,
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

    float effectCoverage = max(coverage, film * 0.86);
    float effect = clamp(uWetAmount * effectCoverage * (0.12 + dropMask * 0.34), 0.0, 0.38);
    vec3 colour = mix(base.rgb, wet.rgb, effect);
    float dropRim = S(0.08, 0.40, drops.z) * (1.0 - S(0.58, 0.94, drops.z));
    float filmRim = S(0.10, 0.46, film) * (1.0 - S(0.70, 0.98, film));
    float waterBody = clamp(drops.z * 0.42 + film * 0.18, 0.0, 1.0) *
      uWetAmount * consoleClear;
    float waterHighlight = (dropRim + filmRim * 0.38) * uWetAmount *
      max(coverage, film * 0.72);
    colour += vec3(0.045, 0.082, 0.098) * waterBody;
    colour += vec3(0.16, 0.245, 0.275) * waterHighlight;
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
    seed: FIXED_SEED,
    targetColorSpace: target.texture.colorSpace,
    toneMapped: material.toneMapped,
    targetSize: [state.targetWidth, state.targetHeight],
  };
}
