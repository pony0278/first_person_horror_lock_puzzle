import { describe, expect, it } from 'vitest';
import {
  DOOR3_ENDLESS_CORRIDOR,
  door3EndlessBrightness,
  door3EndlessChunkInitialCenter,
  door3EndlessRecycle,
} from '../src/logic/door3-endless-corridor';

describe('Door 3 F2.5R.4 endless corridor', () => {
  it('lays contiguous chunks forward from the old authored extension', () => {
    const first = door3EndlessChunkInitialCenter(0);
    const second = door3EndlessChunkInitialCenter(1);
    expect(first + DOOR3_ENDLESS_CORRIDOR.chunkLength / 2)
      .toBeCloseTo(DOOR3_ENDLESS_CORRIDOR.firstStartZ, 8);
    expect(first - second).toBeCloseTo(DOOR3_ENDLESS_CORRIDOR.chunkLength, 8);
  });

  it('wraps a fully passed chunk one complete corridor span forward', () => {
    const initial = door3EndlessChunkInitialCenter(0);
    const player = initial - DOOR3_ENDLESS_CORRIDOR.chunkLength * 1.8;
    const result = door3EndlessRecycle(initial, player);
    expect(result.wraps).toBeGreaterThan(0);
    expect(result.centerZ).toBeLessThan(initial);
    expect(initial - result.centerZ).toBeCloseTo(
      DOOR3_ENDLESS_CORRIDOR.chunkLength *
      DOOR3_ENDLESS_CORRIDOR.chunkCount * result.wraps,
      8,
    );
  });

  it('does not move chunks that are still ahead of the player', () => {
    const initial = door3EndlessChunkInitialCenter(3);
    const result = door3EndlessRecycle(initial, -4);
    expect(result.wraps).toBe(0);
    expect(result.centerZ).toBe(initial);
  });

  it('makes deeper generations and later run progress progressively dimmer', () => {
    const nearStart = door3EndlessBrightness(0, 0);
    const farStart = door3EndlessBrightness(5, 0);
    const farLate = door3EndlessBrightness(5, 1);
    expect(farStart).toBeLessThan(nearStart);
    expect(farLate).toBeLessThan(farStart);
    expect(farLate).toBeGreaterThanOrEqual(DOOR3_ENDLESS_CORRIDOR.minBrightness);
  });

  it('never fades a lamp below the readability floor', () => {
    expect(door3EndlessBrightness(999, 1))
      .toBe(DOOR3_ENDLESS_CORRIDOR.minBrightness);
  });
});
