import type { Door3ThreatDirection } from './door3-threat.js';

export type Door3EscalationLevel = 0 | 1 | 2 | 3 | 4;

export interface Door3EscalationMemory {
  level: Door3EscalationLevel;
  maxStage: number;
  seenLeft: boolean;
  seenRight: boolean;
  seenRear: boolean;
}

export interface Door3EscalationVisual {
  branchShade: number;
  puddle: number;
  leak: number;
  benchTremor: number;
  warningLight: number;
  wallContamination: number;
  floorContamination: number;
  pipeContamination: number;
}

/**
 * F2.4.1 keeps the first pipe rupture recognisably water, then lets the same
 * red seep language from Doors 1/2 invade Door 3 in increasingly undeniable
 * layers. Every value is monotonic: the pump room never cleans itself up.
 */
export const DOOR3_ESCALATION_VISUALS = Object.freeze([
  {
    branchShade: 0.00, puddle: 0.00, leak: 0.00, benchTremor: 0.00,
    warningLight: 0.00, wallContamination: 0.00, floorContamination: 0.00,
    pipeContamination: 0.00,
  },
  {
    branchShade: 0.08, puddle: 0.12, leak: 0.18, benchTremor: 0.06,
    warningLight: 0.12, wallContamination: 0.18, floorContamination: 0.04,
    pipeContamination: 0.00,
  },
  {
    branchShade: 0.16, puddle: 0.30, leak: 0.38, benchTremor: 0.16,
    warningLight: 0.28, wallContamination: 0.40, floorContamination: 0.24,
    pipeContamination: 0.10,
  },
  {
    branchShade: 0.25, puddle: 0.52, leak: 0.66, benchTremor: 0.34,
    warningLight: 0.52, wallContamination: 0.70, floorContamination: 0.58,
    pipeContamination: 0.48,
  },
  {
    branchShade: 0.36, puddle: 0.78, leak: 0.92, benchTremor: 0.62,
    warningLight: 0.82, wallContamination: 1.00, floorContamination: 0.90,
    pipeContamination: 0.92,
  },
] as const satisfies readonly Door3EscalationVisual[]);

export const initialDoor3EscalationMemory = (): Door3EscalationMemory => ({
  level: 0,
  maxStage: -1,
  seenLeft: false,
  seenRight: false,
  seenRear: false,
});

/** Six threat stations collapse into four authored environmental pressure bands. */
export function door3EscalationLevelForStage(stage: number): Door3EscalationLevel {
  if (!Number.isFinite(stage) || stage < 0) return 0;
  if (stage <= 1) return 1;
  if (stage <= 2) return 2;
  if (stage <= 4) return 3;
  return 4;
}

/**
 * Door 3 never heals while the player is still in the room. Directional damage
 * and the highest pressure band are remembered even after the current monster
 * cue moves to another corridor.
 */
export function rememberDoor3Escalation(
  previous: Door3EscalationMemory,
  stage: number,
  direction: Door3ThreatDirection | null,
): Door3EscalationMemory {
  const maxStage = Math.max(previous.maxStage, Number.isFinite(stage) ? Math.trunc(stage) : -1);
  const authored = door3EscalationLevelForStage(maxStage);
  return {
    level: Math.max(previous.level, authored) as Door3EscalationLevel,
    maxStage,
    seenLeft: previous.seenLeft || direction === 'left',
    seenRight: previous.seenRight || direction === 'right',
    seenRear: previous.seenRear || direction === 'rear',
  };
}

export function door3EscalationVisual(level: Door3EscalationLevel): Door3EscalationVisual {
  const safe = Math.max(0, Math.min(4, Math.trunc(level))) as Door3EscalationLevel;
  return { ...DOOR3_ESCALATION_VISUALS[safe] };
}
