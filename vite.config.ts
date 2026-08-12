import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const crazyGamesSdkV3 = {
  name: 'crazygames-sdk-v3',
  transformIndexHtml: {
    order: 'pre' as const,
    handler() {
      return [
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
      ];
    },
  },
};

/**
 * 建置成單一 HTML 檔。
 *
 * 三個理由：
 * 1. 遊戲自己的 Three.js / 貼圖 / 程式資產全部自帶；唯一外部 script 是
 *    CrazyGames 官方 SDK v3，依平台整合規格在遊戲程式之前載入。
 * 2. 解決報告 H5 —— 原型的 importmap 指向 unpkg，離線或弱網直接白畫面。
 * 3. 實機測試可以把遊戲本體保持在單一 HTML 產物中。
 */
export default defineConfig({
  plugins: [crazyGamesSdkV3, viteSingleFile()],
  build: {
    target: 'es2022',
    // three.js 是唯一的大型相依，全部內嵌
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4000,
  },
});
