# Asset Creation Guide (English)

This guide shows you how to generate all the image assets needed to reskin the dashboard with your own characters and theme using an AI image tool.

> The prompts in this guide have been tested with **Nano Banana 2**.
> You may need to generate a few times and pick the best result.

---

## Overview

An asset pack needs two types of images:

| Type                        | What it is                                                             |
| --------------------------- | ---------------------------------------------------------------------- |
| **Object images**           | Static images for room furniture, decorations, and props               |
| **Character sprite sheets** | Animation sheets with multiple rows of actions (walk, sit, work, etc.) |

---

## Part 1 — Object Images

Object images are single static pictures: desks, beds, sofas, treasure chests, decorations, and so on.

### Prompt template

**Input images to attach:**

1. A reference image from your anime or game showing the object you want
2. A similar object image from an existing asset pack to match the angle and orientation (e.g. `public_frieren/images/map/objects/desk.png`)

```
Create a pixel art of the [object] in reference image 1, with the facing and orientation matching reference image 2. The result should not include any people, and should have a plain white background.
```

### Example prompt

```
Create a pixel art of the treasure chest in reference image 1, with the facing and orientation matching reference image 2. The result should not include any people, and should have a plain white background.
```

### Tips

- Always provide an orientation reference (image 2) — pixel art furniture needs a consistent top-down-ish angle.
- Generate on a plain white background so it is easy to remove or work with later.
- If the result looks too small or too large, describe the desired size relative to a character ("roughly the same height as a character").

---

## Part 2 — Character Sprite Sheets

A sprite sheet is a single image containing all animation frames for one character, arranged in rows. Each row is one action.

The dashboard uses the following row layout by default (defined in `clip-defs.json`):

For example, defined in `public_frieren`:

| Row         | Action            | Frames |
| ----------- | ----------------- | ------ |
| 0           | Stand.            | 3      |
| 1           | Walk down         | 3      |
| 2           | Walk up           | 3      |
| 3           | Walk left         | 3      |
| 4           | Sit               | 2      |
| 5 (inside)  | Sleep             | 2      |
| 5 (outside) | Work.             | 6      |

Each frame is **64 × 64 pixels**. Walk right is derived automatically by flipping the walk-left row horizontally — you do not need to generate it.

### Prompt template

**Input images to attach:**

1. A reference image of your character from the anime, game, or source material
2. An existing sprite sheet from the asset pack to use as a layout reference (e.g. `public_frieren/images/map/characters/frieren/inside.png`)

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

This character [describe your character's appearance, personality, or notable features].
```

### Example prompt

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

## Part 3 — Adding an Extra Action Row (outside.png)

The `outside.png` sprite sheet is the same as `inside.png` but with row 5 replaced by a "work" animation (e.g. casting a spell, typing, concentrating) instead of a sleep animation.

You can generate this extra row in the **same conversation** as the main sprite sheet, so the model already knows the character's appearance.

### Prompt template

**Input images to attach:**

1. Your character reference image
2. An existing `outside.png` sprite sheet for layout reference

```
Create a chibi pixel art sprite sheet of [him/her] showing the action: [describe the action], facing the viewer. [Optional: describe specific details, e.g. "a magic circle appears at the tip of her staff"]. All frames must show the full body. The style, proportions, and outfit must exactly match the previously generated sprite sheet.
```

### Example prompt

```
Create a chibi pixel art sprite sheet of her showing the action: casting a spell, facing the viewer. A magic circle glows at the tip of her staff. All frames must show the full body. The style, proportions, and outfit must exactly match the previously generated sprite sheet.
```

---

## Part 4 — Room Tiles

Each character's private room needs floor and wall tile images. These are tiled horizontally to fill the room.

The simplest approach is to take existing tile images from `public_frieren/images/map/characters/<name>/room/` and recolour or repaint them to match your theme.

---

## Placing Assets into Your Pack

Once you have generated all images, place them in your asset pack folder following this structure:

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
          floor/   ← same as above
          wall/    ← same as above
        corridor/
          floor/   ← left.png, center.png, right.png
      objects/     ← desk.png, sofa.png, bed.png, etc.
      characters/
        <character-id>/
          inside.png   ← full sprite sheet (rows 0–5, sleep at row 5)
          outside.png  ← full sprite sheet (rows 0–5, work at row 5)
          room/
            floor.png
            wall.png
          object/
            bed.png
            decor1.png  ← (optional extra decorations)
```

Then update `world.json` to reference the correct image paths, and set `VITE_PUBLIC_DIR` in `.env.local` to your pack folder.
