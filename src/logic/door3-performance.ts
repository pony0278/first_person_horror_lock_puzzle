/** Door 3 rendering budget for the full-viewport pump-room sequence. */
export const DOOR3_PERFORMANCE = Object.freeze({
  /** Fullscreen Door 3 must not inherit the global 2x render scale. */
  maxPixelRatio: 1.5,
  /** Only the warm left and cold right pump-room key lights remain active. */
  maxPointLights: 2,
  /** Any non-zero transmission causes an extra full-scene render target. */
  maxTransmissionMaterials: 0,
  /** Full-scene calls after the v2.2 batching pass, including legacy doorway props. */
  maxDrawCalls: 120,
  /** Keep two seconds of 60 Hz samples without growing memory over time. */
  frameTimeWindow: 120,
  /** 30 FPS is the first visibly unstable threshold for the approach. */
  slowFrameMs: 1000 / 30,
  /** Background-tab gaps must not dominate the rolling diagnostics forever. */
  maxRecordedFrameMs: 250,
});

export type Door3FrameTimeSnapshot = Readonly<{
  samples: number;
  averageMs: number;
  p95Ms: number;
  worstMs: number;
  slowFrames: number;
  slowFrameRatio: number;
}>;

/** Bounded rolling frame-time statistics for the Door 3 transition probe. */
export class RollingFrameTime {
  private readonly values: number[] = [];
  private readonly windowSize: number;
  private readonly slowFrameMs: number;
  private readonly maxRecordedFrameMs: number;

  constructor(
    windowSize: number = DOOR3_PERFORMANCE.frameTimeWindow,
    slowFrameMs: number = DOOR3_PERFORMANCE.slowFrameMs,
    maxRecordedFrameMs: number = DOOR3_PERFORMANCE.maxRecordedFrameMs,
  ) {
    this.windowSize = Number.isFinite(windowSize) && windowSize > 0
      ? Math.max(1, Math.floor(windowSize))
      : 1;
    this.slowFrameMs = Number.isFinite(slowFrameMs) && slowFrameMs > 0
      ? slowFrameMs
      : DOOR3_PERFORMANCE.slowFrameMs;
    this.maxRecordedFrameMs = Number.isFinite(maxRecordedFrameMs) && maxRecordedFrameMs > 0
      ? maxRecordedFrameMs
      : DOOR3_PERFORMANCE.maxRecordedFrameMs;
  }

  reset() {
    this.values.length = 0;
  }

  record(frameMs: number) {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return false;
    this.values.push(Math.min(frameMs, this.maxRecordedFrameMs));
    if (this.values.length > this.windowSize) this.values.shift();
    return true;
  }

  snapshot(): Door3FrameTimeSnapshot {
    const samples = this.values.length;
    if (!samples) {
      return {
        samples: 0, averageMs: 0, p95Ms: 0, worstMs: 0,
        slowFrames: 0, slowFrameRatio: 0,
      };
    }

    const sorted = [...this.values].sort((a, b) => a - b);
    const total = this.values.reduce((sum, value) => sum + value, 0);
    const p95Index = Math.min(samples - 1, Math.ceil(samples * 0.95) - 1);
    const slowFrames = this.values.filter(value => value > this.slowFrameMs).length;
    return {
      samples,
      averageMs: total / samples,
      p95Ms: sorted[p95Index] ?? 0,
      worstMs: sorted[samples - 1] ?? 0,
      slowFrames,
      slowFrameRatio: slowFrames / samples,
    };
  }
}

export function effectivePixelRatio(
  devicePixelRatio: number,
  cap: number = DOOR3_PERFORMANCE.maxPixelRatio,
) {
  const safeDeviceRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? devicePixelRatio
    : 1;
  const safeCap = Number.isFinite(cap) && cap > 0 ? cap : 1;
  return Math.min(safeDeviceRatio, safeCap);
}

export function drawingBufferPixelBudget(width: number, height: number) {
  const w = Math.max(0, Number.isFinite(width) ? width : 0);
  const h = Math.max(0, Number.isFinite(height) ? height : 0);
  return Math.ceil(w * h * DOOR3_PERFORMANCE.maxPixelRatio ** 2);
}
