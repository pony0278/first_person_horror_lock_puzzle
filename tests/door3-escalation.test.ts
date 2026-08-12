import { describe, expect, it } from 'vitest';
import {
  door3EscalationLevelForStage,
  door3EscalationVisual,
  initialDoor3EscalationMemory,
  rememberDoor3Escalation,
} from '../src/logic/door3-escalation';

describe('Door 3 F2.4 environmental escalation', () => {
  it('maps six threat stages into four increasing pressure bands', () => {
    expect([-1, 0, 1, 2, 3, 4, 5].map(door3EscalationLevelForStage))
      .toEqual([0, 1, 1, 2, 3, 3, 4]);
  });

  it('never heals the room when the threat changes corridor', () => {
    let memory = initialDoor3EscalationMemory();
    memory = rememberDoor3Escalation(memory, 0, 'rear');
    memory = rememberDoor3Escalation(memory, 2, 'right');
    const peak = memory;
    memory = rememberDoor3Escalation(memory, 1, 'left');

    expect(memory.level).toBe(peak.level);
    expect(memory.maxStage).toBe(peak.maxStage);
    expect(memory.seenRear).toBe(true);
    expect(memory.seenRight).toBe(true);
    expect(memory.seenLeft).toBe(true);
  });

  it('keeps directional scars after the current cue moves elsewhere', () => {
    const rear = rememberDoor3Escalation(initialDoor3EscalationMemory(), 0, 'rear');
    const left = rememberDoor3Escalation(rear, 1, 'left');
    const right = rememberDoor3Escalation(left, 2, 'right');

    expect(right).toMatchObject({
      seenRear: true,
      seenLeft: true,
      seenRight: true,
      level: 2,
    });
  });

  it('makes the workbench and flooding progressively more unstable', () => {
    const quiet = door3EscalationVisual(0);
    const warning = door3EscalationVisual(1);
    const terminal = door3EscalationVisual(4);

    expect(warning.puddle).toBeGreaterThan(quiet.puddle);
    expect(terminal.puddle).toBeGreaterThan(warning.puddle);
    expect(terminal.leak).toBeGreaterThan(warning.leak);
    expect(terminal.benchTremor).toBeGreaterThan(warning.benchTremor);
    expect(terminal.branchShade).toBeGreaterThan(warning.branchShade);
  });

  it('keeps the first rupture clear before progressively contaminating the same water system', () => {
    const quiet = door3EscalationVisual(0);
    const firstWarning = door3EscalationVisual(1);
    const middle = door3EscalationVisual(3);
    const terminal = door3EscalationVisual(4);

    expect(quiet.wallContamination).toBe(0);
    expect(firstWarning.wallContamination).toBeGreaterThan(0);
    expect(firstWarning.pipeContamination).toBe(0);
    expect(middle.pipeContamination).toBeGreaterThan(0);
    expect(terminal.pipeContamination).toBeGreaterThan(middle.pipeContamination);
    expect(terminal.floorContamination).toBeGreaterThan(middle.floorContamination);
    expect(terminal.wallContamination).toBeGreaterThan(middle.wallContamination);
  });

  it('keeps every contamination channel monotonic across escalation levels', () => {
    const visuals = [0, 1, 2, 3, 4].map(level =>
      door3EscalationVisual(level as 0 | 1 | 2 | 3 | 4));
    for (let index = 1; index < visuals.length; index++) {
      expect(visuals[index]!.wallContamination)
        .toBeGreaterThanOrEqual(visuals[index - 1]!.wallContamination);
      expect(visuals[index]!.floorContamination)
        .toBeGreaterThanOrEqual(visuals[index - 1]!.floorContamination);
      expect(visuals[index]!.pipeContamination)
        .toBeGreaterThanOrEqual(visuals[index - 1]!.pipeContamination);
    }
  });
});
