# 第一人稱恐怖開鎖益智遊戲

怪物正在逼近，而你不知道還剩多少時間。

**▶ 線上試玩：https://pony0278.github.io/first_person_horror_lock_puzzle/**
（`main` 有新 commit 就自動重新發布；手機請橫向）

設計文件：[`docs/first_person_horror_lock_puzzle_design_v2.md`](docs/first_person_horror_lock_puzzle_design_v2.md)
v3 草案（三扇門三種謎題，討論中）：[`docs/first_person_horror_lock_puzzle_design_v3_draft.md`](docs/first_person_horror_lock_puzzle_design_v3_draft.md)
目前階段：**F1 門 1＋門 2 垂直切片**（門 1 規則推理牆與撬鎖已接通；門 2 管線、20 秒追逐已接通；門 3 尚未實作）

## 自動化

推到 `main` 就自動發布到 GitHub Pages，約一分鐘。

CI 分成兩個**並行**的 job：

| Job | 內容 | 擋發布嗎 |
| --- | --- | --- |
| **建置與發布** | `npm run check`（型別、相依分層、86 個單元測試）→ 建置單檔 → 產物大小門檻 → 發布 | 是 —— 但這些都是純 Node，兩秒跑完且完全確定性 |
| **手機視窗測試** | `devicetest`（57 項）、`safearea`（16 項）、`interrupt`（15 項）、`transit`（63 項），共 151 項 | **否** |

手機視窗測試不擋發布是刻意的：它三到五分鐘且對 runner 負載敏感，
拿它擋發布等於每次上線都要賭一次瀏覽器測試的穩定度，而它失敗多半不代表網站壞了。
網站壞掉的成本是再推一次；擋住發布的成本是每次都要等。

## 快速開始

需要 Node.js 20.19.x 或 22.12 以上；CI 固定使用 Node 22。

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
    pin-puzzle.ts           門 1 規則推理題、唯一違規列與牆面線索
    pins.ts                 撞針狀態與難度變體型別
    round.ts                隱藏計時器、站位時刻表、失敗原因
    glyphs.ts               撞針的顏色＋形狀符號（§8）
    rng.ts                  可重現亂數
    pipe.ts                 門 2 管線盤面、連通判定、盤面池與求解
  render/                 ── 場景建構與繪製 ──
    materials.js            程序化材質
    scene.js                走廊、門、鎖芯、工具
    monster.js              怪物網格
    decay.js                緊急照明、滲液、積水、倒影
    hintwall.js             Rough.js＋SVG＋Canvas 規則牆、手電筒、暗角
    electroroom.js          門 2 變電室與可取回導管
    doorpanel.js            門 2 LCD 與損壞讀卡機
    hands.js                雙手 IK
    cutaway.js              下方面板的機構剖面圖
    pipeboard.js            門 2 管線盤面繪製
    viewport.js             尺寸對齊
  game/                   ── 流程 ──
    audio.js                Web Audio 即時合成
    round.js                回合生命週期
    transit.js              門 1 → 門 2 過場與取件狀態機
    door2.js                門 2 管線流程
    halt.js                 中斷（切背景、context 遺失）
    input.js                觸控與鍵盤
    loop.js                 主迴圈
tests/                    Vitest 單元測試（涵蓋 logic/）
tools/devicetest/         手機視窗自動化測試（Playwright）
docs/                     設計文件與測試報告
```

相依方向是單向的：`logic → state/dom → render → game → main`，沒有循環。
`node tools/deps.mjs` 會驗證這兩件事並列出各模組行數，有違規就以結束碼 1 收場。
目前最大的單一檔案約 450 行 —— 拆分前是一個 2670 行的 `main.js`。


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

反過來，`src/logic/` 已包含撬鎖、隱藏計時器與門 2 管線等會持續成長的規則，
這些純邏輯都使用型別與單元測試保護。

渲染層仍維持 JavaScript；新增玩法時再按實際收益評估是否逐步 TS 化。

## 開發現況

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

v3 草案已將 F0 記錄為驗收完成；`docs/f0_device_test_checklist.md` 保留作真機回歸清單。
門 1 已改為規則推理＋原撬鎖執行：牆上兩個例證、四個潦草線索、恰好一根違規假針，抵達後仍可回頭重看。
門 2 已完成首輪體驗調整：總時限仍為 20 秒，怪物站位改為 7／11／14／20 秒，空槽提供無文字缺件脈衝。
目前的下一步是用真機與小規模玩家驗收門 1 的推理可讀性與門 2 的壓力曲線，再進入門 3。

```bash
npm run check      # 型別 + 相依分層 + 86 個單元測試
npm run build && npx http-server dist -p 8100 -s &
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/devicetest.mjs   # 57 項
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/safearea.mjs     # 16 項
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/interrupt.mjs    # 15 項
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/transit.mjs      # 63 項
```
