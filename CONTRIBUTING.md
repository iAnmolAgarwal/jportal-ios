# Contributing

Thanks for helping. JPortal for iOS is a web remake of
[JPortal for Android](https://github.com/codelif/jportal-android), so the aim is that it looks and
behaves like the Android app on an iPhone. When the two disagree, the Android app is right.

## Setup

    npm install
    node build.mjs              # dist/jportal.user.js (the install file) + dist/preview.* (desktop preview)
    node build.mjs --watch      # rebuild on change
    npm test                    # request crypto vectors + marks PDF parser goldens

Node 20 or newer. No other dependencies.

## Preview without the portal

The desktop preview runs the app on the fixture data in `fixtures/`, so you never need to sign in to the
real portal while working on a screen.

    node tools/serve.mjs        # http://localhost:5179/dist/preview.html

Query parameters:

- `tab=attendance|academics|subjects|me`
- `push=<screen>&params=<json>` to open a detail screen
- `theme=light|dark`
- `now=YYYY-MM-DD` pins "today" (the fixture data is from September 2026, try `now=2026-09-24`)
- `marks=<pdf name in fixtures/marks>`

iPhone-sized screenshots (uses your installed Google Chrome, with the preview server running):

    node tools/shot.mjs shots/attendance.png 'tab=attendance&theme=dark&now=2026-09-24' [--full] [--click=<css selector>]

`--click` runs selectors inside the app's shadow root, in order. The tool prints any console errors;
there should be none. Check light and dark.

`node tools/live-smoke.mjs` loads the built script into the real portal's sign-in page (no login) to
check it stays out of the way when signed out. Use it sparingly.

## Where things are

- `src/app.js`: the shell, and the screen contract at the top of the file
- `src/screens/`: one file (or folder) per screen
- `src/ui/`: `components.js` (rings, headers, sheets, states), `theme.css` (tokens and classes),
  `dom.js` (`h()`, `render()`), `icons.js`
- `src/core/api.js`: every portal call, with the fixture that shows its response shape
- `src/core/store.js`: `cached()` (stale-while-revalidate, so screens work offline), `prefs`, `now()`
- `src/core/session.js`: login capture and session
- `src/core/crypto.js`, `src/core/marks/`: ported from [ktjiit](https://github.com/codelif/ktjiit)

For layout, copy, number formatting and behaviour, follow the Kotlin source of
[jportal-android](https://github.com/codelif/jportal-android) and the models in
[ktjiit](https://github.com/codelif/ktjiit). Android-only features (calendar sync, widgets, haptics,
update checks) are out of scope.

## Rules of thumb

- Plain JavaScript (ES2022) that runs in Safari 15+. No framework, no new runtime dependencies.
- Use the CSS tokens (`var(--primary)` and so on), never hard-coded colours, so dark mode works.
  Screen-specific CSS goes in a `<style>` inside the screen's root (it's a shadow root, so it's scoped).
- Every screen needs a loading skeleton, an error state with retry, a stale banner when it shows
  cached data after a failed refresh, and empty states with the Android copy.
- Use `now()` from `store.js` instead of `Date.now()` for "today" logic, so the preview can pin dates.
- Tests and the preview never call the real portal.
- Never commit real portal responses. Fixtures must be scrubbed (no names, enrollment numbers,
  emails, phone numbers or tokens).
- Commit the rebuilt `dist/jportal.user.js` with your change; CI fails if it is out of date. Bump
  `version` in `package.json` for a release, since Userscripts only offers an update when the version
  goes up.

## License

By contributing you agree that your contribution is licensed under GPL-3.0-only, like the rest of the
project.
