/* CG1 bootstrap — starts SDK initialization as early as the Vite HTML entry allows.
 * CG2/CG3 will await/use the same idempotent adapter instead of re-initializing it.
 */
import {
  initCrazyGamesPlatform,
  crazyGamesPlatformSnapshot,
} from './crazygames.js';

export const crazyGamesReady = initCrazyGamesPlatform();

// Debug/preview probe only. It exposes our normalized state, never the SDK global.
globalThis.__crazyGamesPlatform = () => crazyGamesPlatformSnapshot();
globalThis.__crazyGamesReady = crazyGamesReady;
