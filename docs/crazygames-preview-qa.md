# CrazyGames Preview QA — Basic Launch / CG5

This checklist verifies the CrazyGames integration without changing gameplay UI.
It is intended for the Developer Portal Preview build and for Basic Launch, where
CrazyGames monetization is disabled even if the Ads SDK is integrated.

## What CI already proves

The automated CG5 tests simulate these integration states:

- CrazyGames environment + `adsDisabledBasicLaunch`
- SDK environment `disabled`
- SDK completely unavailable
- `gameplayStart` → death/result `gameplayStop` → ad fallback → restart → `gameplayStart`
- persistent `game.settings.muteAudio` surviving an ad error/restart

CI cannot prove that the uploaded CrazyGames Preview iframe, browser audio policy,
or real platform SDK behaves correctly. The steps below are the required manual pass.

## Preview smoke test

1. Upload the production build in the CrazyGames Developer Portal and open Preview.
2. Open DevTools Console.
3. Wait until the first playable Door 1 run begins.
4. Run:

```js
__crazyGamesQA()
```

Expected before testing a death:

- `checks.platform.status === "PASS"`
- `checks.gameplay.status === "PASS"`
- `checks.audio.status === "PASS"`
- `checks.adFallback.status === "WAIT"` is normal until a death has occurred
- `platform.environment === "crazygames"`

If Preview reports `disabled` or `unavailable`, do not treat that as a successful
Preview pass even though the game should still remain playable in fallback mode.

## Basic Launch death → restart fallback

1. Intentionally fail one run.
2. Let the result screen remain visible through its normal delay.
3. During Basic Launch, the ad request is expected to be rejected/disabled rather
   than showing a monetized video.
4. Confirm Door 1 starts again without clicking or reloading.
5. Run `__crazyGamesQA()` again.

Expected:

- `overall === "PASS"`
- `checks.adFallback.status === "PASS"`
- `ad.lastResult.error.code === "adsDisabledBasicLaunch"` during Basic Launch
- `ad.requestCount === ad.restartCount`
- `gameplay.sessionActive === true`
- `gameplay.reportedPlaying === true`
- `audio.adPlaying === false`

An `unfilled`, `adblock`, or other SDK ad error is also acceptable only if the game
restarts and `requestCount === restartCount`.

## Audio settings test

If the Preview QA controls expose CrazyGames audio mute:

1. Enable platform mute.
2. Run `__crazyGamesQA()`.
3. Confirm:
   - `audio.platformMuted === true`
   - `audio.audio.reasons` contains `crazygames-setting`
4. Trigger the death/ad fallback.
5. Confirm the platform mute reason still exists after the ad error/restart.
6. Disable platform mute and confirm the reason disappears.

The end of an ad must never override a persistent CrazyGames `muteAudio` setting.

## Full success path — no interruption

Record the current value:

```js
__crazyGamesQA().ad.requestCount
```

Then complete the normal game:

Door 1 → Door 2 → Door 3 → endless corridor → Level 0 → `未完待續`.

After the automatic restart, run the probe again. The `ad.requestCount` value must
be unchanged. A successful run / Level 0 ending is not a death monetization point.

Also verify that Door transitions do not emit gameplay breaks during the run.
`gameplay.reportedPlaying` should remain true until the final result screen.

## Disabled / non-CrazyGames sanity check

On a normal non-CrazyGames host the SDK can be unavailable or disabled. The game
must still:

- start normally
- play Door 1 → Door 3 normally
- restart after death without waiting forever for an ad
- keep audio usable

In that environment `__crazyGamesQA()` may report platform fallback as PASS. This
is different from the Developer Portal Preview requirement, where the environment
must be `crazygames`.

## Release gate

CG5 is considered manually verified only when both of these pass in Developer
Portal Preview:

- one intentional death safely restarts with ads disabled/unavailable
- one complete Door 1 → Level 0 run finishes without increasing `ad.requestCount`
