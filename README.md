# OpenClaw Character Dashboard — 使用指南

Author: An IT-a

[Subscribe and Follow me! ❤️](https://profile.an-it-a.com/)

![Preview](documentation/images/frieren-preview.png)

---

> **其他語言 / 其他文件**
>
> - English version: [README-en.md](./README-en.md)
> - 開發者 / 技術參考: [README-tech.md](./README-tech.md)

---

OpenClaw Character Dashboard 可以把你的 [OpenClaw](https://github.com/openclaw/openclaw) AI Agent 變成在地圖上生活的像素風格動畫角色。每個智能體擁有自己的私人房間，會根據當前是在工作還是空閒，在辦公室、客廳和臥室之間自由走動。

你可以用自己喜歡的動漫、遊戲或原創角色完全替換介面素材，**無需任何程式設計經驗**。

---

## 開始之前

你需要：

- 一台運行 macOS、Linux 或 Windows 的電腦
- 已在本機安裝並運行的 [OpenClaw](https://github.com/openclaw/openclaw)，並已經有運行中的Agent
- 本資料夾中的檔案（如果你能看到這份文件，說明你已經擁有了）

**不需要**會寫程式。

---

## 第一步 — 取得檔案

你需要先將這個程式庫的檔案下載到你的電腦上。

**方法 A — 使用 Git 複製**（如果你已安裝 Git）：

```bash
git clone https://github.com/an-it-a/openclaw-character-dashboard.git
cd openclaw-character-dashboard
```

**方法 B — 下載 ZIP 壓縮檔**：

1. 前往 GitHub 上的程式庫頁面。
2. 點擊綠色的 **Code** 按鈕 → **Download ZIP**。
3. 將 ZIP 解壓縮到你電腦上的某個資料夾。
4. 開啟終端機，切換到該資料夾。

---

## 第二步 — 安裝

運行適合你作業系統的安裝腳本。腳本會自動檢查電腦環境，在徵得你同意後安裝缺少的元件，並完成全部初始化。

### macOS 或 Linux

開啟**終端機（Terminal）**，切換到本資料夾，執行：

```bash
./install.sh
```

如果看到「權限不足」的提示，先執行下面這行，再重試：

```bash
chmod +x install.sh
```

### Windows — PowerShell（推薦）

右鍵點擊「開始」按鈕，選擇 **Windows PowerShell**，切換到本資料夾，執行：

```powershell
.\install.ps1
```

如果看到「無法執行腳本」的錯誤，安裝程式會提示你是否自動修復，選 `Y` 即可。

### Windows — 命令提示字元

開啟**命令提示字元（CMD）**，切換到本資料夾，執行：

```
install.bat
```

---

## 第三步 — 啟動看板

安裝完成後，安裝腳本會為你產生一個啟動腳本。

### macOS 或 Linux

```bash
./run.sh
```

### Windows — PowerShell

```powershell
.\run.ps1
```

### Windows — 命令提示字元

```
run.bat
```

啟動後，開啟瀏覽器，前往：

```
http://localhost:5173
```

看板頁面會載入，你的智能體角色會出現在地圖上。

---

## 第四步 — 連接你的 OpenClaw

看板需要知道你的 OpenClaw 安裝在哪裡，才能讀取智能體資料。

用任何文字編輯器（如記事本、TextEdit、VS Code 等）開啟本資料夾中的 `.env.local` 檔案，找到並修改以下這行：

```
OPENCLAW_HOME=/你的/.openclaw路徑
```

將路徑替換為你實際的 OpenClaw 資料夾。OpenClaw 預設安裝在使用者主目錄下：

- **macOS / Linux：** `~/.openclaw`
- **Windows：** `C:\Users\你的使用者名稱\.openclaw`

### 所有可設定項說明

| 設定項                             | 作用                                               | 預設值                   |
| ---------------------------------- | -------------------------------------------------- | ------------------------ |
| `OPENCLAW_HOME`                    | OpenClaw 安裝目錄路徑                              | `~/.openclaw`            |
| `VITE_PUBLIC_DIR`                  | 素材包目錄路徑（角色、房間等圖片所在位置）         | `./public`               |
| `VITE_API_PORT`                    | 本地 API 伺服器使用的連接埠號                      | `3001`                   |
| `SHARED_ROOT`                      | 資源牆檔案瀏覽根目錄                               | `<OPENCLAW_HOME>/shared` |
| `VITE_SESSION_ACTIVE_THRESHOLD_MS` | 智能體被判定為「工作中」的最近活動時間閾值（毫秒） | `10000`                  |

一般情況下只需修改 `OPENCLAW_HOME`，其餘項保持預設即可。

修改 `.env.local` 後，需要重新啟動看板才能生效。

---

## 第五步 — 將智能體與角色對應

開啟素材包目錄中的 `world.json` 檔案（預設路徑：`public/world.json`）。

找到 `characters` 部分，每個角色的設定格式如下：

```json
{
  "id": "frieren",
  "agentId": "main",
  "name": "Frieren",
  "privateRoomId": "private-frieren",
  ...
}
```

- `id` — 角色在 `images/map/characters/` 下的資料夾名稱
- `agentId` — 必須與 OpenClaw 中對應智能體的 ID 完全一致（例如 `main`、`researcher`、`news-crawler`）
- `name` — 看板介面中顯示的角色名稱
- `privateRoomId` — 這個角色的私人房間 ID，需與同檔案中的某個房間 ID 對應

如果 `agentId` 與你 OpenClaw 中實際的智能體 ID 不符合，角色將無法回應即時資料。請在 OpenClaw 設定中確認正確的智能體 ID。

![OpenClaw agent configuration](documentation/images/openclaw-config-agents.png)

---

## 第六步 — 使用你自己的角色和房間（可選）

你可以將所有圖片素材替換成你自己的主題——喜歡的動漫、遊戲、VTuber 或原創角色。

最簡單的方法是複製一個現有素材包再修改：

1. 複製 `public_frieren` 資料夾，重新命名為你的包名，例如 `public_myfandom`。
2. 在 `.env.local` 中設定 `VITE_PUBLIC_DIR=./public_myfandom`。
3. 將資料夾內的圖片替換為你自己的素材。
4. 編輯 `world.json`，修改角色名與智能體 ID。

### 素材包的目錄結構

```
public_myfandom/
  world.json          ← 地圖佈局、房間設定、角色設定、物體位置
  clip-defs.json      ← 動畫片段定義（哪一行對應哪個動作）
  images/
    map/
      rooms/          ← 公共房間的地板和牆壁瓷磚圖片
      objects/        ← 公共物品圖片（桌子、沙發、裝飾品等）
      characters/
        <角色id>/
          inside.png    ← 在室內（私人房間）使用的精靈表單
          outside.png   ← 在辦公室使用的精靈表單
          room/         ← 該角色私人房間的地板和牆壁瓷磚
          object/       ← 該角色私人房間的專屬家具
```

如何用 AI 圖像工具產生角色精靈表單和物品圖片，請參考：

- **[README-assets.md](./README-assets.md)** — 繁體中文版 AI 素材生成指南
- **[README-assets-en.md](./README-assets-en.md)** — English guide for creating assets with AI

---

## 常見問題

**頁面空白或無法載入**

- 確認安裝腳本已成功完成。
- 確認看板仍在終端機中執行。
- 檢查 `VITE_PUBLIC_DIR` 是否指向包含 `world.json` 的資料夾。

**角色沒有動作 / 不回應智能體活動**

- 檢查 `.env.local` 中的 `OPENCLAW_HOME` 是否正確。
- 檢查 `world.json` 中的 `agentId` 是否與 OpenClaw 中的實際智能體 ID 完全一致。
- 確認 OpenClaw 正在執行。

**安裝腳本提示無法安裝 Node.js**

- macOS：請先安裝 [Homebrew](https://brew.sh)，再重新執行 `install.sh`。
- Windows：請手動從 [nodejs.org](https://nodejs.org) 下載並安裝 Node.js 22，然後重新執行 `install.bat`。

**提示連接埠 5173 或 3001 已被佔用**

- 在 `.env.local` 中將 `VITE_API_PORT` 改為其他連接埠號（例如 `3002`）。

---

## 停止看板

回到執行看板的終端機視窗，按下 `Ctrl + C`。
