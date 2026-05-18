# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`@wekor/expo-vlc-player` — an Expo native module that exposes a `<ExpoVlcPlayerView>` React Native component backed by libVLC for streaming playback (RTSP, HTTP, etc.).

## Commands

Tooling is `expo-module-scripts`; every script delegates to the `expo-module` CLI:

```bash
npm run build         # tsc into build/ (used by main/types in package.json)
npm run clean
npm run lint          # eslint via universe/native + universe/web
npm run test          # jest via expo-module-scripts
npm run prepare       # what publishing runs; rebuilds build/
npm run open:ios      # xed example/ios
npm run open:android  # opens example/android in Android Studio
```

The example app under `example/` is a separate Expo project (expo-router based) that autolinks to this module via `"nativeModulesDir": ".."`. Run it with `cd example && npm run ios` / `npm run android`. There is no standalone build of this library — you exercise native changes through the example app.

## Architecture

The module is a thin TS shim over a native view that exists on both platforms with parallel implementations.

### Bridge layout

- **JS side** (`src/`):
  - `ExpoVlcPlayerView.tsx` wraps `requireNativeView('ExpoVlcPlayer')`. It applies a `resizeMode='contain'` and `paused=false` default, omits empty `initOptions`/`mediaOptions` arrays so the native defaults win, and exposes a `retry()` imperative handle that calls the native `retry(viewTag)` async function via `findNodeHandle`.
  - `ExpoVlcPlayerModule.ts` resolves the `ExpoVlcPlayer` native module for the `retry` async call.
  - `ExpoVlcPlayer.types.ts` is the source of truth for prop and event payload types.
- **iOS** (`ios/`, Swift, VLCKit 4.0.0a10 via CocoaPods, deployment target 15.1):
  - `ExpoVlcPlayerModule.swift` declares `View(ExpoVlcPlayerView.self)` with one `Prop(...)` per JS prop and `Events("onLoad", "onPlaying", "onError")`. Every prop setter dispatches to the main queue before touching VLCKit.
  - `ExpoVlcPlayerView.swift` owns a `VLCMediaPlayer` whose `drawable` is a plain `UIView` (not CAEAGLLayer). Defaults live here as `defaultInitOptions` / `defaultMediaOptions`.
- **Android** (`android/`, Kotlin, `org.videolan.android:libvlc-all:3.6.4`, minSdk 24 / compileSdk 36):
  - `ExpoVlcPlayerModule.kt` mirrors the iOS module definition (same prop names, same events) and adds `OnViewDestroys { view.release() }`.
  - `ExpoVlcPlayerView.kt` uses `VLCVideoLayout` and delegates state to an internal `PlayerSession`. Defaults live in companion constants `DEFAULT_INIT_OPTIONS` / `DEFAULT_MEDIA_OPTIONS`.

The native module name on **both** platforms is the string `ExpoVlcPlayer` — the JS layer keys off it (`requireNativeView('ExpoVlcPlayer')`), so do not rename it on one side only. The Android class is registered as `expo.modules.vlcplayer.ExpoVlcPlayerModule` in `expo-module.config.json`.

### Adding or changing a prop

A prop must be updated in **four** places to round-trip cleanly:

1. `src/ExpoVlcPlayer.types.ts` — TS type.
2. `src/ExpoVlcPlayerView.tsx` — only if the JS shim needs to apply a default or sanitize the value (the "empty array → omit" pattern for `initOptions`/`mediaOptions` is intentional so native defaults apply).
3. `ios/ExpoVlcPlayerModule.swift` — `Prop("name") { view, value in ... }`, then add a setter on `ExpoVlcPlayerView.swift`.
4. `android/src/main/java/expo/modules/vlcplayer/ExpoVlcPlayerModule.kt` — matching `Prop` block, then add a setter on `ExpoVlcPlayerView.kt`.

### Non-obvious runtime behavior to preserve when editing the native code

These behaviors exist on both platforms; if you touch playback or lifecycle code, keep them in sync.

- **`initOptions` / `mediaOptions` changes recreate the player.** Init options are LibVLC instance options and can only be applied at `VLCMediaPlayer` construction time; media options are reapplied per `VLCMedia`. Both setters short-circuit when the new value equals the current one.
- **Resume verification.** After every `play()` call (initial load, unpause, foregrounding) the view schedules a delayed check (~0.7s on iOS, similar on Android via a posted Runnable). If `hasVideoOut` is still false at that point, the stream is reloaded. This is the workaround for VLCKit's "play() returned but the surface never came up" failure mode — do not remove it without a replacement.
- **App lifecycle.** On background, the drawable/surface is detached and the player is paused. On foreground, the drawable is reattached; if the app was away for more than ~3 seconds the stream is fully reloaded rather than resumed, because RTSP sessions typically die on the server side by then.
- **Cleanup ordering.** iOS `cleanupPlayer()` and Android `release()` must run on the main thread, must null the drawable before calling `stop()`, and must clear the delegate to break the retain cycle. The `isDestroyed` / `released` flag is checked at the top of every public setter.

### Events

Three events flow from native to JS via `EventDispatcher`:

- `onLoad` — fired once per stream, on the first `playing` state transition. Payload: `{ url }`.
- `onPlaying` — fired on every `playing` state transition (including after pause/resume). Payload: `{ url }`.
- `onError` — fired on VLC error state and on internal failures (e.g. player construction). Payload: `{ url?, message }`.

`hasLoadDispatched` is the latch that prevents `onLoad` from firing more than once per `loadMedia` call.

## Versioning

- npm `version` is `0.0.1` (`package.json`) but the Android module advertises `0.1.0` (`android/build.gradle`). The iOS podspec pulls its version from `package.json`. When bumping releases, update all three.
