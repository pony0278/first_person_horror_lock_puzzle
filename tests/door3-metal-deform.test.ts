import { describe, expect, it } from 'vitest';
import {
  DOOR3_METAL_IMPACTS,
  door3MetalDisplacement,
  door3MetalImpactFactor,
  door3MetalProfile,
} from '../src/logic/door3-metal-deform';

describe('Door 3 F2.5R.2 floodgate plastic deformation', () => {
  it('overshoots on impact, rebounds, then keeps a permanent plastic set', () => {
    expect(door3MetalImpactFactor(-1)).toBe(0);
    expect(door3MetalImpactFactor(0)).toBe(0);
    expect(door3MetalImpactFactor(0.052)).toBeCloseTo(1.13, 6);
    expect(door3MetalImpactFactor(0.10)).toBeLessThan(1.13);
    expect(door3MetalImpactFactor(0.18)).toBeLessThan(1.02);
    expect(door3MetalImpactFactor(0.31)).toBe(1);
    expect(door3MetalImpactFactor(4)).toBe(1);
  });

  it('uses one impact to create a deep monster-side crater and linked safe-side bulge', () => {
    const impact = DOOR3_METAL_IMPACTS[0];
    const monster = door3MetalProfile(0, 0, impact, 'monster');
    const safe = door3MetalProfile(0, 0, impact, 'safe');
    expect(monster).toBeGreaterThan(0);
    expect(safe).toBeGreaterThan(0);
    expect(monster).toBeGreaterThan(safe);

    const monsterZ = door3MetalDisplacement(impact.x, impact.y, 'monster', [1, -1, -1]);
    const safeZ = door3MetalDisplacement(impact.x, impact.y, 'safe', [1, -1, -1]);
    expect(monsterZ).toBeLessThan(0);
    expect(safeZ).toBeLessThan(0);
    expect(Math.abs(monsterZ)).toBeGreaterThan(Math.abs(safeZ));
  });

  it('keeps the deformation local instead of bending the whole floodgate', () => {
    const impact = DOOR3_METAL_IMPACTS[0];
    expect(door3MetalProfile(3, 3, impact, 'monster')).toBe(0);
    expect(door3MetalProfile(3, 3, impact, 'safe')).toBe(0);
    expect(door3MetalDisplacement(4, 4, 'safe', [1, 1, 1])).toBe(0);
  });

  it('leaves a permanent deformation at every authored strike point', () => {
    DOOR3_METAL_IMPACTS.forEach((impact, index) => {
      const ages = [-1, -1, -1];
      ages[index] = 1;
      const safe = door3MetalDisplacement(impact.x, impact.y, 'safe', ages);
      const monster = door3MetalDisplacement(impact.x, impact.y, 'monster', ages);
      expect(safe).toBeLessThan(-0.04);
      expect(monster).toBeLessThan(-0.05);
    });
  });

  it('is deterministic for authored impacts so visual QA can reproduce the same dents', () => {
    const samplesA = DOOR3_METAL_IMPACTS.map((impact, index) =>
      door3MetalDisplacement(impact.x + 0.11, impact.y - 0.07, 'safe',
        DOOR3_METAL_IMPACTS.map((_, i) => i <= index ? 1 : -1)));
    const samplesB = DOOR3_METAL_IMPACTS.map((impact, index) =>
      door3MetalDisplacement(impact.x + 0.11, impact.y - 0.07, 'safe',
        DOOR3_METAL_IMPACTS.map((_, i) => i <= index ? 1 : -1)));
    expect(samplesA).toEqual(samplesB);
  });
});
