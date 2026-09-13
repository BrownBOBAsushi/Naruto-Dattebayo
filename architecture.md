# Dattebayo basic battle architecture

Status: approved hackathon build specification. Implement only this smallest
playable slice; `architecture.md` is the source of truth for the build prompt.

## Reference hierarchy

Use the visual references in this order:

1. `handoff-references/naruto-rasengan-style-reference.png` and
   `handoff-references/sasuke-chidori-style-reference.png` are the sole
   character-appearance authority. Match their detailed, crisp arcade pixel
   style, proportions, shading, and pose progression. In the runtime, Naruto
   is on the right facing left and Sasuke is on the left facing right.
2. `street-fighter-layout-reference.png`, `gold-buttons-reference.png`,
   `valley-environment-reference.png`, `title-logo-reference.png`, and
   `battle-layout-reference.png` define the approved composition, controls,
   environment, title treatment, and lower HUD placement.
3. `secret-ending-composition-reference.png` defines the non-graphic ending
   composition. All supplied images are visual references only, not sprite
   sheets, atlases, or licensed source art.

See [`handoff-references/README.md`](handoff-references/README.md) for the
reference inventory, credits, and read-only handoff notes.

The [`source-reference/SOURCE.md`](source-reference/SOURCE.md) bundle is a
separate, read-only legacy prototype reference for implementation modules,
tests, CV details, and credited audio assets; it has no authority over
character appearance or art style. Prefer it over
requiring the old repository to be available; it must never bring over the old
repository's hosting identity or runtime paths.

## Product boundary

- The player is Sasuke Uchiha on the left, facing right.
- The CPU is Naruto Uzumaki on the right, facing left.
- Use Shippuden-inspired outfits and keep the approved orientation: Sasuke is
  on the left facing right in a gray open-collar outfit with purple rope;
  Naruto is on the right facing left in his black-orange outfit.
- The primary look is detailed, crisp arcade pixel art matching the two
  character style references, including their proportions, readable poses,
  and shading. Use `256x256` as the target frame canvas; preserve the visual
  detail of the references within that canvas.
- Use a Street Fighter-style composition with large opposing fighters, their
  names at the top, and mirrored segmented HP bars. Each bar has exactly three
  HP segments with equal widths and clear loss states.
- The arena occupies roughly the upper 60% of the viewport. Both fighters
  stand directly on the water surface of the Valley of the End: statues and a
  muted waterfall sit in the rear, with ripples, splashes, and reflections.
  Do not add platforms or a separate floor.
- Keep the webcam/status visible in the lower-left panel throughout play. Keep
  `NARUTO` untouched and cross only `SHIPPUDEN` with a rough red X, with
  handwritten `DATTEBAYO` underneath; a marker/stamp animation is optional.
- During `choose`, the lower-right panel contains the RPS choices. After a
  human RPS win, replace that panel with large three-step hand-sign prompts;
  the webcam remains visible while casting.
- Use brief `ROUND` and `FIGHT` callouts at round start. There is no timer and
  no combo counter.
- Use gold pixel-bevel buttons with normal, hover, pressed, and disabled
  states: `Play`, `Sound`, `Back`, and `Replay`. Do not add `Save` or `Quit`.
- Single Player is the active mode for this slice.
- Multi Player and Survival remain roadmap labels; they have no backend or flow.
- A small Practice entry may reuse the current practice page for CV diagnosis.

## Round contract

1. A new round is created with a monotonically increasing `roundGeneration`.
2. The CPU samples one RPS move uniformly from the three moves (1/3 each)
   before the player chooses.
3. The CPU move stays hidden; show `?` beside Naruto until reveal.
4. The player chooses rock, paper, or scissors with no countdown.
5. Reveal both moves simultaneously.
6. Evaluate the special ending before normal RPS tie handling.
7. If the special condition is false, evaluate the normal RPS winner.
8. A human win enters `humanCast`; only the third accepted sign may enter
   `humanAttack`, where Sasuke applies exactly one damage.
9. A CPU win enters `cpuAttack`, where Naruto applies exactly one damage with
   no human signs.
10. A normal tie applies zero damage and starts a fresh round with a new CPU
    move; it must not retry the same hidden move forever.
11. After a non-terminal attack, return to `choose` through a new round.

The CPU move is fixed before the player's selection and must not be rerolled
after the player chooses. The reveal is one logical event, even if its motion
and sound are asynchronous.

### RPS and damage

| Player move | Beats | Loses to |
| --- | --- | --- |
| Rock | Scissors | Paper |
| Paper | Rock | Scissors |
| Scissors | Paper | Rock |

- Human win: require three webcam signs; after the third accepted sign, Sasuke
  attacks Naruto and applies damage exactly once.
- CPU win: Naruto attacks automatically with a Rasengan; do not ask the human
  for signs.
- Each successful attack changes the target HP from `n` to `n - 1` once.
- Do not infer damage from confidence, animation timing, or visual effects.
- A successful human attack alternates Fireball, then Chidori, then Fireball;
  this keeps the basic slice deterministic.
- Fireball signs are `serpent → ram → tiger`.
- Chidori signs are `ox → hare → monkey`.
- RPS chooses the attacker; it does not choose the jutsu.

### Secret tie precedence

The special condition is true when both fighters have exactly one HP and both
choose the same RPS move. It has priority over the normal tie rule.

- Trigger it automatically after simultaneous reveal; there is no extra
  gesture gate.
- Set both HP values to zero in one logic transaction.
- Play a short Chidori/Rasengan clash cinematic.
- Show two exhausted, injured shinobi collapsed on rocks, with ruined
  hands/forearms implied by wrapping or obscuring them.
- Keep the scene non-graphic: no gore, blood, or exposed wounds.
- The secret ending is a valid terminal result, not a normal retry.

All other ties are ordinary ties: zero damage, no attack, and a fresh-round
retry. Cover the secret ending with a deterministic fixture; do not add a
public cheat control.

## State ownership

Keep rules in a pure round reducer or equivalent small module. Rendering and
camera code dispatch events; they do not mutate HP directly.

```text
menu
  -> ready
  -> choose (CPU move already sampled, Naruto shows ?)
  -> reveal (both moves visible)
  -> human-cast -> human-attack -> choose
  -> cpu-attack -> choose
  -> retry-tie -> choose
  -> secret-ending
  -> victory | defeat
```

Suggested state shape:

```ts
type Move = 'rock' | 'paper' | 'scissors';
type Phase = 'menu' | 'ready' | 'choose' | 'reveal' | 'humanCast' |
  'humanAttack' | 'cpuAttack' | 'retryTie' | 'secretEnding' |
  'victory' | 'defeat';

interface BattleState {
  phase: Phase;
  roundGeneration: number;
  playerHp: 0 | 1 | 2 | 3;
  cpuHp: 0 | 1 | 2 | 3;
  cpuMove: Move | null;
  playerMove: Move | null;
  nextJutsu: 'fireball' | 'chidori';
  pendingCast: boolean;
}
```

- `resolveReveal` returns `humanWin`, `cpuWin`, `normalTie`, or `secretEnding`.
- `applyDamage` is the only function allowed to change HP.
- Guard the reducer with `roundGeneration` and ignore stale events.
- For a human win, call `applyDamage` only after the third accepted sign and
  only once in `humanAttack`; animation completion must never call it again.
- For a CPU win, call `applyDamage` once when `cpuAttack` resolves.
- If target HP remains above zero, create a new round and return to `choose`;
  this is a non-terminal path. If target HP reaches zero, enter the matching
  normal victory or defeat state.
- A normal tie creates a fresh round and rerolls the CPU move.
- A terminal state rejects later camera, timeout, animation, and network events.
- The secret-ending branch wins over `normalTie` when its two HP checks pass.
- A Replay button starts a new game at HP `3/3`, clears both moves, resets the
  jutsu cycle, and increments the generation so stale timers cannot act.

## Human casting and camera recovery

- Human casting has no time limit.
- Start the three-sign sequence only after a human RPS win.
- The third accepted sign is the human damage gate; earlier signs never change
  HP and a cast animation must not apply damage before it.
- Use the existing continuous-hold behavior: the current sign must be valid at
  confidence `>= 0.6` for `450 ms`.
- If inference stalls for more than `500 ms`, reset only the current hold.
- A camera retry button is optional. If the player cancels the failed cast,
  consume the round with zero damage and return to `ready`; never soft-lock.
- Low confidence, wrong signs, missing hands, and camera loss cause no damage.
- There is no confidence-based bonus, penalty, or attack decision.
- On visibility loss, stop camera tracks and invalidate the current generation.
- On retry, rebuild camera state and keep HP unchanged.

For future levels, confidence is not a calibrated accuracy score. If measured
performance is added later, store hold duration, latency, and completion rate;
do not label confidence as recognition accuracy.

## Computer vision contract

Reuse the proven local core selectively from the bundled `source-reference/`
snapshot. It is read-only migration material containing the pinned CV modules,
tests, and credited audio assets; do not copy the old repository's page,
hosting config, or project identity into the new repository.

- MediaPipe Tasks Vision `0.10.34`, `VIDEO` mode, up to two hands in the game.
- ONNX Runtime Web `1.17.3`, WASM execution, one thread.
- Hand model: Google's official `hand_landmarker.task`, float16, version `1`.
- Classifier: upstream Jutsu Hero `seal_classifier.onnx`, pinned to commit
  `10c5a914f9f14b4427d988d253048bf0fae8eb52`.
- The classifier input is `float32[1,84]`: two hands × 21 landmarks × XY.
- For each hand, subtract wrist point `0` and divide by `hypot(wrist 0,
  middle MCP 9)`; zero-fill a missing hand.
- Hand ordering is handedness-aware: left primary, right secondary.
- If handedness is missing or ambiguous, sort the retained hands by wrist `x`.
- With one detected hand, put it in primary and zero-fill secondary.
- If the scale denominator is zero, use `1` so the tensor remains finite.
- Mirror the raw video with CSS for the player's preview; keep model landmarks
  in the unmirrored source coordinate convention.
- Use these exact output labels in order: rat, ox, tiger, hare, dragon,
  serpent, horse, ram, monkey, bird, dog, boar.
- Use direct argmax with threshold `0.6`; no new classifier training.
- A valid hold lasts `450 ms`; an inference stall over `500 ms` resets it.
- Keep webcam frames, landmarks, and tensors in memory; do not upload them.

The bundled `source-reference/` snapshot's `src/probe-core.js`,
`src/practice-core.js`, model-loading sections, tests, and audio provenance are
migration references. The
prototype tests cover tensor shape/order, argmax threshold, hold timing, and
stall reset. They do not prove generation guards or reliable recognition with a
real webcam; the new reducer and async guards need their own tests.

Portable model URLs for a new repository:

- MediaPipe WASM: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm`
- ONNX Runtime WASM: `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/`
- Hand task: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`
- Seal classifier: `https://raw.githubusercontent.com/bunkerapps/Jutsu-Hero/10c5a914f9f14b4427d988d253048bf0fae8eb52/public/assets/seal_classifier.onnx`

The historical Dattebayo source reference is pinned at
`https://github.com/BrownBOBAsushi/Dattebayo/tree/f7ce99f13b0eab5146afec1a047babeb034ab3c1`.
Use the local bundle first and treat that URL as provenance only; do not depend
on the historical repository's runtime paths, hosting configuration, or
project identity.

## Rendering and layout

- Use Vite, vanilla TypeScript, Canvas2D for the arena, and ordinary DOM for
  buttons, HP, status, webcam, title, and end-state text.
- Keep combat logic independent of Canvas2D so reducer tests run in Node.
- Use a fixed logical canvas coordinate system and scale to the upper arena.
- Keep Sasuke's feet on a stable pivot grid; Naruto uses the same convention.
- Fix facing in the asset manifest; do not flip an already authored frame at
  runtime unless a test explicitly proves the pivot remains correct.
- Draw the muted rear statues and waterfall first, then the water surface,
  ripples, splashes, reflections, fighters, and VFX. Keep the effect count
  modest on laptop hardware; there are no platforms or separate floor.
- Show brief `ROUND` and `FIGHT` callouts only; do not add a timer or combo UI.
- Use gold pixel-bevel `Play`, `Sound`, `Back`, and `Replay` buttons with
  normal, hover, pressed, and disabled states. Do not add `Save` or `Quit`.
- Hitstop is time-limited to `100 ms`; add a small camera shake and sound cue.
- Respect `prefers-reduced-motion`: shorten or remove shake, particles, and
  nonessential looping motion while preserving state and attack readability.
- Render HP from state after each reducer event. Never derive HP from sprite
  frame numbers.

## Asset plan

The new repo must contain runtime assets under relative paths such as
`public/assets/...`; no absolute filesystem paths may appear in browser code.
Generated art is original game production material. Supplied images are visual
references only and must not be treated as finished atlases or licensed source
art.

Required first-pass manifest (each item has `id`, `file`, `facing`, `pivot`,
`trimmed`, `fps`, dimensions, and `source` metadata):

| Group | Required assets |
| --- | --- |
| Sasuke body | idle, cast, dash, hit, victory, defeat |
| Naruto body | idle, cast, dash, hit, victory, defeat |
| Human VFX | fireball charge/release, Chidori charge/release |
| CPU VFX | Rasengan charge/release, impact |
| Environment | Valley of the End background, water surface, segmented HP bars |
| Endings | normal victory, normal defeat, non-graphic secret clash/collapse |

Proposed concrete frame manifest; hold the last frame where fewer frames are
needed. Dimensions are source canvases before trim, and pivots are `x,y`:

| File pattern | Frames | Canvas | FPS | Facing | Pivot |
| --- | ---: | ---: | ---: | --- | ---: |
| `sprites/sasuke/idle_{00..03}.png` | 4 | 256x256 | 8 | right | 128,244 |
| `sprites/sasuke/cast_{00..02}.png` | 3 | 256x256 | 12 | right | 128,244 |
| `sprites/sasuke/dash_{00..03}.png` | 4 | 256x256 | 14 | right | 128,244 |
| `sprites/sasuke/hit_{00..01}.png` | 2 | 256x256 | 10 | right | 128,244 |
| `sprites/sasuke/victory_{00..01}.png` | 2 | 256x256 | 8 | right | 128,244 |
| `sprites/sasuke/defeat_{00..01}.png` | 2 | 256x256 | 6 | right | 128,244 |
| `sprites/naruto/idle_{00..03}.png` | 4 | 256x256 | 8 | left | 128,244 |
| `sprites/naruto/cast_{00..02}.png` | 3 | 256x256 | 12 | left | 128,244 |
| `sprites/naruto/dash_{00..03}.png` | 4 | 256x256 | 14 | left | 128,244 |
| `sprites/naruto/hit_{00..01}.png` | 2 | 256x256 | 10 | left | 128,244 |
| `sprites/naruto/victory_{00..01}.png` | 2 | 256x256 | 8 | left | 128,244 |
| `sprites/naruto/defeat_{00..01}.png` | 2 | 256x256 | 6 | left | 128,244 |
| `vfx/{fireball,chidori,rasengan}/frame_{00..03}.png` | 4 each | 192x192 | 16 | varies | 96,96 |
| `backgrounds/valley-of-the-end.png` | 1 | 1920x720 | static | n/a | 0,0 |
| `endings/{victory,defeat,secret-clash}.png` | 1 each | 1920x720 | static | n/a | 0,0 |

Asset rules:

- Generate fixed-facing Sasuke/Naruto frames with clear feet on the water
  surface, the muted Valley of the End statues/waterfall backdrop, and the
  non-graphic wrapped/obscured secret ending.
- Separate body sprites from VFX; use real alpha, no checkerboard, and no text.
- Trim bounds, preserve the feet pivot, and keep the crisp arcade pixel
  treatment and detailed shading of the character references.
- Validate alpha, dimensions, frame order, and pivot metadata with a small
  preview sheet before integrating. Prefer frames or small atlases; no huge
  sprite sheet. Prioritize idle/cast/dash/hit/victory/defeat.
- Character appearance follows the two style references named in the reference
  hierarchy. The other files in `handoff-references/` control their stated
  layout, environment, controls, title, and ending decisions; all are
  read-only visual samples and are not atlases or license grants.

Copy-paste generation prompts:

- Fighter: “Detailed, crisp arcade pixel-art side-view game sprite matching
  `naruto-rasengan-style-reference.png` or
  `sasuke-chidori-style-reference.png` for character design, proportions,
  shading, and pose progression; [Sasuke in a gray open-collar outfit with
  purple rope/Naruto in a black-orange outfit], readable
  idle/cast/dash/hit/victory/defeat poses, fixed [right/left] facing, feet on
  a shared baseline, transparent background, crisp edges, no checkerboard, no
  text, no copied anime frame.”
- Background: “Detailed, crisp arcade pixel-art wide side-on Valley of the End
  matching the visual density and shading of the character style references;
  giant statues and a muted waterfall in the rear, shallow reflective water
  surface, ripples, splashes, and reflections, no platforms or separate floor,
  no characters, no UI, no text.”
- Secret ending: “Detailed, crisp arcade pixel-art ending composition matching
  the character style references: exhausted Sasuke and Naruto collapsed on
  rocks after a Chidori/Rasengan clash, wrapped or obscured hands and forearms,
  dramatic smoke and dusk light, no blood, gore, exposed wounds, or text.”

If the image-generation tool is unavailable, report that fact and use only a
temporary greybox or clearly marked placeholder for local verification. Do not
claim the generated art is finished.

## Audio

- Use synthesized original Web Audio cues for select, reveal, cast, hit,
  victory, defeat, secret clash, and a quiet looping ambience/music bed.
- Unlock from Start; mute controls ambience and SFX. Stop and clear queued
  sources when a round, mode, or page ends; use procedural ambience if an
  optional music file is unavailable.
- Null-safe audio must never block a state transition.
- Existing MP3/WAV files may be optional references only. Preserve provenance
  from `assets/audio/SOURCES.md`; do not imply blanket redistribution rights.
- The basic game remains playable when all optional clips fail to load.

## Delivery sequence

1. New-repo greybox: layout, RPS/sign panel, reducer, HP, both normal endings,
   and the secret precedence fixture.
2. Browser CV: reuse the pinned model contract and prove camera start, stop,
   visibility retry, hold timing, and stale-generation guards.
3. Generate and validate the small asset manifest; replace greybox art.
4. Add motion, VFX, hitstop, reduced-motion handling, and null-safe audio.
5. Run unit tests and local build checks, then record local acceptance.
6. After separate human authorization, deploy the static site and run a hosted
   smoke test with a real camera. Public hosting is possible, but webcam
   reliability is not certified by a build passing.

Do not add multiplayer services, survival persistence, authentication, a
database, server-side camera processing, a time limit, confidence calibration,
or a new classifier in this slice.

## Acceptance gates

- The visible Street Fighter-style layout matches the water arena, webcam,
  title, names, mirrored three-segment HP bars, conditional RPS/sign panel,
  and fighters' facing directions.
- CPU move is fixed before player choice, remains `?`, then reveals together.
- All nine ordered RPS combinations resolve to the expected winner/tie.
- A normal tie deals zero, rerolls the CPU in a fresh round, and can retry; no
  timer is required.
- A human win asks for exactly three signs; only the third accepted sign starts
  human damage. A CPU win auto-attacks.
- Human and CPU attacks each subtract exactly one HP once.
- At both HP `1`, a same-move tie reaches the secret ending and sets both HP to
  zero; it does not enter the normal retry path.
- HP `0` produces the correct normal victory/defeat unless the secret ending
  is selected by its higher-precedence rule.
- Camera stop, hidden tab, cancelled retry, stale inference, and stale
  animation events cannot damage HP or leave the game stuck.
- New unit tests cover reducer outcomes, HP idempotence, jutsu alternation, CV
  normalization, threshold, `450 ms` hold, `500 ms` stall, and generation IDs.
- A local production build succeeds. After authorized deployment, a hosted
  smoke test records browser, camera permission, model load, one real sign
  attempt, mute, and reduced motion.
- Any untested webcam or asset-generation behavior is reported as untested.
