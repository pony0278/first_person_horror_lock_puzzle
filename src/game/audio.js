/* 音效：全部用 Web Audio 即時合成，無音檔。
   設計文件 §9：聲音是加速器，不是必需品 —— 每個事件都有視覺對應。 */



export let actx = null;
let wetStepBuffer = null;
let wetStepBufferContext = null;
let wetStepBufferBuilds = 0;

/* iOS Safari 與 Chrome Android 只允許在使用者手勢中啟動 AudioContext。
   開場演出（beep('tap') / beep('thunk')）發生在任何手勢之前，因此 context
   會以 suspended 建立，而且不會自己恢復 —— 手機上等於全程無聲。
   在第一次觸控／按鍵時補一次 resume；不用 once，因為切到背景後 iOS 會再次 suspend。 */
export function unlockAudio() {
  actx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state !== 'running') actx.resume().catch(() => {});
}
for (const ev of ['pointerdown', 'touchstart', 'keydown'])
  addEventListener(ev, unlockAudio, { capture: true, passive: true });

export function beep(kind) {
  actx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume().catch(() => {});
  const t = actx.currentTime;
  const P = { set:['square',1750,6000,.20], falseSet:['square',1180,1300,.16],
              error:['sawtooth',150,800,.10], release:['triangle',320,2000,.10],
              severe:['sawtooth',70,400,.30], face:['sawtooth',58,240,.34], thunk:['square',82,480,.30], solved:['triangle',520,4000,.22],
              death:['sine',48,300,.40] }[kind];
  if (!P) return;
  const o = actx.createOscillator(), g = actx.createGain(), f = actx.createBiquadFilter();
  o.connect(f); f.connect(g); g.connect(actx.destination);
  f.type = 'lowpass'; o.type = P[0]; o.frequency.value = P[1]; f.frequency.value = P[2];
  g.gain.setValueAtTime(P[3], t);
  g.gain.exponentialRampToValueAtTime(.0001, t + (kind === 'solved' || kind === 'death' ? .6 : .1));
  o.start(t); o.stop(t + .7);
}

/** 電流爬升的短促電擊聲。pitch 0~1 —— 爬得越遠音越高，
    回頭時用聽的就知道解到哪（門 2 的盤面在身後看不到）。 */
export function zap(pitch = 0) {
  actx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume().catch(() => {});
  const t = actx.currentTime;
  const o = actx.createOscillator(), g = actx.createGain(), f = actx.createBiquadFilter();
  o.connect(f); f.connect(g); g.connect(actx.destination);
  o.type = 'sawtooth'; o.frequency.value = 420 + 1500 * pitch;
  f.type = 'lowpass'; f.frequency.value = 2800;
  g.gain.setValueAtTime(0.06, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  o.start(t); o.stop(t + 0.1);
}

function getWetStepBuffer() {
  if (wetStepBuffer && wetStepBufferContext === actx) return wetStepBuffer;
  const duration = 0.13;
  const frames = Math.max(1, Math.floor(actx.sampleRate * duration));
  const buffer = actx.createBuffer(1, frames, actx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    const p = i / frames;
    const envelope = Math.sin(Math.PI * Math.min(1, p * 2.2)) * Math.pow(1 - p, 2.2);
    data[i] = (Math.random() * 2 - 1) * envelope;
  }
  wetStepBuffer = buffer;
  wetStepBufferContext = actx;
  wetStepBufferBuilds++;
  return buffer;
}

/** Short procedural wet footfall used by the flooded Door 3 connector. */
export function wetStep(strength = 1) {
  actx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume().catch(() => {});
  const t = actx.currentTime;
  const source = actx.createBufferSource();
  const filter = actx.createBiquadFilter();
  const gain = actx.createGain();
  source.buffer = getWetStepBuffer();
  source.playbackRate.value = 0.92 + Math.random() * 0.16;
  filter.type = 'lowpass';
  filter.frequency.value = 720 + Math.random() * 120;
  gain.gain.value = Math.max(0.025, Math.min(0.075, 0.052 * strength));
  source.connect(filter); filter.connect(gain); gain.connect(actx.destination);
  source.start(t);
}

/** 給測試接點讀的音訊狀態。不直接輸出 actx，避免其他模組拿去亂改。 */
export const audioState = () => (actx ? actx.state : 'not-created');
export const audioPerformanceState = () => ({ wetStepBufferBuilds });
