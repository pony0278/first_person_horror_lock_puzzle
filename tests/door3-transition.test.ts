import { describe, expect, it } from 'vitest';
import { DOOR3_REVEAL, door3CoverOpacity } from '../src/logic/door3-transition';

describe('Door 2 to Door 3 straight flashlight reveal', () => {
  it('uses only a brief scene cover', () => {
    expect(DOOR3_REVEAL.coverSec).toBeGreaterThanOrEqual(0.08);
    expect(DOOR3_REVEAL.coverSec).toBeLessThanOrEqual(0.12);
  });

  it('reaches full cover only at the world swap', () => {
    expect(door3CoverOpacity('cover', 0)).toBe(0);
    expect(door3CoverOpacity('cover', DOOR3_REVEAL.coverSec / 2)).toBeCloseTo(0.5);
    expect(door3CoverOpacity('cover', DOOR3_REVEAL.coverSec)).toBe(1);
  });

  it('fully clears the cover before walking begins', () => {
    expect(door3CoverOpacity('reveal', 0)).toBe(1);
    expect(door3CoverOpacity('reveal', DOOR3_REVEAL.revealSec / 2)).toBeCloseTo(0.5);
    expect(door3CoverOpacity('reveal', DOOR3_REVEAL.revealSec)).toBe(0);
  });

  it('clamps delayed or negative frames safely', () => {
    expect(door3CoverOpacity('cover', -1)).toBe(0);
    expect(door3CoverOpacity('cover', 99)).toBe(1);
    expect(door3CoverOpacity('reveal', -1)).toBe(1);
    expect(door3CoverOpacity('reveal', 99)).toBe(0);
  });
});
