# F0 手機視窗自動測試

用 Playwright + Chromium 在模擬的手機視窗下驗證 `f0_door_prototype_v28.html`。
結果與判讀見 `docs/f0_device_test_report.md`。

## 跑法

```bash
npm install three@0.160.0 playwright        # three 是給 build 副本用的
node tools/devicetest/setup.mjs             # 產生 build/f0.html（本地 three + 測試接點）
npx http-server tools/devicetest/build -p 8100 -s &

node tools/devicetest/devicetest.mjs        # 主套件：5 種機型 × 12 項
node tools/devicetest/probe2.mjs            # 面板高度成因 + 實際互動
node tools/devicetest/probe3.mjs            # 自動播放政策 / context loss / 修法驗證
node tools/devicetest/pinread.mjs           # 撞針狀態的像素差
```

環境變數：`CHROMIUM_PATH`（預設 `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`）、
`F0_URL`（預設 `http://127.0.0.1:8100/f0.html`）。

截圖輸出在 `tools/devicetest/build/shots/`。

## 各腳本測什麼

| 腳本 | 內容 |
| --- | --- |
| `devicetest.mjs` | canvas 建立、版面溢出、safe-area 重疊、上下比例、觸控命中區、雙擊縮放、背景計時、FPS 取樣、JS 例外 |
| `probe2.mjs` | 面板高度為何脫離 `flex-basis:34%`（含不同視窗高度與 DPR 的對照）、intro 實際耗時、觸控推針、牆鐘計時器 |
| `probe3.mjs` | 真實自動播放政策下的 AudioContext 狀態、WebGL context loss 是否恢復、面板高度修法的熱套驗證 |
| `pinread.mjs` | `drawCutaway()` 各撞針狀態在不同機型上的實際像素差 |

## 這裡測不到的

真實 GPU 幀率、發熱、iOS Safari 網址列收合、螢幕面板差異、觸控手感。
本環境只有 SwiftShader 軟體渲染（5~7 FPS），**腳本印出的 FPS 不可當效能結論**。
那些項目在 `docs/f0_device_test_checklist.md`，要拿真機跑。

## 注意

`setup.mjs` 依賴原型結尾的 `newRound(); resize(); tick();` 這三行來注入測試接點。
原型改版後若找不到會直接報錯，不會產出壞掉的 build。
