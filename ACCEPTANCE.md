# Dattebayo basic battle — acceptance record

Repository: `/Users/desmondchyezhihao/Github/Naruto-Dattebayo`.
Recorded: 13 September 2026.

The approved basic single-player slice is implemented with Vite, vanilla TypeScript, Canvas2D, and a DOM HUD. Automated checks pass for the temporary greybox. Browser acceptance, real webcam reliability, the GPT-image-2.5 art pass, and deployment remain incomplete.

## Created or edited files

This inventory covers the whole implementation, including files captured in the externally created checkpoint `12a0ed7` and subsequent reviewed repairs committed on `codex/basic-battle-review-fixes`.

| Area | Exact files |
| --- | --- |
| App setup | `.gitignore`, `index.html`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` |
| UI and rendering | `src/main.ts`, `src/styles.css`, `src/presentation.ts`, `src/assets.ts` |
| Rules | `src/game/reducer.ts` |
| Camera and CV | `src/cv/core.ts`, `src/cv/camera.ts`, `src/cv/models.ts` |
| Sound | `src/audio.ts` |
| Pending art inventory | `public/assets/manifest.json`, `public/assets/README.md` |
| Tests | `tests/reducer.test.ts`, `tests/cv.test.ts`, `tests/camera.test.ts`, `tests/camera-candidate.test.ts`, `tests/models.test.ts`, `tests/audio.test.ts`, `tests/audio-candidate.test.ts`, `tests/assets.test.ts`, `tests/presentation.test.ts` |
| Delivery | `.openai/hosting.json`, `ACCEPTANCE.md` |

`START_HERE.md`, `architecture.md`, `BUILD_PROMPT.md`, `handoff-references/`, and `source-reference/` remain source/reference material. The production build excludes both reference bundles. No historical hosting identity was reused.

## Automated verification

Final independent review: **PASS**, with no P1/P2 findings. The fresh reviewer independently ran the tests and full build, and verified all 29 frozen source/config/test/document hashes before and after the review. Only this acceptance document was finalized afterward; application source is unchanged.

| Command | Result |
| --- | --- |
| `npm test` | 51 tests passed across 9 files in the final root acceptance run. |
| `npm exec tsc -- --noEmit` | Passed. |
| `npm run build -- --outDir /private/tmp/dattebayo-final-acceptance-build --emptyOutDir` | Passed; 11 modules transformed. |
| `npm run build -- --outDir /private/tmp/dattebayo-review4-sol-build --emptyOutDir` | Independent review passed; TypeScript and Vite succeeded. |
| `git diff --check` | Independent review passed. |
| `npm run build` | Type checking passed; default output cleanup failed with `EPERM` at `dist/assets`. Successful builds use fresh temporary output directories. |

Reducer tests cover all nine ordered RPS outcomes, CPU sampling boundaries and locking, fresh-round tie rerolls, secret-ending precedence, third-sign-only human damage, one-time damage, automatic CPU attacks, both normal endings, non-terminal return to choice, jutsu alternation, cancellation, visibility invalidation, stale generations, and Replay. The unused round-reroll action was removed so callers cannot bypass attack finalization or reroll a locked choice.

CV tests cover the twelve labels, tensor ordering and normalization, one-hand zero fill, zero-scale handling, threshold 0.6, 450 ms hold, and reset after a stall longer than 500 ms. Lifecycle tests use mocked camera/model resources to check late acquisition and inference, stale RAF after Retry, playback rejection, track/video failure, cleanup, retry, and cancellation. A retry-boundary regression prevents a partial hold carrying across camera recovery. A deferred-inference test verifies that results older than 500 ms reset the hold rather than completing it; timestamps use actual completion time, and exactly-500ms samples remain within the strict stall boundary. CPU damage is tested at attack resolution, including cancellation before resolution with zero damage and duplicate/stale resolution protection.

Audio tests use mocked Web Audio contexts and timers to check unavailable audio, rejected resume, generation changes, delayed cues, mute, and source/queue cleanup. Presentation tests check hitstop, round-callout timing, and clash-to-collapse timing. CSS layout and final visual quality still need browser inspection.

## Art and provenance

The user requires GPT-image-2.5. The available image tool cannot select or verify that model, and the user declined a substitute. No images were generated. The game therefore retains an explicit temporary-greybox label.

The manifest records target 256×256 fighter canvases, fixed facing and feet pivots, frame counts, relative paths, and charge/release VFX mappings. All items remain `pending-gpt-image-2.5`. Dimensions, alpha, trimming, frame ordering, detailed appearance, preview sheets, and final sprite integration are pending; target metadata is not validation evidence.

The two supplied character references remain the sole appearance authority. The other six references control their documented composition/UI areas. None is shipped as runtime art. CV behavior was ported from the approved local migration contract and pinned source references. Runtime loaders use MediaPipe Tasks Vision 0.10.34, ONNX Runtime Web 1.17.3 with one WASM thread, Google's float16/1 hand task, and the pinned Jutsu Hero classifier URL. Live downloads were not verified here.

Sound is original procedural Web Audio. No legacy MP3/WAV clips were copied or made runtime dependencies. Existing reference credits remain in `source-reference/`; availability of that material is not a blanket redistribution grant.

## Environment and installation limits

- `npm install --offline --ignore-scripts --no-audit --no-fund` initially failed with `ENOTCACHED` for TypeScript.
- `npm install --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=15000` failed with `ENOTFOUND` for `registry.npmjs.org`.
- Forty-seven public dependency snapshots were recovered from the readable local Bun package cache into project-local `node_modules`. `npm install --package-lock-only --offline --ignore-scripts --no-audit --no-fund` then succeeded. A clean online install has not been verified. The cache-derived lockfile contains Darwin native optional entries; clean hosted Linux installation remains unverified and needs lockfile regeneration/validation in an online environment.
- `npm run dev -- --host 127.0.0.1` failed with `listen EPERM: operation not permitted 127.0.0.1:4173`, including the scoped escalated attempt.
- Browser local-file navigation was explicitly denied by the browser URL policy. No alternate browser, data URL, raw CDP, or other workaround was attempted after that denial.
- Model/CDN host checks failed DNS resolution. Real camera permission, model startup, gesture recognition, rendered layout, sound playback, and browser reduced-motion behavior remain untested. Unit mocks do not certify webcam reliability.

## Hosting status and remaining acceptance

The user explicitly authorized uploading this reviewed build to Sites' managed `main` branch while keeping GitHub main untouched. That narrow exception resolves the earlier JARVIS push-authorization conflict for this upload; no permanent policy file was changed. The latest instruction is to commit the reviewed work in local batches first. Publishing is paused for this task; do not resume an upload merely because network access returns.

A fresh private Sites project remains registered in `.openai/hosting.json`. A live status read after the upload preflight confirmed version `0` and no live URL. No source version was saved and no deployment was started.

A fresh independent preflight verified all 28 reviewed application/config/test/public files against the final review hashes, with no new runtime files. The finalized acceptance report, `art-candidates/`, `handoff-references/`, and `source-reference/` were excluded from upload inputs.

Preparation completed:

- Isolated Sites source checkout: `/private/tmp/dattebayo-sites-publish-ihpq51w5`.
- Local Sites-only preparation commit: `4ac89c2965902b37b0e273170233d15e878735b6`. It has not been pushed.
- Package command: `node /Users/desmondchyezhihao/.codex/plugins/cache/openai-curated-remote/sites/0.1.62/scripts/package-site.mjs /private/tmp/dattebayo-sites-publish-ihpq51w5 /private/tmp/dattebayo-sites-reviewed.tar.gz` — passed.
- Archive: `/private/tmp/dattebayo-sites-reviewed.tar.gz`. Validation confirmed only the built HTML, JS, CSS, pending art manifest/README, and `.openai/hosting.json`. No source/reference bundles or credentials are included.
- Local `main` and `origin/main` remain at `12a0ed7329906946b9089a2ae6edf715303c11af`. Reviewed repairs are committed locally on `codex/basic-battle-review-fixes`. No GitHub push or merge was performed.

The remaining blocker is network access. DNS lookup of `git.chatgpt-team.site` returned `ENOTFOUND`. An authenticated, read-only `git ls-remote` connection to the exact Sites repository failed with exit 128 and `Could not resolve host: git.chatgpt-team.site`. Both the normal and scoped elevated attempts failed. Credentials were supplied only in memory with terminal echo disabled and were not written to Git configuration or files. No source push was attempted after the connection failure. This was a network failure, not an automatic approval-review rejection.

When the user resumes publishing, reuse the existing Sites project, verify the prepared checkout still matches the reviewed application files, renew the short-lived credential if expired, push to the Sites-managed repository only, read the full pushed HEAD, save/deploy its matching archive, and run the authorized hosted smoke test. The earlier Sites-only authorization remains recorded; it does not override the current pause.

Local browser acceptance still needs an allowed preview environment: verify title/HUD layout, camera permission and recovery, one real three-sign cast, mute, and reduced motion. The GPT-image-2.5 generation, asset validation, and final sprite integration remain a separate pending art pass under the user-approved greybox exception. No hosted smoke result is claimed.

## Local commit batches

The reviewed changes were separated into focused commits on `codex/basic-battle-review-fixes`:

| Commit | Scope | Focused verification |
| --- | --- | --- |
| `9631dbf` | Camera recovery and inference timing | 24 tests passed across camera, CV, and model tests. |
| `0275d90` | Battle damage and round boundaries | 16 reducer tests passed. |
| `16f141e` | Battle presentation and motion handling | 3 presentation tests passed. |
| `7ccaf83` | Synthesized audio lifecycle tests | 7 audio tests passed. |
| `13fd86a` | Pending runtime asset metadata | 1 asset test passed. |

Every batch passed `git diff --cached --check` before committing. This acceptance record is the final documentation batch. The reference bundles and unreviewed `art-candidates/` remain untracked and were excluded from these commits.
