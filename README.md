# GIF Studio

A browser-based GIF editor: import a GIF (or a PNG / JPG), trim unwanted segments, animate layers
with position / scale / rotation / opacity keyframes, add text, and export a brand new GIF.

Everything runs locally in the browser — your files are never uploaded anywhere.

## Features

- **Import**: GIFs (frame delays, transparency and disposal methods are parsed and composed) and
  still images (PNG / JPG / WebP). You can also drop a file anywhere on the page.
- **Trim & cut**: select a range on the timeline and either keep only that range or cut it out.
  Cutting ripples the rest of the timeline, so keyframes after the cut keep their relative timing
  and the animation keeps playing in place.
- **Text layers**: multi-line text with font, size, weight, fill, stroke, line height, letter
  spacing, alignment and a drop shadow.
- **Keyframe animation**: every layer has X, Y, scale, rotation and opacity tracks. Move the
  playhead, click the **◆** next to a property to record a keyframe, then change the value — the
  edit is written at the playhead. Each keyframe can use linear, ease-in-out or hold (step) easing.
- **Animation presets**: zoom in/out, fade in/out, pop in, bounce, shake, spin 360° and pan across.
- **Timeline**: shows every source frame boundary; scrub the playhead, drag keyframes to retime
  them, Alt + click to delete one, and drag the range handles to pick a trim range.
- **Export GIF**: output scale, colour count (64 / 128 / 256), loop count, playback speed and an
  optional transparent background. You can also export the current frame as a PNG.
- **Canvas**: custom output size and background colour (or transparent).
- **Shortcuts**: `Space` play/pause, `←→↑↓` nudge the selected layer (`Shift` for bigger steps),
  `I` / `O` set the trim in / out point, `Ctrl/Cmd + Z` undo, `Ctrl/Cmd + Shift + Z` redo.

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build
```

## Deploying to GitHub Pages

The repository ships with [.github/workflows/deploy.yml](.github/workflows/deploy.yml): pushing to
`main` installs dependencies, runs the type check, builds and deploys to GitHub Pages.

One-time setup in the repository:

1. Open **Settings → Pages**.
2. Set **Build and deployment → Source** to **GitHub Actions**.
3. Push to `main` (or trigger `Deploy to GitHub Pages` manually from the Actions tab).

`vite.config.ts` uses a relative base (`base: './'`), so the build also works from a project
sub-path such as `https://<user>.github.io/<repo>/`.

## How it works

| Module | Purpose |
| --- | --- |
| [gifuct-js](https://github.com/matt-way/gifuct-js) | Parses GIF frames, delays, transparent index and disposal methods |
| [gifenc](https://github.com/mattdesl/gifenc) | Colour quantisation + LZW encoding, with per-frame palettes and transparency |
| Canvas 2D | Frame composition and the live preview renderer |
| React + TypeScript + Vite | UI, state management and tooling |

The project keeps two parallel arrays: `delays` (how long each output frame lasts) and `frameTimes`
(which point of the source loop that frame samples). Trimming simply removes entries from both, so
the remaining frames keep showing the part of the animation they originally showed. On export every
frame is rendered to an offscreen canvas at its timeline position, quantised and written to the GIF,
which is why keyframe animation, trimming and text all end up in the exported file.
