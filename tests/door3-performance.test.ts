import { describe, expect, it } from 'vitest';
import {
  DOOR3_PERFORMANCE, drawingBufferPixelBudget, effectivePixelRatio,
} from '../src/logic/door3-performance';

describe('Door 2 to Door 3 performance stabilization v2.1', () => {
  it('caps the fullscreen stage below the global 2x render scale', () => {
    expect(DOOR3_PERFORMANCE.maxPixelRatio).toBe(1.5);
    expect(effectivePixelRatio(3)).toBe(1.5);
    expect(effectivePixelRatio(1.25)).toBe(1.25);
  });

  it('keeps the 1920x1080 drawing buffer below five million pixels', () => {
    expect(drawingBufferPixelBudget(1920, 1080)).toBe(4_665_600);
    expect(drawingBufferPixelBudget(1920, 1080)).toBeLessThan(5_000_000);
  });

  it('forbids transmission and budgets only two pump-room point lights', () => {
    expect(DOOR3_PERFORMANCE.maxTransmissionMaterials).toBe(0);
    expect(DOOR3_PERFORMANCE.maxPointLights).toBe(2);
  });

  it('handles invalid DPR and viewport input safely', () => {
    expect(effectivePixelRatio(Number.NaN)).toBe(1);
    expect(effectivePixelRatio(2, Number.NaN)).toBe(1);
    expect(drawingBufferPixelBudget(-1, Number.NaN)).toBe(0);
  });
});
