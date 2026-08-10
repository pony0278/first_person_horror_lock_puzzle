/**
 * Developer Debug Lab URL contract.
 *
 * Parsing lives in the pure logic layer so a shared bug URL is deterministic
 * before any DOM, Three.js scene, or game state is created.
 */

export const DEBUG_SPEEDS = [0.25, 0.5, 1, 2] as const;
export type DebugSpeed = typeof DEBUG_SPEEDS[number];

export const DEBUG_SEQUENCES = {
  full: ['start'],
  door1: ['lock'],
  'door1-door2': ['unlock', 'through', 'corner', 'approach', 'arrive', 'door2'],
  door2: ['missing', 'first-fuse', 'burnout', 'final-fuse'],
  'door2-door3': ['success', 'unlocked', 'open', 'through', 'walk', 'explore'],
  door3: ['explore'],
} as const;

export type DebugSequence = keyof typeof DEBUG_SEQUENCES;
export type DebugStage = typeof DEBUG_SEQUENCES[DebugSequence][number];

export interface DebugOptions {
  enabled: boolean;
  sequence: DebugSequence;
  stage: DebugStage;
  speed: DebugSpeed;
  loop: boolean;
  seed: number;
}

const DEFAULTS: DebugOptions = {
  enabled: false,
  sequence: 'door1-door2',
  stage: 'unlock',
  speed: 1,
  loop: false,
  seed: 1842,
};

export function debugStages(sequence: DebugSequence): readonly string[] {
  return DEBUG_SEQUENCES[sequence];
}

export function isDebugSequence(value: string | null): value is DebugSequence {
  return value !== null && Object.hasOwn(DEBUG_SEQUENCES, value);
}

export function isDebugStage(sequence: DebugSequence, value: string | null): value is DebugStage {
  return value !== null && (debugStages(sequence) as readonly string[]).includes(value);
}

function speedOf(value: string | null): DebugSpeed {
  const parsed = Number(value);
  return DEBUG_SPEEDS.find(speed => speed === parsed) ?? DEFAULTS.speed;
}

function seedOf(value: string | null): number {
  if (value === null || value.trim() === '') return DEFAULTS.seed;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 0x7fffffff) return DEFAULTS.seed;
  return Math.max(0, parsed);
}

export function parseDebugOptions(input: URLSearchParams | string): DebugOptions {
  const params = typeof input === 'string' ? new URLSearchParams(input) : input;
  const requestedSequence = params.get('sequence');
  const sequence = isDebugSequence(requestedSequence) ? requestedSequence : DEFAULTS.sequence;
  const requestedStage = params.get('stage');
  const stage = isDebugStage(sequence, requestedStage)
    ? requestedStage
    : debugStages(sequence)[0] as DebugStage;

  return {
    enabled: params.get('debug') === '1',
    sequence,
    stage,
    speed: speedOf(params.get('speed')),
    loop: params.get('loop') === '1',
    seed: seedOf(params.get('seed')),
  };
}

export function debugQuery(options: DebugOptions): string {
  const params = new URLSearchParams();
  params.set('debug', options.enabled ? '1' : '0');
  params.set('sequence', options.sequence);
  params.set('stage', isDebugStage(options.sequence, options.stage)
    ? options.stage
    : debugStages(options.sequence)[0]!);
  params.set('speed', String(options.speed));
  params.set('loop', options.loop ? '1' : '0');
  params.set('seed', String(seedOf(String(options.seed))));
  return params.toString();
}
