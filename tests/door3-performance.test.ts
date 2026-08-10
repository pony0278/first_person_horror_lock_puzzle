import { describe, expect, it } from 'vitest';
import {
  DOOR3_PERFORMANCE, RollingFrameTime, drawingBufferPixelBudget, effectivePixelRatio,
} from '../src/logic/door3-performance';

describe('Door 2 to Door 3 performance stabilization v2.2', () => {
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
    expect(DOOR3_PERFORMANCE.maxDrawCalls).toBe(120);
  });

  it('handles invalid DPR and viewport input safely', () => {
    expect(effectivePixelRatio(Number.NaN)).toBe(1);
    expect(effectivePixelRatio(2, Number.NaN)).toBe(1);
    expect(drawingBufferPixelBudget(-1, Number.NaN)).toBe(0);
  });

  it('reports bounded rolling average, p95, worst, and slow frames', () => {
    const timing = new RollingFrameTime(4, 1000 / 30, 250);
    [16, 20, 40, 100, 200].forEach(frameMs => timing.record(frameMs));

    expect(timing.snapshot()).toEqual({
      samples: 4,
      averageMs: 90,
      p95Ms: 200,
      worstMs: 200,
      slowFrames: 3,
      slowFrameRatio: 0.75,
    });
  });

  it('ignores invalid samples, caps tab gaps, and resets cleanly', () => {
    const timing = new RollingFrameTime(3, 33.3, 250);
    expect(timing.record(Number.NaN)).toBe(false);
    expect(timing.record(-4)).toBe(false);
    expect(timing.record(500)).toBe(true);
    expect(timing.snapshot().worstMs).toBe(250);

    timing.reset();
    expect(timing.snapshot()).toEqual({
      samples: 0,
      averageMs: 0,
      p95Ms: 0,
      worstMs: 0,
      slowFrames: 0,
      slowFrameRatio: 0,
    });
  });
});
