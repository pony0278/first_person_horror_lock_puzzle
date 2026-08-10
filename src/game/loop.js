/* 主迴圈：開場演出、視角、站位推進、環境升壓、渲染。 */

import * as THREE from 'three';
import { CFG } from '../logic/config.js';
import { RollingFrameTime } from '../logic/door3-performance.js';
import { $dev, $panel, $pins, view } from '../dom.js';
import { drawCutaway, renderPins, sizeCut, tracks } from '../render/cutaway.js';
import { decay, decayStages, envLevel, lamp, lampFixture, reflection, seepUni } from '../render/decay.js';
import { hd, updateHands } from '../render/hands.js';
import { flash3d, markerLight, markerMat, vig, vigMat } from '../render/hintwall.js';
import { FACE_DROP, MP, monster, monsterHead, monsterTorso } from '../render/monster.js';
import { camera, cylinder, door, doorLever, dust, keyEye, pickTool, renderer, scene, wrench } from '../render/scene.js';
import { R, ST, anim, blind, hooks, intro, look, pick, ui } from '../state.js';
import { beep } from './audio.js';
import { interrupted } from './halt.js';
import { die } from './round.js';
import { T, cinematic, updateTransit } from './transit.js';
import { D2, updateDoor2 } from './door2-circuit.js';
import { D3, updateDoor3 } from './door3.js';
import { debugThreatFrozen, updateDebug } from './debug.js';
/* ═══════════════════════════════════════════════════════════
   主迴圈
   ═══════════════════════════════════════════════════════════ */

export const clock = new THREE.Clock();
const door3FrameTimes = new RollingFrameTime();
let door3LastFrameAt = null;

const isThreatFrozen = () =>
  (R.door === 2 && D2.awaitingFuse) ||
  R.timer.pauseReasons.includes('probe') ||
  debugThreatFrozen();

hooks.resetDoor3FrameTimes = () => {
  door3FrameTimes.reset();
  door3LastFrameAt = null;
};
hooks.door3FrameTimes = () => door3FrameTimes.snapshot();

/* anim.timeScale 已併入 anim（見上方 ui/anim 的說明） */
export function tick(frameAt) {
  const frameNow = Number.isFinite(frameAt) ? frameAt : performance.now();
  if (D3.active) {
    if (door3LastFrameAt !== null) door3FrameTimes.record(frameNow - door3LastFrameAt);
    door3LastFrameAt = frameNow;
  } else door3LastFrameAt = null;

  let dt = Math.min(clock.getDelta(), 0.05);
  dt *= anim.timeScale * anim.debugScale;

  // 中斷期間不推進任何演出。clock.getDelta() 仍要照呼叫，
  // 否則恢復那一刻會累積出一個超大的 dt。
  if (interrupted()) dt = 0;

  // 門與門之間的過場（R.over=true 期間由這裡驅動鏡頭與姿態）
  if (T.active) updateTransit(dt);

  if (!R.over) {
    if (hd.on) R.timer.hold();                     // debug 中計時凍結
    if (intro.active) {
      intro.t += dt;
      R.timer.hold();                                    // 開場期間計時器不啟動
      const I = CFG.intro;

      if (intro.phase === 'run') {
        const p = Math.min(1, intro.t / I.runSec);
        intro.z = I.runFrom * Math.pow(1 - p, 1.55);     // 起步快、到門前減速
        const speedF = 0.35 + (1 - p);
        intro.bobPhase += dt * I.bobFreq * speedF;
        intro.bobY = Math.sin(intro.bobPhase * 2) * I.bobAmp * speedF;
        intro.roll = Math.sin(intro.bobPhase) * I.rollAmp * speedF;
        intro.arriveF = p * p;

        // 經過提示牆：角色轉頭看一眼 + 子彈時間。
        // 有號距離的非對稱梯形：提前減速、過了牆就快速恢復。
        const d = intro.z - CFG.paint.wallZ;              // 正 = 還沒到
        const ss = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
                                  return u * u * (3 - 2 * u); };
        const g = d >= I.glanceEnter ? 0
                : d >= I.glanceFull  ? ss(I.glanceEnter, I.glanceFull, d)
                : d >= I.glancePast  ? 1
                : d >= I.glanceExit  ? ss(I.glanceExit, I.glancePast, d)
                : 0;

        // 頭跟著牆轉：遠時角度小，牆到身側時最大 —— 起訖點自然
        const ahead = Math.max(0.2, d);
        const trackYaw = Math.min(I.glanceMaxYaw,
          THREE.MathUtils.radToDeg(Math.atan2(CFG.world.corridorW / 2, ahead)));
        look.yaw = trackYaw * g;
        anim.timeScale = 1 - (1 - I.glanceSlow) * g;
        if (!intro.beeped && d < I.glanceEnter) { intro.beeped = true; beep('tap'); }

        if (p >= 1) { intro.phase = 'handle'; intro.t = 0; intro.z = 0;
                      intro.bobY = 0; intro.roll = 0; look.yaw = 0; anim.timeScale = 1; }
      }

      else if (intro.phase === 'handle') {
        intro.arriveF = 1;
        const p = Math.min(1, intro.t / I.handleSec);
        // 兩次壓把手：把手下壓、門晃動、金屬悶響 —— 鎖死了
        const pulse = (a, b) => p > a && p < b ? Math.sin((p - a) / (b - a) * Math.PI) : 0;
        const press = pulse(0.06, 0.42) + pulse(0.52, 0.88);
        intro.press = press;
        doorLever.rotation.z = -0.55 * press;
        door.position.x = press > 0.6 ? Math.sin(intro.t * 55) * 0.004 : 0;
        if (!intro.th1 && p > 0.10) { intro.th1 = true; beep('thunk'); }
        if (!intro.th2 && p > 0.56) { intro.th2 = true; beep('thunk'); }
        if (p >= 1) { intro.phase = 'tool'; intro.t = 0; intro.press = 0; doorLever.rotation.z = 0; door.position.x = 0; }
      }

      else if (intro.phase === 'tool') {
        // 門鎖死了 —— 掏出工具：扳手先入孔，撬針跟上
        const p = Math.min(1, intro.t / I.toolSec);
        const ease = x => x * x * (3 - 2 * x);
        const wp = Math.min(1, p / 0.5);                  // 前半：扳手
        const pp = Math.max(0, (p - 0.40) / 0.6);         // 後半：撬針（略重疊）
        wrench.visible = true;
        wrench.position.z = 0.12 * (1 - ease(wp));
        if (pp > 0) { pickTool.visible = true; pickTool.position.z = 0.12 * (1 - ease(pp)); }
        if (!intro.thTool && wp >= 1) { intro.thTool = true; beep('release'); }   // 扳手到位的輕響
        if (p >= 1) {
          pickTool.position.z = wrench.position.z = 0;
          intro.active = false; look.target = 0;
        }
      }
    }
    R.elapsed = R.timer.elapsed;
    if (look.holding) R.lookTime += dt * 1000;
  }

  // 視角
  const k = 1 - Math.exp(-CFG.look.returnSpeed * dt);
  look.yaw += (look.target - look.yaw) * k;
  const toolDip = intro.active && intro.phase === 'tool' ? -2.5 : 0;
  const pitch = (-7 * intro.arriveF + toolDip) * (1 - Math.min(1, Math.abs(look.yaw) / 90));
  camera.rotation.set(THREE.MathUtils.degToRad(pitch),
                      THREE.MathUtils.degToRad(look.yaw),
                      THREE.MathUtils.degToRad(intro.roll || 0), 'YXZ');
  const standX = 0.30 * intro.arriveF * (1 - Math.min(1, Math.abs(look.yaw) / 90));
  // Door 3 shares world coordinates with Door 2. Keep the pump-hub centre as
  // the exploration origin after the run ends instead of snapping the camera
  // back to z=0 (the Door 2 threshold).
  const camZ = R.door === 3
    ? intro.z
    : intro.active && intro.phase === 'run' ? intro.z : 0;
  camera.position.set(standX,
    1.60 + intro.bobY + Math.sin(performance.now() / 900) * 0.006, camZ);
  // Door 2 找件前沿用上一回合的 R.over 凍結計時，但盤面要看得見；仍由 pointer handler
  // 擋操作。回頭、運鏡、中斷，以及其餘真正結束狀態才壓暗面板。
  const door2Preview = D2.active && D2.doneT < 0 && R.over && R.won && T.phase === 'door2';
  $panel.classList.toggle('blind',
    blind() || (R.over && !door2Preview) || intro.active || interrupted());

  // 鎖芯：事實層。鑰匙孔與兩支工具都掛在它底下，一起轉。
  cylinder.rotation.z = -THREE.MathUtils.degToRad(R.lock.cylinderDeg);

  // 撬針在孔內的行程：橫向選栓（幅度很小，不能離開孔）＋ 上頂
  {
    const n = Math.max(1, CFG.lock.pinCount - 1);
    const tx = (ui.sel / n - 0.5) * 0.034;                 // 孔寬之內
    const st = R.lock.pins[ui.sel];
    const base = st === 'idle' ? 0 : st === 'partial' ? 0.006 : 0.014;
    const ty = -0.010 + base + pick.lift * 0.008;
    const kd = 1 - Math.exp(-16 * dt);
    pickTool.position.x += (tx - pickTool.position.x) * kd;
    pickTool.position.y += (ty - pickTool.position.y) * kd;
    // 沒入深度隨頂針動作微調，讀得出「正在使力」
    pickTool.userData.shaft.position.z = 0.030 - pick.lift * 0.006;
    // 張力扳手：施力時柄微微下沉
    wrench.rotation.z = -0.02 - pick.lift * 0.03;
  }

  // 提示牆指示燈：平時慢速呼吸，奔跑接近時急閃
  {
    const nearWall = intro.active && intro.phase === 'run' &&
                     Math.abs(intro.z - CFG.paint.wallZ) < 2.4;
    const hz = nearWall ? 9 : 1.1;
    const p = Math.max(0, Math.sin(performance.now() / 1000 * hz * 6.283)) ** 2;
    markerMat.color.setRGB(0.85 * (0.25 + 0.75 * p), 0.70 * (0.25 + 0.75 * p), 0.35 * (0.25 + 0.75 * p));
    markerLight.intensity = (nearWall ? 1.6 : 0.5) * p;
  }

  seepUni.uTime.value += dt / Math.max(0.05, anim.timeScale);   // 真實時間，不吃慢動作

  // 灰塵緩慢飄動
  dust.rotation.y += dt * 0.012;
  dust.position.y = Math.sin(performance.now() / 4200) * 0.05;

  // 怪物：誠實的等速接近
  const f = Math.min(1, R.elapsed / R.limit);

  // ── 怪物：離散站位。移動只發生在玩家低頭時 ──────────
  {
    const S = CFG.stations, D = CFG.dread;
    // Door 2's replacement pickup is mandatory. Its fixed one-station advance
    // is already paid at burnout, so no lethal face/lurk progression may run
    // while the player is forced to look away from the board.
    const threatFrozen = isThreatFrozen();

    // 該到下一站了嗎
    let want = 0;
    for (let i = 0; i < ST.thresholds.length; i++) if (R.elapsed >= ST.thresholds[i]) want = i + 1;
    want = Math.min(want, S.z.length - 1);
    if (want > ST.index && !R.over && !threatFrozen) ST.pendingJump = true;

    // 凝視計時：一直盯著會鎖住牠，但鎖不了太久
    ST.stareT = !threatFrozen && blind() ? ST.stareT + dt : 0;
    const stareForced = ST.pendingJump && ST.stareT > S.stareLimit;

    // 換站條件：玩家沒在看，或凝視太久（此時藉燈閃遮掩位移）
    if (ST.pendingJump && (!blind() || stareForced)) {
      ST.index = Math.min(ST.index + 1, want);      // 一次只前進一站，不跳過任何一站
      ST.targetZ = S.z[ST.index];
      ST.moveT = S.settleMs / 1000;
      ST.pendingJump = ST.index < want;             // 還沒追上就留著，下一個時機繼續
      if (stareForced) { ST.blink = S.blinkSec; ST.stareT = 0; }
    }
    if (ST.blink > 0) ST.blink -= dt;
    // 環境劣化：同一條規則，只在低頭時發生。
    // 讀 envLevel 而不是 ST.index —— 門 2 的環境已經是等級 2，但怪物的站位從 0 重新開始。
    while (decay.applied < envLevel(ST.index) && !blind()) {
      decayStages[decay.applied]?.();
      decay.applied++;
      window.__applySeep(CFG.seep.level[decay.applied] ?? 0);
    }
    // ── 潛伏：抵達最後一站後，牠不在那裡 ──────────────
    // 每次回頭看到空走廊算一次；累積夠了，下一次回頭牠就貼在你臉上。
    // 觸發權在玩家手上，所以絕不會錯過，而且愛看的人比較快遇到。
    if (!threatFrozen && ST.phase === 'off' && ST.index >= S.z.length - 1 && !R.over) {
      ST.phase = 'lurk'; ST.glanceT = 0; ST.counted = false;
    }

    if (ST.phase === 'lurk' && !threatFrozen) {
      if (blind()) {
        ST.glanceT += dt;
        // 看滿門檻算一次；持續盯著的話每隔一段再算一次（盯空走廊也是一種空無）
        const due = ST.counted ? S.lurkGlanceMin + S.lurkStareRecount : S.lurkGlanceMin;
        if (ST.glanceT >= due) {
          ST.counted = true; ST.glanceT = S.lurkGlanceMin;
          ST.emptyGot++;
          if (ST.emptyGot >= ST.emptyNeed) { ST.phase = 'armed'; ST.armedT = 0; }
        }
      } else { ST.glanceT = 0; ST.counted = false; }
    }
    else if (ST.phase === 'armed' && !threatFrozen) {
      // 兩種兌現方式：轉回門鎖後再回頭，或盯著空走廊盯到牠出現
      if (!blind()) { ST.readyOff = true; ST.armedT = 0; }
      else ST.armedT += dt;
      if (blind() && (ST.readyOff || ST.armedT > S.armedStareSec)) {
        ST.phase = 'face'; ST.faceT = 0;
        ST.faceMode = Math.random() < 0.5 ? 0 : 1;   // 0 = 已經在那裡, 1 = 從下方升起
        ST.front = null; keyEye.visible = false;
        reflection.mesh.visible = false; doorLever.rotation.z = 0; door.position.x = 0;
        beep('face');
      }
    }
    else if (ST.phase === 'face' && !threatFrozen) {
      ST.faceT += dt;
      // 保底：整局沒遇過正面事件的人（例如全程盯著走廊），
      // 在極限窗口轉回門鎖的瞬間補一次門把 —— 出路也不安全。
      if (ST.frontLeft > 0 && !ST.front && !blind() && ST.faceT > 0.05) {
        ST.front = R.door === 2 ? 'glitch' : 'lever';
        ST.frontT = 0; ST.frontLeft = 0; beep('thunk');
      }
    }

    // ── 正面事件：潛伏期間，威脅也會出現在門這一側 ──────
    // 絕不致命、絕不擋操作 —— 純粹告訴你「正面也不安全」。
    if (ST.frontCool > 0 && !threatFrozen) ST.frontCool -= dt;
    if (!ST.front && ST.frontLeft > 0 && ST.frontCool <= 0 &&
        (ST.phase === 'lurk' || ST.phase === 'armed') && !blind() && !R.over && !threatFrozen) {
      ST.front = ST.frontPool[(S.frontMax - ST.frontLeft) % ST.frontPool.length];
      ST.frontT = 0; ST.frontLeft--;
      if (ST.front === 'lever' || ST.front === 'glitch') beep('thunk');
      if (ST.front === 'badge') beep('error');      // 讀卡機拒絕的短促電子雜音
    }

    if (ST.front && !threatFrozen) {
      ST.frontT += dt;
      const dur = ST.front === 'eye'    ? S.frontDurEye
                : ST.front === 'refl'   ? S.frontDurRefl
                : ST.front === 'badge'  ? S.frontDurBadge
                : ST.front === 'glitch' ? S.frontDurGlitch : S.frontDurLever;
      const p = Math.min(1, ST.frontT / dur);
      const fade = Math.min(1, p / 0.12) * (1 - Math.min(1, Math.max(0, (p - 0.80) / 0.20)));

      if (ST.front === 'eye') {
        keyEye.visible = true;
        // 眨眼：兩次，眼瞼從上下闔起
        const blinkAt = [0.34, 0.72];
        let lid = 0;
        for (const b of blinkAt) {
          const d = Math.abs(p - b);
          if (d < 0.055) lid = Math.max(lid, 1 - d / 0.055);
        }
        const open = 0.019 * (1 - lid * 0.92);
        keyEye.userData.lidT.position.y = open;
        keyEye.userData.lidB.position.y = -open;
        keyEye.userData.iris.position.x = Math.sin(ST.frontT * 1.6) * 0.0016;   // 緩慢掃視
        if (p >= 1) { keyEye.visible = false; ST.front = null; ST.frontCool = S.frontGapSec; }
      }
      else if (ST.front === 'refl') {
        reflection.mesh.visible = true;
        reflection.mat.opacity = 0.62 * fade;
        reflection.mesh.position.x = 0.20 + Math.sin(ST.frontT * 2.3) * 0.012;   // 水面擾動
        reflection.mesh.scale.y = 1.15 + Math.sin(ST.frontT * 1.7) * 0.03;
        if (p >= 1) { reflection.mesh.visible = false; ST.front = null; ST.frontCool = S.frontGapSec; }
      }
      else if (ST.front === 'badge' || ST.front === 'glitch') {
        // 門 2 專屬。視覺在 render/doorpanel.js —— 它已經每幀在驅動同一批材質，
        // 兩邊各畫各的會打架，所以這裡只管生命期。
        if (p >= 1) { ST.front = null; ST.frontCool = S.frontGapSec; }
      }
      else {  // lever：門把從另一側被壓下，門在框裡晃
        const press = Math.sin(Math.min(1, p / 0.7) * Math.PI);
        doorLever.rotation.z = -0.5 * press;
        door.position.x = press > 0.5 ? Math.sin(ST.frontT * 61) * 0.004 : 0;
        if (p >= 1) {
          doorLever.rotation.z = 0; door.position.x = 0;
          ST.front = null; ST.frontCool = S.frontGapSec;
        }
      }
    }

    // 站位可見性 + 微生命（可見時：呼吸與歪頭，但絕不前進）
    let vis = S.vis[ST.index] > 0;
    if (ST.phase === 'lurk' || ST.phase === 'armed') vis = false;   // 潛伏中：空的
    if (ST.phase === 'face') vis = true;
    if (vis && blind()) ST.seen = true;             // 記錄玩家真的看到過
    if (ST.index >= S.z.length - 1 && !ST.seen && ST.phase === 'off') vis = true;
    // R.over 以前一體兩用（死亡演出／過場凍結），這裡拆開：
    //   死亡演出 = R.over && !R.won —— 死時牠留在原地讓你看清楚。
    //   運鏡中   = cinematic() —— 只有 transit 拉著鏡頭跑的那幾個階段，
    //              計時器凍結時牠不該出現（怪物是計時器的唯一顯示，§6，
    //              不動的怪物是謊言）。門 2 的互動階段不算運鏡，牠照站位規則走。
    monster.visible = ((!R.over && vis && ST.blink <= 0) || (R.over && !R.won)) && !cinematic();

    // 貼臉：位置、升起演出、微微逼近
    if (ST.phase === 'face') {
      const rise = ST.faceMode === 1
        ? Math.min(1, ST.faceT / S.faceRiseSec) : 1;
      const ease = rise * rise * (3 - 2 * rise);
      monster.position.z = S.faceZ + 0.10 * (1 - ease);
      // 俯身湊到你的視線高度 —— 不是牠變矮，是牠彎下來看你
      monster.position.y = FACE_DROP * ease - 1.55 * (1 - ease);
      monster.rotation.y = 0;                  // 建構時已面向 -z（玩家方向）
      monster.position.x = Math.sin(ST.faceT * 2.2) * 0.012;
      monsterTorso.rotation.x = THREE.MathUtils.degToRad(MP.hunch * 0.55) * ease;
    } else {
      monster.position.y = 0;
      monsterTorso.rotation.x = 0;
    }
    if (monster.visible) {
      const b = Math.sin(R.elapsed * 1.7) * 0.5 + 0.5;
      monsterTorso.scale.y = 1 + b * 0.012;                    // 軀幹呼吸
      monsterTorso.rotation.z = Math.sin(R.elapsed * 0.31) * 0.008;
      monsterHead.rotation.z = THREE.MathUtils.degToRad(MP.headTilt) +
        Math.sin(R.elapsed * 0.43) * 0.06;                     // 頭永遠歪著
    }

    // 極短的位移：讀起來像瞬移，不像走路
    if (ST.moveT > 0) {
      ST.moveT = Math.max(0, ST.moveT - dt);
      const k = 1 - Math.exp(-16 * dt);
      ST.z += (ST.targetZ - ST.z) * k;
    } else ST.z = ST.targetZ;

    monster.position.set(0, 0, ST.z);
    monster.rotation.y = 0;                    // 面向 -z 即面向玩家（建構時已朝向）
  }
  const dist = ST.z;

  // 燈：壞掉的日光燈嗡嗡閃爍，且逐站變暗（世界在失去光）
  let lampF = 1;                               // 門 2 盤面吃同一條壞電路（v3 §7 燈閃耦合）
  {
    const dim = (CFG.seep.lampDim[envLevel(ST.index)] ?? 1) * (ST.blink > 0 ? 0.04 : 1);
    const buzz = 0.82 + 0.18 * Math.abs(Math.sin(R.elapsed * 23.7) * Math.sin(R.elapsed * 5.1));
    lamp.intensity = CFG.lamp.intensity * buzz * dim;
    lampFixture.userData.tube.material.color.setScalar(0.75 * buzz * dim);
    lampF = buzz * dim;
  }

  // 門 2 盤面：R.over 期間剖面圖那一段不會跑，盤面在這裡畫
  updateDoor2(dt, lampF);
  updateDoor3(dt);

  // ── 撬鎖面板承載威脅（Iron Lung 路線）──────────────
  // 門 2 的下方是雙線診斷盤（render/circuitboard.js 自己畫），這一段只屬於門 1。
  if (!R.over && R.door === 1) {
    const D = CFG.dread, i = ST.index;
    const amp = D.trackShake[i], hz = D.shakeHz[i], tint = D.tint[i];
    const t = performance.now() / 1000;
    const dx = amp ? Math.sin(t * hz * 6.283) * amp : 0;
    const dy = amp ? Math.cos(t * hz * 5.1) * amp * 0.6 : 0;

    if (CFG.ui.style === 'cutaway') {
      $pins.style.transform = amp ? `translate(${dx.toFixed(2)}px,${dy.toFixed(2)}px)` : '';
      drawCutaway(tint);                       // 每幀重畫，顫動與滲色即時反映
    } else {
      tracks.forEach((tr, k) => {
        const ox = amp ? Math.sin(t * hz * 6.283 + k * 1.7) * amp : 0;
        const oy = amp ? Math.cos(t * hz * 5.1 + k * 2.3) * amp * 0.6 : 0;
        tr.style.transform = amp ? `translate(${ox.toFixed(2)}px,${oy.toFixed(2)}px)` : '';
        tr.style.background = tint
          ? `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(140,30,26,${tint}) 100%)`
          : '';
      });
    }

    // 鎖芯自己回退半格
    if (i >= D.kickbackAt) {
      R.nextKick -= dt;
      if (R.nextKick <= 0) {
        R.nextKick = D.kickbackSec;
        const setPins = R.lock.pins.map((s, k) => s === 'set' ? k : -1).filter(k => k >= 0);
        if (setPins.length) {
          R.lock.release(setPins[setPins.length - 1]);
          beep('release'); renderPins();
        }
      }
    }
    // 未固定的針無故落下
    if (i >= D.dropAt) {
      R.nextDrop -= dt;
      if (R.nextDrop <= 0) {
        R.nextDrop = D.dropSec;
        const partial = R.lock.pins.map((s, k) => s === 'partial' ? k : -1).filter(k => k >= 0);
        if (partial.length) {
          R.lock.release(partial[(Math.random() * partial.length) | 0]);
          renderPins();
        }
      }
    }
  }

  // 死亡條件：
  //  · 臉已經出現 → 給 faceGraceSec 的極限窗口，那一秒還能解鎖活下來
  //  · 潛伏中但玩家一直不回頭 → 超時後強制兌現貼臉，再走同一條窗口
  if (!R.over && !isThreatFrozen()) {
    const S2 = CFG.stations;
    const overtime = R.elapsed > R.limit + CFG.round.grabMs / 1000;
    if (ST.phase === 'face') {
      if (ST.faceT > S2.faceGraceSec) {
        ST.z = ST.targetZ = S2.faceZ;
        die();
      }
    } else if (overtime) {
      ST.phase = 'face'; ST.faceT = 0; ST.faceMode = 0;   // 沒回頭的人也要見到牠
      ST.index = S2.z.length - 1;
      ST.z = ST.targetZ = S2.faceZ;
      monster.visible = true;
      beep('face');
    }
  }

  // 手電筒：near/far 隨轉頭角度過渡（曝光適應），加上閃爍
  {
    // Door 3 is an open pump hub rather than a lock at arm's length. Keep the
    // carried light on its long-range beam for the walk and later exploration;
    // otherwise it would fade back to the near-lock intensity at the hub centre.
    const runF = R.door === 3
      ? 1
      : intro.active && intro.phase === 'run' ? Math.min(1, intro.z / 2.5) : 0;
    const turnF = Math.max(runF, Math.min(1, Math.abs(look.yaw) / 110));
    const farDim = (intro.active ? 1 : (CFG.seep.farDim[envLevel(ST.index)] ?? 1)) * (ST.blink > 0 ? 0.10 : 1);
    const L = CFG.light, lerp = (a, b) => a + (b - a) * turnF;
    const flick = 1 - L.flicker * (Math.sin(performance.now() / 46) * .5 + .5);
    flash3d.intensity = lerp(L.near.intensity, L.far.intensity * farDim) * flick;
    flash3d.decay     = lerp(L.near.decay, L.far.decay);
    flash3d.angle     = lerp(L.near.angle, L.far.angle);
  }

  updateHands(dt);

  renderer.render(scene, camera);

  if (ui.devOn) {
    $dev.textContent =
      `door ${R.door}  elapsed ${R.elapsed.toFixed(1)} / ${R.limit}   dist ${dist.toFixed(1)}m\n` +
      `look ${(R.lookTime/1000).toFixed(1)}s   jam ${(R.jamTime/1000).toFixed(1)}s   err ${R.errorCount}\n` +
      `attempts ${R.attempts.length}   won ${R.attempts.filter(a=>a.won).length}` +
      (R.timer.paused ? `\npaused: ${R.timer.pauseReasons.join(', ')}` : '');
  }
  updateDebug(dt);
  requestAnimationFrame(tick);
}
