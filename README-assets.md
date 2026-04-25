# 素材製作指南（繁體中文版）

本指南介紹如何使用 AI 圖像工具，為看板產生自訂角色和主題所需的全部圖片素材。

> 本指南中的提示詞已在 **Nano Banana 2** 上測試通過。
> 產生效果因模型而異，可能需要多次嘗試才能獲得滿意結果。

---

## 概覽

一個素材包需要兩類圖片：

| 類型             | 說明                                           |
| ---------------- | ---------------------------------------------- |
| **物品圖片**     | 房間家具、裝飾品和道具的靜態圖片               |
| **角色精靈表單** | 包含多行動作幀的動畫圖集（行走、坐下、工作等） |

---

## 第一部分 — 物品圖片

物品圖片是單張靜態圖：桌子、床、沙發、寶箱、裝飾品等。

### 提示詞模板

**需要附上的參考圖：**

1. 來自你的動漫或遊戲的參考圖，包含你想製作的物品
2. 現有素材包中同類物品的圖片，用於對齊角度和方向（例如 `public_frieren/images/map/objects/desk.png`）

```
Create a pixel art of the [物品名稱] in reference image 1, with the facing and orientation matching reference image 2. The result should not include any people, and should have a plain white background.
```

> 提示詞用英文效果通常更好，但中文提示詞也可以嘗試。

### 範例提示詞

```
Create a pixel art of the treasure chest in reference image 1, with the facing and orientation matching reference image 2. The result should not include any people, and should have a plain white background.
```

### 小技巧

- 始終提供一張方向參考圖（第 2 張圖）——像素風家具需要保持一致的俯視角度。
- 產生時使用純白背景，方便後續處理或裁切。
- 如果產生的物品比例不對，可以補充描述，例如「大小約與一個角色等高」。

---

## 第二部分 — 角色精靈表單

精靈表單是一張包含角色所有動畫幀的大圖，按行排列，每一行代表一個動作。

看板預設使用以下行佈局（由 `clip-defs.json` 定義）：

以 `public_frieren` 為例：

| 行號        | 動作   | 幀數 |
| ----------- | ------ | ---- |
| 0           | 站立。 | 3    |
| 1           | 向下走 | 3    |
| 2           | 向上走 | 3    |
| 3           | 向左走 | 3    |
| 4           | 坐下   | 2    |
| 5（室內版） | 睡覺   | 2    |
| 5（室外版） | 工作。 | 6    |

每幀尺寸為 **64 × 64 像素**。向右走會由程式自動將向左走的行水平翻轉得到，無需單獨產生。

### 提示詞模板

**需要附上的參考圖：**

1. 來自動漫、遊戲或原創來源的角色參考圖
2. 現有素材包中的精靈表單，作為佈局參考（例如 `public_frieren/images/map/characters/frieren/inside.png`）

```
Create a chibi pixel art sprite sheet of this character.

The following must strictly match the sprite sheet sample (reference image 2):
- The actions and number of frames per row.
- The position of each frame within the sheet.
- The direction the character faces in each action.

Each row contains the frames for one action.

The actions are: stand and read a book, walk down, walk up, walk left, sit, sleep.

The character's appearance must be consistent across all frames and must match reference image 1 closely.
All frames must show the full body.
Do not add any furniture or background elements.

This character [在此描述角色的外貌、個性或標誌性特徵].
```

### 範例提示詞

```
Create a chibi pixel art sprite sheet of this character.

The following must strictly match the sprite sheet sample (reference image 2):
- The actions and number of frames per row.
- The position of each frame within the sheet.
- The direction the character faces in each action.

Each row contains the frames for one action.

The actions are: stand and read a book, walk down, walk up, walk left, sit, sleep.

The character's appearance must be consistent across all frames and must match reference image 1 closely.
All frames must show the full body.
Do not add any furniture or background elements.

This character is a female elf wizard. She has a calm, neutral expression and occasionally gives a faint smile. She wears a white robe and a large pointed hat.
```

---

## 第三部分 — 補充工作動作行（outside.png）

`outside.png` 與 `inside.png` 內容基本相同，區別在於第 5 行替換為「工作」動畫（例如施法、打字、專注思考），而不是睡覺動畫。

建議在產生主精靈表單的**同一對話**中繼續產生這一行，這樣 AI 已經記住了角色的外觀。

### 提示詞模板

**需要附上的參考圖：**

1. 角色參考圖
2. 現有的 `outside.png` 精靈表單，用於佈局參考

```
Create a chibi pixel art sprite sheet of [him/her] showing the action: [描述動作], facing the viewer. [可選：補充具體細節，例如「她的法杖尖端出現了一個魔法陣」]. All frames must show the full body. The style, proportions, and outfit must exactly match the previously generated sprite sheet.
```

### 範例提示詞

```
Create a chibi pixel art sprite sheet of her showing the action: casting a spell, facing the viewer. A magic circle glows at the tip of her staff. All frames must show the full body. The style, proportions, and outfit must exactly match the previously generated sprite sheet.
```

---

## 第四部分 — 房間地板與牆壁瓷磚

每個角色的私人房間需要地板和牆壁瓷磚圖片，這些圖片會橫向平鋪填滿房間。

最簡單的方式是直接從 `public_frieren/images/map/characters/<角色名>/room/` 中取出現有瓷磚圖片，按你的主題重新著色或重繪。

---

## 將素材放入素材包

產生好所有圖片後，按以下結構放入你的素材包資料夾：

```
public_myfandom/
  world.json
  clip-defs.json
  images/
    map/
      rooms/
        office/
          floor/   ← left.png, center.png, right.png, bottom*.png
          wall/    ← left.png, center.png, right.png
        living/
          floor/   ← 同上
          wall/    ← 同上
        corridor/
          floor/   ← left.png, center.png, right.png
      objects/     ← desk.png, sofa.png, bed.png 等
      characters/
        <角色id>/
          inside.png   ← 完整精靈表單（第 0–5 行，第 5 行為睡覺）
          outside.png  ← 完整精靈表單（第 0–5 行，第 5 行為工作）
          room/
            floor.png
            wall.png
          object/
            bed.png
            decor1.png  ← （可選，額外裝飾品）
```

完成後，更新 `world.json` 中的圖片路徑，並在 `.env.local` 中將 `VITE_PUBLIC_DIR` 指向你的素材包資料夾。

詳細的 `world.json` 設定說明請參考主使用指南：[README.md](./README.md)
