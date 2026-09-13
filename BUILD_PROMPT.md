# Paste-ready build prompt for Astra

Build the approved basic Dattebayo single-player battle in this new repository
immediately. Read `START_HERE.md` and `architecture.md` first; they are the
source of truth. Implement only the basic slice and follow the new repository's
instructions. Do not start a new brainstorming or approval loop. Do not inherit
an old `.openai/hosting.json` project id.

Use [`handoff-references/README.md`](handoff-references/README.md) for the
visual reference hierarchy and [`source-reference/SOURCE.md`](source-reference/SOURCE.md)
for the pinned, read-only legacy prototype implementation and audio references.
`naruto-rasengan-style-reference.png` and
`sasuke-chidori-style-reference.png` are the sole character-appearance
authority for style, proportions, shading, and pose. The other six handoff
images define the approved arena, HUD, environment, controls, title, and
ending composition.

Use Vite + vanilla TypeScript + Canvas2D + DOM HUD. Start with a functioning
greybox, then use detailed, crisp arcade pixel sprites matching the two
character style references. The target frame canvas is `256x256`; preserve the
reference detail within it. Keep Sasuke left facing right in a gray
open-collar/purple-rope outfit and
Naruto right facing left in black-orange. Use a Street Fighter-style layout
with large opposing fighters, names at the top, and mirrored segmented HP bars
with three segments each. Set the Valley of the End water surface in the upper
~60%, with muted rear statues/waterfall, ripples, splashes, and reflections;
there are no platforms or separate floor. Keep the webcam/status lower-left.
The title keeps `NARUTO` untouched, crosses only `SHIPPUDEN` with a rough red X,
and puts handwritten `DATTEBAYO` underneath. Single Player is active; Multi
Player and Survival are labels only.

Use brief `ROUND` and `FIGHT` callouts, with no timer and no combo counter. Use
gold pixel-bevel `Play`, `Sound`, `Back`, and `Replay` buttons with normal,
hover, pressed, and disabled states; do not add `Save` or `Quit`. During RPS
choice the lower-right panel has rock/paper/scissors controls. After a human
win, replace that panel with large three-step hand-sign prompts while the
webcam remains visible.

Implement this exact round flow: sample the CPU uniformly 1/3 per move and hide
it before player choice (`?` by Naruto); reveal both simultaneously; special
ending first; otherwise normal RPS. A human win enters webcam casting and only
the third accepted sign may start `humanAttack` and deal one damage. A CPU win
auto-attacks with a Rasengan, no human signs, and deals one damage. After a non-terminal
attack, start a fresh round and return to choose. Normal ties deal zero and
start a fresh round with a rerolled CPU move. If both HP are 1 and both moves
match, automatically set both HP to 0 and show a non-graphic Chidori/Rasengan
clash ending with wrapped/obscured injured hands/forearms; there is no extra
gesture gate.

Keep rules in a tested reducer. Guard every async camera, inference, audio, and
animation callback with a monotonically increasing round generation. HP changes
only in logic, never in animation. Human casting has no time limit. Camera
cancel/retry must not soft-lock; cancellation consumes the round for zero
damage and returns to ready. No confidence-based damage or calibrated accuracy.

Reuse only the useful local CV core from the read-only `source-reference/`
bundle as migration reference (`src/probe-core.js`, `src/practice-core.js`,
relevant model loading, tests, and credited audio). Copy only needed source
into the new repo. The historical source URL is provenance only:
`https://github.com/BrownBOBAsushi/Dattebayo/tree/f7ce99f13b0eab5146afec1a047babeb034ab3c1`.
Do not depend on its runtime paths, hosting configuration, or project identity.
Use MediaPipe Tasks Vision
0.10.34, ONNX Runtime Web 1.17.3 WASM one thread, Google's official float16/1
`hand_landmarker.task`, and the Jutsu Hero classifier pinned to commit
`10c5a914f9f14b4427d988d253048bf0fae8eb52` at
`https://raw.githubusercontent.com/bunkerapps/Jutsu-Hero/10c5a914f9f14b4427d988d253048bf0fae8eb52/public/assets/seal_classifier.onnx`.
Use the hand task at
`https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`.
Preserve float32 `[1,84]` input,
wrist-relative/hypot wrist9 normalization, left-primary/right-secondary or
wrist-x fallback ordering, the exact 12 labels, threshold `.6`, `450 ms` hold,
and `500 ms` stall reset. With one hand use primary plus zero secondary; use
denominator `1` when wrist-to-MCP scale is zero; mirror only the raw video with
CSS. Do not train a classifier.

Use Fireball `serpent → ram → tiger` and Chidori `ox → hare → monkey`; alternate
them after human successful attacks. RPS never selects the jutsu.

Generate original detailed, crisp arcade pixel-art runtime art using the exact
manifest and prompts in `architecture.md`, matching the two character style
references for appearance: fixed-facing Sasuke/Naruto idle,
cast, dash, hit, victory, and defeat; separate charge/release VFX; the water
surface Valley of the End backdrop; and the non-graphic secret ending. Render
sprites with target frame canvases of `256x256`. Use relative runtime paths,
real alpha, trimmed frames, stable feet pivots, and preview validation. All
files in `handoff-references/` are visual samples only, not validated runtime
atlases or licensed source art. If image generation is unavailable, report it
and use clearly marked temporary greybox placeholders; do not fake completion.

Add cheap water/parallax/particles, 100 ms hitstop, small shake, sound cues, and
`prefers-reduced-motion` handling. Use original synthesized Web Audio basics,
including quiet looping ambience with a procedural fallback; unlock on Start,
provide mute, stop queues, and keep optional existing MP3/WAV clips null-safe
with provenance. Do not imply blanket rights. Add Replay to reset HP to 3/3,
moves, jutsu cycle, timers, and generations for every ending.

Work in this order: greybox/reducer, CV/recovery, assets, motion/VFX/audio,
tests, and local acceptance. Do not deploy in this initial build unless
separately instructed. If deployment is later authorized, run a hosted smoke
test after deployment. Test all nine RPS outcomes, fresh-round
CPU reroll on ties, secret precedence, third-sign-only human damage, one-time
HP damage, non-terminal return to choose, jutsu alternation, stale generations,
camera visibility/retry, CV normalization/threshold/hold/stall, audio failure,
and normal victory/defeat. Run the local build and relevant tests. Report exact
files changed, commands and results, and clearly separate tested behavior from
untested webcam reliability or unavailable image generation. Do not push,
merge, release, or claim deployment.
