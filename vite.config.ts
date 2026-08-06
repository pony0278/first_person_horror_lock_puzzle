import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * 建置成單一 HTML 檔。
 *
 * 三個理由：
 * 1. CrazyGames 上架本來就要自帶資源，不能靠 CDN（設計文件 §2）。
 * 2. 解決報告 H5 —— 原型的 importmap 指向 unpkg，離線或弱網直接白畫面。
 * 3. 實機測試可以把單檔丟到手機上直接開。
 */
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    // three.js 是唯一的大型相依，全部內嵌
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
