import { describe, expect, it } from 'vitest';
import {
  DOOR3_THREAT,
  DOOR3_THREAT_LIMIT_SEC,
  DOOR3_THREAT_STEPS,
  door3ThreatAdvancePenalty,
  door3ThreatAt,
  door3ThreatCause,
  door3ThreatPose,
} from '../src/logic/door3-threat';

describe('Door 3 honest three-way threat schedule', () => {
  it('keeps a short quiet window without exposing a countdown', () => {
    const state = door3ThreatAt(DOOR3_THREAT.firstCueSec - 0.01);
    expect(state.phase).toBe('dormant');
    expect(state.direction).toBeNull();
    expect(state.monsterVisible).toBe(false);
    expect(state.remaining).toBeGreaterThan(30);
  });

  it('uses the authored rear-left-right sequence with decreasing distances', () => {
    expect(DOOR3_THREAT_STEPS.map(step => step.direction))
      .toEqual(['rear', 'left', 'right', 'rear', 'left', 'right']);
    expect(DOOR3_THREAT_STEPS.every((step, index) =>
      index === 0 || step.distance < DOOR3_THREAT_STEPS[index - 1]!.distance,
    )).toBe(true);
  });

  it('always presents the environmental cue before revealing the monster', () => {
    const cue = door3ThreatAt(DOOR3_THREAT.firstCueSec + DOOR3_THREAT.cueSec / 2);
    expect(cue.phase).toBe('cue');
    expect(cue.direction).toBe('rear');
    expect(cue.cue).toBe('chain');
    expect(cue.cueProgress).toBeGreaterThan(0);
    expect(cue.monsterVisible).toBe(false);

    const reveal = door3ThreatAt(DOOR3_THREAT.firstCueSec + DOOR3_THREAT.cueSec + 0.01);
    expect(reveal.phase).toBe('visible');
    expect(reveal.monsterVisible).toBe(true);
  });

  it('a serious latch rollback advances one whole distance stage', () => {
    const elapsed = DOOR3_THREAT.firstCueSec + DOOR3_THREAT.stageSec - 0.10;
    const before = door3ThreatAt(elapsed);
    const after = door3ThreatAt(elapsed + door3ThreatAdvancePenalty(elapsed));
    expect(after.stage).toBe(before.stage + 1);
    expect(after.direction).toBe('left');
    expect(after.phase).toBe('cue');
    expect(after.monsterVisible).toBe(false);
  });

  it('a late rollback cannot skip the terminal warning or visible grace beat', () => {
    const elapsed = DOOR3_THREAT.firstCueSec + DOOR3_THREAT.stageSec * 5 - 0.01;
    const after = door3ThreatAt(elapsed + door3ThreatAdvancePenalty(elapsed));
    expect(after.stage).toBe(DOOR3_THREAT_STEPS.length - 1);
    expect(after.direction).toBe('right');
    expect(after.phase).toBe('cue');
    expect(after.lethal).toBe(false);
  });

  it('does not turn a terminal-stage rollback into an untelegraphed death', () => {
    const terminalVisible = DOOR3_THREAT_LIMIT_SEC - 0.20;
    expect(door3ThreatAt(terminalVisible).phase).toBe('visible');
    expect(door3ThreatAdvancePenalty(terminalVisible)).toBe(0);
    expect(door3ThreatAt(terminalVisible).lethal).toBe(false);
  });

  it('maps every corridor to a pose facing back toward the player', () => {
    const rear = door3ThreatPose(door3ThreatAt(DOOR3_THREAT.firstCueSec + 2));
    const left = door3ThreatPose(door3ThreatAt(
      DOOR3_THREAT.firstCueSec + DOOR3_THREAT.stageSec + 2,
    ));
    const right = door3ThreatPose(door3ThreatAt(
      DOOR3_THREAT.firstCueSec + DOOR3_THREAT.stageSec * 2 + 2,
    ));
    expect(rear).toEqual({ x: 0, z: 9.3, yawDeg: 0 });
    expect(left).toEqual({ x: -8.4, z: 0, yawDeg: -90 });
    expect(right).toEqual({ x: 7.2, z: 0, yawDeg: 90 });
  });

  it('gives a final warning and visible grace beat before death', () => {
    const terminalStart = DOOR3_THREAT.firstCueSec +
      (DOOR3_THREAT_STEPS.length - 1) * DOOR3_THREAT.stageSec;
    const warned = door3ThreatAt(terminalStart + DOOR3_THREAT.cueSec / 2);
    expect(warned.direction).toBe('right');
    expect(warned.phase).toBe('cue');
    expect(warned.lethal).toBe(false);
    expect(warned.monsterVisible).toBe(false);

    const visible = door3ThreatAt(terminalStart + DOOR3_THREAT.cueSec + 0.10);
    expect(visible.phase).toBe('visible');
    expect(visible.lethal).toBe(false);
    expect(visible.monsterVisible).toBe(true);

    const lethal = door3ThreatAt(DOOR3_THREAT_LIMIT_SEC);
    expect(lethal.phase).toBe('lethal');
    expect(lethal.lethal).toBe(true);
    expect(lethal.remaining).toBe(0);
  });

  it('clamps invalid time and reports one direction-specific cause', () => {
    expect(door3ThreatAt(-10).elapsed).toBe(0);
    expect(door3ThreatAt(Number.NaN).phase).toBe('dormant');
    expect(door3ThreatAt(999).stage).toBe(DOOR3_THREAT_STEPS.length - 1);
    expect(door3ThreatCause('right')).toBe('右側照明全滅 —— 牠已經抵達');
  });
});
