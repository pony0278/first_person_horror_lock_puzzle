# 第一人稱恐怖開鎖益智遊戲

怪物正在逼近，而你不知道還剩多少時間。

**▶ 線上試玩：https://pony0278.github.io/first_person_horror_lock_puzzle/**
（`main` 有新 commit 就自動重新發布；手機請橫向）

設計文件：[`docs/first_person_horror_lock_puzzle_design_v2.md`](docs/first_person_horror_lock_puzzle_design_v2.md)
v3 草案（三扇門三種謎題，Door 3 已改為三缸均壓）：[`docs/first_person_horror_lock_puzzle_design_v3_draft.md`](docs/first_person_horror_lock_puzzle_design_v3_draft.md)
門 3 泵房決策與灰盒契約（Door 3 空間與玩法方向的準據）：[`docs/door3-pump-hub.md`](docs/door3-pump-hub.md)
目前階段：**F2 門 3 場景灰盒**（門 1、門 2 玩法已接通；門 2 成功後會進入可環視的淹水十字泵房。門 3 水量謎題與三向怪物仍刻意保持凍結）

## 自動化

推到 `main` 就自動發布到 GitHub Pages，約一分鐘。

CI 分成兩個**並行**的 job：

| Job | 內容 | 擋發布嗎 |
| --- | --- | --- |
| **建置與發布** | `npm run check`（型別、相依分層、83 個單元測試）→ 建置單檔 → 產物大小門檻 → 發布 | 是 —— 但這些都是純 Node，兩秒跑完且完全確定性 |
| **手機視窗測試** | 基礎裝置、safe-area、中斷、門間流程、Debug 過場播放器、Door 2 雙線盤與 Door 3 場景 | **否** |

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

## Debug 檢查點與過場播放器

一般網址不建立 Debug 行為或操作介面。開發時在網址加上 `?debug=1`：

```text
https://pony0278.github.io/first_person_horror_lock_puzzle/?debug=1
```

面板以正式狀態機建立合法檢查點，不會只傳送攝影機。可反覆播放：

- Door 1 解鎖、穿門、轉角停電、跑向 Door 2 與 Door 2 初始化。
- Door 2 缺件、第一根保險絲、熔斷後第二次回頭與最後機會。
- Door 2 正解提交、電磁鎖解開、開門、16m 積水長廊、長距離泵房接近與 Door 3 中心。
- `0.25× / 0.5× / 1× / 2×`、暫停、循環、威脅凍結、怪物站位與牆鐘控制。
- Door 2 套用正解／錯誤、觸發熔斷、取得備用件與最終失敗快捷操作。

目前流程、起點、速度、循環與 Door 2 Seed 都會寫回網址。發現問題時可直接分享同一條網址：

```text
?debug=1&sequence=door2-door3&stage=walk&speed=0.5&loop=1&seed=1842
```

按反引號鍵（<code>`</code>）可收合面板。Debug 預設凍結威脅，解除後才會讓隱藏牆鐘與怪物繼續推進。

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
    pin-puzzle.ts           門 1 符號＋點數缺格序列、點數配置與答案推演
    pins.ts                 撞針狀態與難度變體型別
    round.ts                隱藏計時器、站位時刻表、失敗原因
    glyphs.ts               撞針的顏色＋形狀符號（§8）
    rng.ts                  可重現亂數
    circuit.ts              門 2 雙線診斷、熔斷冷重啟與題型池
    debug.ts                Debug 網址、流程、起點、倍率與 Seed 契約
  render/                 ── 場景建構與繪製 ──
    materials.js            程序化材質
    scene.js                走廊、門、鎖芯、工具
    monster.js              怪物網格
    decay.js                緊急照明、滲液、積水、倒影
    hintwall.js             Rough.js＋SVG＋Canvas 側邊符號＋點數缺格、手電筒、暗角
    fuseroom.js             門 2 變電室、主保險絲與唯一備用件
    pumphub.js              門 3 十字泵房、防洪閘門、三向走廊與壓力設備灰盒
    doorpanel.js            門 2 LCD 與損壞讀卡機
    hands.js                雙手 IK
    cutaway.js              下方面板的機構剖面圖
    circuitboard.js         門 2 紅藍雙線、直通／交叉開關、閘門與診斷脈衝
    viewport.js             尺寸對齊
  game/                   ── 流程 ──
    audio.js                Web Audio 即時合成
    round.js                回合生命週期
    transit.js              門 1 → 門 2 過場與注視自動取件狀態機
    door2-circuit.js        門 2 免費首測、熔斷冷重啟、備用件與追逐流程
    door3.js                門 2 → 門 3 連續直線進場與灰盒環視生命週期
    debug.js                合法檢查點、過場重播、時間／怪物與 Door 2 快捷控制
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

反過來，`src/logic/` 已包含撬鎖、隱藏計時器與門 2 雙線電路等會持續成長的規則，
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
門 1 已改為符號＋點數中央缺格＋原撬鎖執行：牆面單排三格，兩端皆為「符號在上、點數在下」，中央整格連符號與點數一起被拔走；鎖面四個固定符號各帶一組點數。玩家從兩端推理等差中項，找出帶該點數的中央符號，再依完成後的三格順序撬動真針；序列外的點數是假針。
門 2 現為紅藍雙線故障診斷：牆上的雙通道保險絲需回頭注視 0.42 秒取回，插入後才啟動 20 秒追逐並免費跑第一次診斷。四個開關各自只有直通／交叉兩態，脈衝依序通過四道顏色閘門並停在第一個錯誤段；開局固定距離唯一答案三步，四個全亂點一次仍不會通。免費首測只教故障定位；第一次正式提交錯誤會熔斷主保險絲、把開關復位到同一題的開局狀態、保留故障焦痕並讓怪物前進一站。強制取得櫃內唯一備用件期間牆鐘暫停，第二根不再提供免費診斷；再次錯誤即死亡，不生成第三根。
門 3 已先完成淹水十字泵房灰盒：Door 2 門後是 16m 積水連接廊，攝影機沿同一組世界座標奔跑約 19.62m／4.9 秒抵達泵房中心；開門即能看見遠方泵房，不轉向、不切黑、不傳送。舊 Door 1→2 前室只在這段過場停用，避免端牆遮擋與穿牆。正面是防洪閘門與三缸壓力組，左／右／後分別以暖色粗管、冷色電纜、鐵鏈來區分方向；操作區收起後可用拖曳或 W/A/S/D 環視。Performance Stabilization v2.1 將全視窗 DPR 壓到 1.5、泵房 PointLight 壓到 2 顆，移除玻璃 transmission 與水面 PBR，並重用濕腳步 AudioBuffer；這一輪仍未啟動怪物與水量規則。
目前下一步是先用真機確認 Door 3 的方向辨識、閘門可見度與拖曳手感，再設計可在 4～6 步內完成的均壓盤面，最後接入誠實但不完整的三向怪物提示。

```bash
npm run check      # 型別 + 相依分層 + 87 個單元測試
npm run build && npx http-server dist -p 8100 -s &
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/devicetest.mjs   # 57 項
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/safearea.mjs     # 16 項
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/interrupt.mjs    # 15 項
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/transit.mjs      # 門 1→2→3 完整流程
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/debug.mjs        # Debug 檢查點、Seed 與過場播放器
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/circuit.mjs      # Door 2 雙線盤視覺與觸控
F0_URL=http://127.0.0.1:8100/index.html node tools/devicetest/door3-scene.mjs  # Door 3 四向視線與環視
```
