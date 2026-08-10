/** Door 3 rendering budget for the full-viewport pump-room sequence. */
export const DOOR3_PERFORMANCE = Object.freeze({
  /** Fullscreen Door 3 must not inherit the global 2x render scale. */
  maxPixelRatio: 1.5,
  /** Only the warm left and cold right pump-room key lights remain active. */
  maxPointLights: 2,
  /** Any non-zero transmission causes an extra full-scene render target. */
  maxTransmissionMaterials: 0,
});

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
