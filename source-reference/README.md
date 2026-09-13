# Dattebayo

The homepage offers four modes. Practice Mode is playable; Single Player, Multi Player, and Survival Mode are marked coming soon.

## Practice Mode

Open the homepage and choose Practice Mode. Choose a jutsu and Naruto or Sasuke, allow camera access when prompted. The camera and recognition start automatically upon entering Practice Mode. Hold each highlighted sign for 450 ms at sufficient confidence. Complete all three signs to trigger a short character lunge and jutsu glow. Practice has no time limit and automatically starts a fresh sequence after each jutsu animation and callout. The combinations are abbreviated training versions, not full canonical sequences.

Changing a jutsu or character resets the current sequence. Leaving practice, hiding the tab, or stopping the camera stops its tracks and resets the sequence. No camera frames are recorded or uploaded.

Run `npm run build` for the static deployment output and `npm test` for the recognition and practice-state tests. Character artwork attribution is in `assets/CREDITS.md`. Full camera recognition still needs a manual test with real hand signs.

## Original seal webcam feasibility probe

This is a throwaway browser probe for checking whether real webcam hand landmarks can drive the Jutsu Hero seal classifier. It is deliberately a diagnostic page, not the game.

## Setup

1. Run `npm test` to execute the dependency-free Node tests.
2. Run `node scripts/build-standalone.mjs` to regenerate `probe.html` from `diagnostic.html`, `diagnostics.css`, and the original `src/app.js` and `src/probe-core.js`.
3. Open `probe.html` in Chrome, click **Load model**, then **Start camera**, and grant camera permission. The page also has a module version at `diagnostic.html` for a static local server.
4. Choose the reference seal, then use **Start single-sign trial** for one hold or choose three sequence dropdowns and use **Start sequence trial**. Start only after the live readout is producing real predictions.

The page needs network access for the pinned MediaPipe, ONNX Runtime, hand-landmarker, classifier, and reference image URLs. No package install is required. If the browser rejects camera access from a `file://` page, serve this directory from a local HTTPS or localhost static server.

## What it measures

- MediaPipe Tasks Vision `0.10.34`, up to four hands, raw video detection, CSS-mirrored preview.
- Two-hand input is normalized as 21 XY pairs per hand: subtract wrist point 0, divide by wrist-to-middle-MCP point 9, then concatenate primary and secondary hands into float32 `[1, 84]` input. A missing secondary hand is zero-filled.
- ONNX Runtime Web `1.17.3` uses one WASM thread. The first output is direct argmax with a `0.6` confidence threshold; there is no softmax.
- A recognized sequence sign must remain valid for about 350 ms. Missing hands, low confidence, or a wrong current frame reset the hold. Trials time out after 15 seconds.
- The log records sequence, success, elapsed sequence time, and measured inference durations. It never stores camera frames, video, landmarks, or model tensors. **Export JSON** contains only those records.

Reliability still requires a manual test with a real camera and varied lighting, distance, background, hand size, left/right ordering, and one- versus two-hand poses. A passing unit test or a high score is not a claim that seal recognition is reliable enough for a game.

## Attribution and license

The seal classifier and seal reference images are upstream assets from [bunkerapps/Jutsu-Hero](https://github.com/bunkerapps/Jutsu-Hero), pinned to commit [`10c5a914f9f14b4427d988d253048bf0fae8eb52`](https://github.com/bunkerapps/Jutsu-Hero/tree/10c5a914f9f14b4427d988d253048bf0fae8eb52). The classifier is loaded from the upstream raw asset at runtime; the probe does not redistribute or modify it. Review the upstream repository's license and asset terms before shipping or redistributing this prototype.

The hand-landmarker task is served by Google's MediaPipe model-hosting URL, and the browser libraries are served by jsDelivr. They are separate runtime dependencies from the Jutsu Hero assets; review their respective terms before reuse.

The probe code in this repository has no production or game license grant. It is an internal feasibility artifact and should not be treated as a release-ready product.

## Screen layout

Home and Practice Mode fill the browser viewport with no page or panel scrolling. Practice uses 40% camera, 20% hand signs, and 40% character stage. The camera uses `object-fit: contain` so its full frame scales without distortion or cropping. Mobile browsers use the dynamic viewport height to stay within the visible screen. The original standalone diagnostics also fit to one screen.

## Jutsu catalog

Edit `data/jutsus.json` to add or change jutsu. The practice menu loads this file directly. Each entry has a stable `id`, a display `name`, an elemental `type`, exactly three `handSigns`, and a `completionSoundtrack` path or `null`. All sequences are simplified gameplay combinations, not a claim about canonical hand seals. The unnamed second water entry is intentionally omitted.

Example audio assignment after adding your file:

```json
"completionSoundtrack": "./assets/audio/emotion-waves.mp3"
```

Existing Chidori and Fireball clips remain configured; other requested jutsu await your recordings. The build checks unique IDs, supported elements/signs, and referenced audio files.

## Homepage music

The game uses an invisible HTML audio element, with no YouTube player. Set `homepageMusic.src` in `data/audio.json` to a local audio asset, such as `./assets/audio/homepage.mp3`. The supplied Afternoon of Konoha MP3 is configured at `./assets/audio/homepage.mp3`. Playback is attempted automatically on home, retried on first interaction if blocked by autoplay policy, and paused in practice or when the page is hidden. The music toggle controls muting.

## Practice audio

Every correct sign triggers a weave sound. Completing three signs triggers a bell, then the configured completion clip. Null clips skip the callout while retaining both game cues. Changes of jutsu, character, or mode cancel pending playback. Historical source credits for existing files remain in `assets/audio/SOURCES.md`.
