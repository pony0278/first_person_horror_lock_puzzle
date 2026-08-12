# CG6 — CrazyGames Submission Readiness

This checklist is the final code/build gate before uploading the HTML5 build to the CrazyGames Developer Portal.

## 1. Build gate

Run from a clean checkout:

```bash
npm ci
npm run check
npm run build
npm run cg:readiness
```

`cg:readiness` verifies the production `dist/` artifact against the current CrazyGames HTML5 constraints used by this project:

- initial game payload <= 50 MiB
- total build <= 250 MiB
- file count <= 1500
- <= 20 MiB reported as the mobile-homepage target
- internal project single-file budget <= 5 MiB
- English production document metadata
- CrazyGames SDK v3 script present
- CG6 Preview QA probe bundled
- no `file://`, Windows absolute path, or unbundled `/src/` script reference

The current project is intentionally a single-file game build, so `dist/index.html` represents the game-owned initial payload.

## 2. Player-facing English

The submission build defaults to English. CG6 translates only normal player-facing UI; Developer Debug / Transition Lab text is excluded because it is not present in the normal player flow.

Manually verify these paths in Preview:

- Door 1: look-back cue, `VENT ALL`, death/result text
- Door 2: circuit board flow and fuse-related death/result text
- Door 3: tank source/target cue, latch/master-lever cue, floodgate chase cue, death/result text
- Level 0 ending: `TO BE CONTINUED`
- WebGL context-loss message if intentionally tested

No Chinese/Han characters should be visible during normal gameplay.

## 3. CrazyGames desktop viewport QA

Do not reintroduce the old mobile viewport CI suite. Perform these high-risk desktop checks in the CrazyGames Preview environment at DPR 1:

1. `821 x 462`
2. `907 x 510`
3. `1216 x 684`
4. `1280 x 720` or `1366 x 768`

For each size:

```js
__crazyGamesSubmissionQA()
```

Expected:

- `checks.english = PASS`
- `checks.overflow = PASS`
- `checks.clipping = PASS`
- `checks.touchTarget = PASS`
- `checks.viewport = PASS` when the viewport matches a target
- `checks.dpr = PASS` at DPR 1

Door-specific visual check:

- Door 1: upper first-person view and lower lock panel both remain readable
- Door 2: circuit canvas is not cropped and breaker remains usable
- Door 3: full viewport, workbench controls and floodgate remain readable

## 4. CrazyGames SDK / Basic Launch Preview QA

After uploading the build to Developer Portal Preview, run:

```js
__crazyGamesQA()
```

Then intentionally die once. Basic Launch may reject/disable the midgame ad; the game must still restart normally.

After restart run both:

```js
__crazyGamesQA()
__crazyGamesSubmissionQA()
```

Verify:

- platform/gameplay/audio are not `FAIL`
- ad fallback reaches the safe restart path
- `ad.requestCount === ad.restartCount`
- platform mute setting remains respected

Then complete the full successful route:

`Door 1 -> Door 2 -> Door 3 -> Level 0 -> TO BE CONTINUED`

The successful ending must not increase the midgame ad request count.

## 5. Upload artifact

Upload the HTML5 build files produced in `dist/` through the CrazyGames Developer Portal. This project currently emits one `dist/index.html` containing the game code and game assets; the CrazyGames SDK v3 remains the platform-owned external script.

Before pressing Submit, use the Portal Preview and complete both the intentional-death route and the full success route above.

## 6. Submission metadata / art still required outside the code build

Code readiness does not create portal marketing assets. Prepare separately before final submission:

- English game name
- English description
- concise English controls/instructions
- required static cover formats
- required preview/trailer media
- category/tags and device support choices

Do not use the Level 0 reveal as the main cover if avoiding the ending spoiler is important. Prefer the corridor/floodgate/threat visual language.

## Release decision

A CG6 build is code-ready for Developer Portal upload only when:

- PR CI is green
- `npm run cg:readiness` prints `READY`
- Developer Portal Preview has been tested manually at the target desktop viewport sizes
- one Basic Launch ad-fallback death has restarted safely
- one complete Door 1 -> Door 2 -> Door 3 -> Level 0 run has succeeded without a success-path ad
