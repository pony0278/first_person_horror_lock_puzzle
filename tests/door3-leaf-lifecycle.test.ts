import { describe, expect, it } from 'vitest';
import {
  DOOR3_LEAF_HIDE_BREAK_PROGRESS,
  door3LeafAssemblyVisible,
} from '../src/logic/door3-leaf-lifecycle';

describe('Door 3 intact floodgate leaf lifecycle', () => {
  it('keeps the intact leaf assembly before the third impact', () => {
    expect(door3LeafAssemblyVisible({ active: true, impactCount: 0, breakProgress: 0 }))
      .toBe(true);
    expect(door3LeafAssemblyVisible({ active: true, impactCount: 2, breakProgress: 0.8 }))
      .toBe(true);
  });

  it('keeps the intact attachments until rupture fragments actually take over', () => {
    expect(door3LeafAssemblyVisible({
      active: true,
      impactCount: 3,
      breakProgress: DOOR3_LEAF_HIDE_BREAK_PROGRESS,
    })).toBe(true);
  });

  it('hides the entire intact assembly once rupture begins', () => {
    expect(door3LeafAssemblyVisible({
      active: true,
      impactCount: 3,
      breakProgress: DOOR3_LEAF_HIDE_BREAK_PROGRESS + 0.001,
    })).toBe(false);
    expect(door3LeafAssemblyVisible({ active: true, impactCount: 3, breakProgress: 1 }))
      .toBe(false);
  });

  it('restores the assembly when Door 3 is inactive/reset', () => {
    expect(door3LeafAssemblyVisible({ active: false, impactCount: 3, breakProgress: 1 }))
      .toBe(true);
  });
});
