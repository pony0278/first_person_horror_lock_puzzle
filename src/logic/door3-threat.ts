/**
 * Door 3's threat is a hidden wall-clock schedule. The player never sees a
 * countdown; the current corridor and distance are communicated by the pump
 * room itself before the monster becomes visible.
 */

export type Door3ThreatDirection = 'left' | 'right' | 'rear';
export type Door3ThreatCue = 'water-ripple' | 'blackout' | 'chain';
export type Door3ThreatPhase = 'dormant' | 'cue' | 'visible' | 'lethal';

export interface Door3ThreatStep {
  direction: Door3ThreatDirection;
  cue: Door3ThreatCue;
  /** Distance from the crossroads centre along the selected branch. */
  distance: number;
}

export interface Door3ThreatSnapshot {
  elapsed: number;
  stage: number;
  direction: Door3ThreatDirection | null;
  cue: Door3ThreatCue | null;
  phase: Door3ThreatPhase;
  stageTime: number;
  cueProgress: number;
  presence: number;
  distance: number | null;
  monsterVisible: boolean;
  lethal: boolean;
  remaining: number;
}

export interface Door3ThreatPose {
  x: number;
  z: number;
  yawDeg: number;
}

export const DOOR3_THREAT = Object.freeze({
  /** Quiet observation window after the player reaches the pump console. */
  firstCueSec: 3.50,
  /** Every serious latch rollback advances exactly this much hidden time. */
  stageSec: 6.50,
  /** Environment always warns first; the monster is hidden during this beat. */
  cueSec: 1.05,
  /** Final visible chance after the last warning before the round is lost. */
  deathGraceSec: 1.25,
});

/** One monster changes corridors; distances always decrease across the run. */
export const DOOR3_THREAT_STEPS = Object.freeze([
  { direction: 'rear',  cue: 'chain',        distance: 9.30 },
  { direction: 'left',  cue: 'water-ripple', distance: 8.40 },
  { direction: 'right', cue: 'blackout',     distance: 7.20 },
  { direction: 'rear',  cue: 'chain',        distance: 5.80 },
  { direction: 'left',  cue: 'water-ripple', distance: 4.30 },
  { direction: 'right', cue: 'blackout',     distance: 2.70 },
] as const satisfies readonly Door3ThreatStep[]);

export const DOOR3_THREAT_LIMIT_SEC =
  DOOR3_THREAT.firstCueSec +
  (DOOR3_THREAT_STEPS.length - 1) * DOOR3_THREAT.stageSec +
  DOOR3_THREAT.cueSec + DOOR3_THREAT.deathGraceSec;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const safeElapsed = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;

export function door3ThreatAt(elapsedSec: number): Door3ThreatSnapshot {
  const elapsed = safeElapsed(elapsedSec);
  if (elapsed < DOOR3_THREAT.firstCueSec) {
    return {
      elapsed, stage: -1, direction: null, cue: null, phase: 'dormant',
      stageTime: 0, cueProgress: 0, presence: 0, distance: null,
      monsterVisible: false, lethal: false,
      remaining: Math.max(0, DOOR3_THREAT_LIMIT_SEC - elapsed),
    };
  }

  const rawStage = Math.floor(
    (elapsed - DOOR3_THREAT.firstCueSec) / DOOR3_THREAT.stageSec,
  );
  const stage = Math.min(DOOR3_THREAT_STEPS.length - 1, rawStage);
  const step = DOOR3_THREAT_STEPS[stage]!;
  const stageStart = DOOR3_THREAT.firstCueSec + stage * DOOR3_THREAT.stageSec;
  const stageTime = Math.max(0, elapsed - stageStart);
  const cueProgress = clamp01(stageTime / DOOR3_THREAT.cueSec);
  const finalStage = stage === DOOR3_THREAT_STEPS.length - 1;
  const lethal = finalStage &&
    stageTime + Number.EPSILON * 32 >=
      DOOR3_THREAT.cueSec + DOOR3_THREAT.deathGraceSec;
  const phase: Door3ThreatPhase = lethal
    ? 'lethal'
    : stageTime < DOOR3_THREAT.cueSec ? 'cue' : 'visible';

  return {
    elapsed,
    stage,
    direction: step.direction,
    cue: step.cue,
    phase,
    stageTime,
    cueProgress,
    presence: phase === 'cue' ? cueProgress : 1,
    distance: step.distance,
    monsterVisible: phase === 'visible' || phase === 'lethal',
    lethal,
    remaining: Math.max(0, DOOR3_THREAT_LIMIT_SEC - elapsed),
  };
}

/**
 * Move to the start of the next distance stage. Resetting local stage time is
 * important: even a late serious error must still show the new corridor cue
 * before the monster appears there.
 */
export function door3ThreatAdvancePenalty(elapsedSec: number): number {
  const elapsed = safeElapsed(elapsedSec);
  const current = door3ThreatAt(elapsed);
  if (current.stage >= DOOR3_THREAT_STEPS.length - 1) return 0;
  const nextStage = current.stage + 1;
  const nextStart = DOOR3_THREAT.firstCueSec + nextStage * DOOR3_THREAT.stageSec;
  return Math.max(0, nextStart - elapsed);
}

/** Pump-hub local pose. The base monster mesh faces local -Z at yaw 0. */
export function door3ThreatPose(snapshot: Door3ThreatSnapshot): Door3ThreatPose | null {
  if (snapshot.direction === null || snapshot.distance === null) return null;
  if (snapshot.direction === 'rear') {
    return { x: 0, z: snapshot.distance, yawDeg: 0 };
  }
  if (snapshot.direction === 'left') {
    return { x: -snapshot.distance, z: 0, yawDeg: -90 };
  }
  return { x: snapshot.distance, z: 0, yawDeg: 90 };
}

/** Results name only the decisive cue, never an unverifiable list of mistakes. */
export function door3ThreatCause(direction: Door3ThreatDirection | null): string {
  if (direction === 'left') return '左側水波已逼到工作檯';
  if (direction === 'rear') return '後方鐵鏈停止 —— 牠已經抵達';
  return '右側照明全滅 —— 牠已經抵達';
}
