# F0 手機視窗自動測試

用 Playwright + Chromium 在模擬的手機視窗下驗證遊戲。
結果與判讀見 `docs/f0_device_test_report.md`。

## 跑法（測建置版 —— 平常用這個）

```bash
npm install
npm run build
npx http-server dist -p 8100 -s &

F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/devicetest.mjs
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/probe2.mjs
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/probe3.mjs
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/pinread.mjs
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/interrupt.mjs
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/safearea.mjs
```

`interrupt.mjs` 與 `safearea.mjs` 會用結束碼表示成敗（FAIL 就 exit 1），適合掛進 CI。

測試接點（`window.__probe` / `__setPins` / `__pinCentres`）定義在 `src/main.js` 結尾，
會一起進建置產物 —— 這是刻意的，因為要測的就是實際出貨的那個檔案，
而不是某個特製的測試版本。它們與 D（dev overlay）、H（手部調整面板）是同性質的除錯出口。

## 跑法（測凍結版 v28 —— 需要對照時才用）

v28 走 CDN 且沒有測試接點，`setup.mjs` 會從 git 取出該版本並補上這兩件事：

```bash
node tools/devicetest/setup.mjs                        # → tools/devicetest/build/
npx http-server tools/devicetest/build -p 8101 -s &
F0_URL=http://127.0.0.1:8101/f0.html node tools/devicetest/pinread.mjs
```

環境變數：`CHROMIUM_PATH`（預設 `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`）、
`F0_URL`（預設 `http://127.0.0.1:8100/f0.html`）。

## 各腳本測什麼

| 腳本 | 內容 |
| --- | --- |
| `devicetest.mjs` | canvas 建立、版面溢出、safe-area 重疊、上下比例、觸控命中區、雙擊縮放、背景計時、FPS 取樣、JS 例外 |
| `probe2.mjs` | 面板高度是否受 `flex-basis` 控制（含不同視窗高度與 DPR 的對照）、intro 實際耗時、觸控推針、計時器 |
| `probe3.mjs` | 真實自動播放政策下的 AudioContext 狀態、WebGL context 遺失與恢復、面板高度的熱套驗證 |
| `pinread.mjs` | 直接對畫好的 canvas 取樣，量各撞針狀態的實際像素差 |
| `interrupt.mjs` | 切到背景與 WebGL context 遺失時，隱藏計時器是否停下、輸入是否關閉、提示是否出現，以及兩者疊加 |
| `signature.mjs` | Three.js 場景圖的**結構**指紋（型別、幾何、材質、階層）＋ 全域接點與事件監聽。純程式碼搬移時用來確認什麼都沒漏，用法見檔頭 |
| `safearea.mjs` | 四種瀏海配置下，可操作元素是否避開瀏海與 home indicator、洩壓鈕命中區、可操作區比例、撞針高度差有沒有被吃掉 |

## 幾個容易踩的量測陷阱

**Chromium 不會模擬 safe-area**（CDP 沒有 `Emulation.setSafeAreaInsets`）。
`index.html` 把 `env()` 讀進 `--sa-*` 自訂屬性，測試覆寫那些屬性來模擬瀏海；
真機上 `env()` 直接生效，兩條路徑走同一組 CSS。

**別用「原始碼裡有沒有這個字串」判斷有沒有註冊監聽。** 打包後的 three.js 內部就含有
`webglcontextlost`，這種檢查會變成必定為真。`probe3.mjs` 改成攔截 `addEventListener`。

**別用 `readPixels` 取畫面內容。** 沒有 `preserveDrawingBuffer` 時合成後讀回全 0。
改用 `page.locator('#view').screenshot()` 的位元組長度當內容指標。

**別從瀏覽器外面前後夾量 context 遺失的漏秒。** `loseContext()` 到 `webglcontextlost`
之間有瀏覽器自己的派送延遲（本環境 260~330ms），再加上 Playwright 的往返，
會把那些都算成程式的漏秒。`interrupt.mjs` 改成在頁面內側錄事件觸發當下的值。

## 這裡測不到的

真實 GPU 幀率、發熱、iOS Safari 網址列收合、螢幕面板差異、觸控手感。
本環境只有 SwiftShader 軟體渲染（5~7 FPS），**腳本印出的 FPS 不可當效能結論**。
那些項目在 `docs/f0_device_test_checklist.md`，要拿真機跑。
