# 第一人稱恐怖開鎖益智遊戲

怪物正在逼近，而你不知道還剩多少時間。

設計文件：[`docs/first_person_horror_lock_puzzle_design_v2.md`](docs/first_person_horror_lock_puzzle_design_v2.md)
目前階段：**F0**（單門原型，待實機測試與 5~8 人驗收）

## 快速開始

```bash
npm install
npm run dev        # 開發伺服器
npm run build      # 建置成單一 HTML → dist/index.html
npm run check      # 型別檢查 + 單元測試 + 相依分層檢查
```

## 專案結構

```
index.html                標記與樣式
src/
  main.js                 進入點：接線與啟動（匯入順序＝場景建構順序）
  state.js                跨模組共用的可變狀態（回合、視角、撬針姿態、UI 選取）
  dom.js                  版面元素參照
  logic/                  ── 純邏輯，strict TypeScript，不碰 DOM 與 Three.js ──
    config.ts               調校參數與其型別
    lock.ts                 撞針鎖狀態機
    pins.ts                 撞針狀態與難度變體型別
    round.ts                隱藏計時器、站位時刻表、失敗原因
    glyphs.ts               撞針的顏色＋形狀符號（§8）
    rng.ts                  可重現亂數
  render/                 ── 場景建構與繪製 ──
    materials.js            程序化材質
    scene.js                走廊、門、鎖芯、工具
    monster.js              怪物網格
    decay.js                緊急照明、滲液、積水、倒影
    hintwall.js             提示牆、手電筒、暗角
    hands.js                雙手 IK
    cutaway.js              下方面板的機構剖面圖
    viewport.js             尺寸對齊
  game/                   ── 流程 ──
    audio.js                Web Audio 即時合成
    round.js                回合生命週期
    halt.js                 中斷（切背景、context 遺失）
    input.js                觸控與鍵盤
    loop.js                 主迴圈
tests/                    Vitest 單元測試（涵蓋 logic/）
tools/devicetest/         手機視窗自動化測試（Playwright）
docs/                     設計文件與測試報告
```

相依方向是單向的：`logic → state/dom → render → game → main`，沒有循環。
`node tools/deps.mjs` 會驗證這兩件事並列出各模組行數，有違規就以結束碼 1 收場。
最大的單一檔案是 420 行 —— 拆分前是一個 2670 行的 `main.js`。


凍結的 v28 單檔原型不再放在工作目錄裡（它會與 `src/` 產生兩份會漂移的同源程式碼）。
要跟它對照時從 git 取出即可：

```bash
node tools/devicetest/setup.mjs            # 預設取 F0 基線的 v28
node tools/devicetest/setup.mjs <git-ref>  # 或任何版本
```

### 為什麼只有 `src/logic/` 是 TypeScript

設計文件 §13 要求的是「將遊戲邏輯與渲染層分離，之後移植時邏輯層可整包帶走」，
不是全部 TS 化。而且 §13 與 §16 都特別警告 F0 的時程是硬上限。

實際盤點下來，`src/main.js` 有九成是程序化幾何（怪物 845 行、雙手 IK 410 行、
場景 300 行）—— 這類程式碼的失效模式是「看起來不對」，不是型別錯誤，
型別標註在上面收不到什麼，改動風險卻很高。

反過來，`src/logic/` 是 F1 唯一會長大的地方：三扇門、滑落針、雙生針、多假針、
六針全都是撞針狀態機的規則變體（§7）。所以型別與測試集中在這裡。

渲染層的 TS 化留到 F1 開工時再評估。

## F0 現況

`docs/f0_device_test_report.md` 有完整的發現與證據。摘要：

| | 項目 | 狀態 |
| --- | --- | --- |
| B1 | 手機橫向上下分區反了（面板吃 42~61%） | 已修 |
| B2 | 撞針高度差在手機橫向只剩 3.5px | 已修（→ 9.5~10px） |
| B3 | iOS / Android 上完全沒有聲音 | 已修 |
| H1 | 無 safe-area 處理 | 已修 |
| H2 | 切背景吃掉隱藏計時器 | 已修 |
| H3 | context loss 遺失期間無處理 | 已修 |
| H4 | 洩壓鈕 66×27px，低於 44×44 | 已修（→ 70×44px） |
| H5 | 資源依賴 CDN，離線白畫面 | 已修（建置內嵌） |

自動化階段沒有已知未處理項目。下一步是拿真機跑 `docs/f0_device_test_checklist.md`，
再做 5~8 人驗收（設計文件 §17）。

```bash
npm run check      # 型別 + 37 個單元測試
npm run build && npx http-server dist -p 8100 -s &
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/devicetest.mjs   # 57 項
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/safearea.mjs     # 16 項
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/interrupt.mjs    # 14 項
```
