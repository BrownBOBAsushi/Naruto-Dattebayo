# Start the hackathon build

1. Extract this ZIP into the NEW repository root.
2. Open that repository in Codex with Astra.
3. Paste the contents of `BUILD_PROMPT.md` as the task prompt.
4. Keep `architecture.md`, `handoff-references/`, and `source-reference/` available for the agent to read.

The design has already been discussed. Build the basic single-player version, then refine it in the new task. Generate the battle mockup, corrected title, detailed crisp arcade sprites, and matching Valley of the End scene there; they are not finished assets in this ZIP.

`handoff-references/README.md` explains which image controls each decision. The latest detailed arcade character references control character appearance and style.

The two latest character references, `naruto-rasengan-style-reference.png` and
`sasuke-chidori-style-reference.png`, are the sole authority for character
appearance, proportions, shading, and pose. Naruto stays on the right facing
left; Sasuke stays on the left facing right.

`source-reference/` is a pinned legacy prototype for selective implementation
and audio reference only; it does not define character appearance or art style.
Do not ship this folder wholesale or reuse an old Sites project ID. The model
binaries are not bundled and network access is needed to fetch
dependencies/models. Deployment is a later explicit step; this package does
not deploy anything.
