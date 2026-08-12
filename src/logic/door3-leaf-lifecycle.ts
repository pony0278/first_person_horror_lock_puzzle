/** Door 3 moving-leaf attachment lifecycle during the finale rupture. */

export const DOOR3_LEAF_HIDE_BREAK_PROGRESS = 0.02;

/**
 * The original moving leaf assembly contains the intact leaf, its rivets, and
 * the hand wheel. Once rupture fragments take over, that intact assembly must
 * leave the scene or its attachments remain tiled over the black-face reveal.
 */
export function door3LeafAssemblyVisible({
  active = true,
  impactCount = 0,
  breakProgress = 0,
}: {
  active?: boolean;
  impactCount?: number;
  breakProgress?: number;
} = {}): boolean {
  if (!active) return true;
  if (!Number.isFinite(impactCount) || impactCount < 3) return true;
  const broken = Number.isFinite(breakProgress) ? breakProgress : 0;
  return broken <= DOOR3_LEAF_HIDE_BREAK_PROGRESS;
}
