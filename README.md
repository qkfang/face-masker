# face-masker

A local web app that detects faces in a photo, lets you pick which ones to mask, and saves the result as a separate image.

## Run

```
npm install
npm start
```

Open http://localhost:3000 (Chrome or Edge recommended).

## Use

1. **Choose photo…** and pick a local image. The original is shown on the left.
2. Faces are detected and drawn as bounding boxes, with a checklist on the right (thumbnail, estimated age, **Adult/Kid** category).
3. Select faces by ticking the checkbox **or** clicking a bounding box (on either image). Use **All / None / Kids / Adults** for bulk selection, and change a face's category if the age estimate is wrong.
4. The masked image updates live next to the original. Pick the mask type (motion blur by default, pixelate, blur, smiley face, solid black), shape, strength and opacity. Masks are slightly transparent by default (85%).
5. **Save masked photo** writes `<name>_masked.<ext>` (e.g. `holiday.jpg` → `holiday_masked.jpg`). In Chrome/Edge the save dialog opens in the original photo's folder; other browsers download the file. The original is never modified.

Everything runs in the browser; photos never leave your machine. Detection uses [@vladmandic/face-api](https://github.com/vladmandic/face-api) (SSD MobileNet + age/gender model). Age-based Adult/Kid is a rough estimate (under 18 = Kid). Saved images do not keep EXIF metadata.