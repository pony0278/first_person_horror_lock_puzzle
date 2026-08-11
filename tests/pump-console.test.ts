import { describe, expect, it } from 'vitest';
import {
  PUMP_CONSOLE, normalizePumpVolumes, pumpLatchStates,
  pumpLevelsFromVolumes, pumpPressureBar, pumpPressureRatio,
  pumpPuzzleSolved, pumpVolumeTotal, transferPumpVolume,
} from '../src/logic/pump-console';

describe('Door 3 conserved-fluid pump console', () => {
  it('starts with visible 6 / 4 / 3 capacities and fixed total fluid', () => {
    const volumes = normalizePumpVolumes(PUMP_CONSOLE.initialVolumes);
    expect(volumes).toEqual([6, 1, 0]);
    expect(pumpLevelsFromVolumes(volumes)).toEqual([1, 0.25, 0]);
    expect(pumpVolumeTotal(volumes)).toBe(7);
    expect(pumpLatchStates(volumes)).toEqual([false, false]);
    expect(pumpPressureBar(volumes)).toBe(5.8);
    expect(pumpPressureRatio(volumes)).toBeCloseTo(0.5833, 3);
  });

  it('pours until the source empties or the target fills', () => {
    expect(transferPumpVolume([6, 1, 0], 1, 2)).toMatchObject({
      volumes: [6, 0, 1], moved: 1, reason: 'moved',
    });
    expect(transferPumpVolume([6, 0, 1], 0, 1)).toMatchObject({
      volumes: [2, 4, 1], moved: 4, reason: 'moved',
    });
  });

  it('conserves total fluid across every legal transfer', () => {
    const before = [2, 4, 1];
    const after = transferPumpVolume(before, 1, 2).volumes;
    expect(after).toEqual([2, 2, 3]);
    expect(pumpVolumeTotal(after)).toBe(pumpVolumeTotal(before));
  });

  it('rejects dry, full, same-tank and malformed routes without mutation', () => {
    const start = [6, 1, 0];
    expect(transferPumpVolume(start, 2, 1).reason).toBe('empty-source');
    expect(transferPumpVolume(start, 0, 0).reason).toBe('same-tank');
    expect(transferPumpVolume([2, 4, 1], 0, 1).reason).toBe('full-target');
    expect(transferPumpVolume(start, 8, 0).reason).toBe('invalid');
    expect(start).toEqual([6, 1, 0]);
  });

  it('solves in the authored five-transfer route', () => {
    const route = [[1, 2], [0, 1], [1, 2], [2, 0], [1, 2]] as const;
    let volumes: readonly number[] = PUMP_CONSOLE.initialVolumes;
    for (const [source, target] of route)
      volumes = transferPumpVolume(volumes, source, target).volumes;
    expect(volumes).toEqual([5, 0, 2]);
    expect(pumpLatchStates(volumes)).toEqual([true, true]);
    expect(pumpPuzzleSolved(volumes)).toBe(true);
    expect(pumpPressureBar(volumes)).toBe(10);
    expect(pumpVolumeTotal(volumes)).toBe(7);
  });

  it('has no accidental solution shorter than five transfers', () => {
    const queue: Array<{ volumes: number[]; depth: number }> = [{
      volumes: [...PUMP_CONSOLE.initialVolumes], depth: 0,
    }];
    const seen = new Set(queue.map(item => item.volumes.join(',')));
    let shortest = -1;
    while (queue.length) {
      const current = queue.shift()!;
      if (pumpPuzzleSolved(current.volumes)) {
        shortest = current.depth;
        break;
      }
      for (let source = 0; source < 3; source++) {
        for (let target = 0; target < 3; target++) {
          const result = transferPumpVolume(current.volumes, source, target);
          if (!result.moved) continue;
          const key = result.volumes.join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          queue.push({ volumes: result.volumes, depth: current.depth + 1 });
        }
      }
    }
    expect(shortest).toBe(5);
  });

  it('normalizes malformed volumes to integer physical bounds', () => {
    expect(normalizePumpVolumes([Number.NaN, -2, 9])).toEqual([6, 0, 3]);
    expect(normalizePumpVolumes([2.4, 2.6, 1.2])).toEqual([2, 3, 1]);
  });
});
