import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const crazyGamesSdkV3 = {
  name: 'crazygames-sdk-v3',
  transformIndexHtml: {
    order: 'pre' as const,
    handler(html: string) {
      const submissionHtml = html
        .replace('<html lang="zh-Hant">', '<html lang="en">')
        .replace('<title>F3 — 淹水泵房壓力轉液</title>', '<title>First Person Horror Lock Puzzle</title>')
        .replace(
          '<div id="turnCue">按住畫面 = 回頭　·　放開 = 轉回門鎖</div>',
          '<div id="turnCue">HOLD VIEW = LOOK BACK · RELEASE = RETURN TO LOCK</div>',
        )
        .replace('<button id="dump">全部洩壓</button>', '<button id="dump">VENT ALL</button>');

      return {
        html: submissionHtml,
        tags: [
          {
            tag: 'script',
            attrs: { src: 'https://sdk.crazygames.com/crazygames-sdk-v3.js' },
            injectTo: 'head-pre' as const,
          },
          {
            tag: 'script',
            attrs: { type: 'module', src: '/src/platform/crazygames-bootstrap.js' },
            injectTo: 'head' as const,
          },
          {
            tag: 'script',
            attrs: { type: 'module', src: '/src/game/submission-bootstrap.js' },
            injectTo: 'head' as const,
          },
        ],
      };
    },
  },
};

/**
 * Build one self-contained game HTML file.
 *
 * Three reasons:
 * 1. Three.js, textures and game code stay bundled; the CrazyGames SDK is the
 *    only platform-owned external script.
 * 2. No importmap/CDN dependency is needed for the game itself.
 * 3. CrazyGames submission QA can validate one deterministic upload artifact.
 */
export default defineConfig({
  plugins: [crazyGamesSdkV3, viteSingleFile()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4000,
  },
});
