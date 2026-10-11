# Brief for screen builders

You are building ONE slice of JPortal for iOS: a Safari userscript that covers the JIIT
webportal with a faithful web remake of the JPortal Android app. Goal: on an iPhone it should
look and behave like the Android app. Speed matters, but fidelity matters more.

## Read first (10 min, no more)
- `src/app.js`: shell and the SCREEN CONTRACT at the top
- `src/ui/components.js`: ring, header, semChip, segmented, sheet, states, icon(); `src/ui/icons.js` names
- `src/ui/theme.css`: tokens and classes (card, hero, group/item, kv, pill, section, note, btn, type scale)
- `src/ui/dom.js`: `h()`, `render()`, `titleCase()`, `semLabel()`
- `src/core/api.js`: every portal call, with the fixture file that shows its real response shape
- `src/core/store.js`: `cached()` (stale-while-revalidate, use it for every screen so the app works offline),
  `load()`, `prefs` (target, theme, amoled), `ago()`, `now()` (use instead of Date.now() for "today" logic)
- `src/core/session.js`: `session()`; `session().memberId` can be '' when we missed the login; calls that
  need it (registeredSubjects, semesterResults) should then show:
  "Sign out and sign in again once so JPortal can pick up your student id."

## Reference (the thing you are copying)
Android app source: `$REF/jportal-android/app/src/main/kotlin/in/codelif/jportal/`
Its portal library: `$REF/ktjiit/src/main/kotlin/in/codelif/ktjiit/` (models show field meanings)
Screenshots (light, dark, "huge" = big font): `$REF/jportal-android/app/src/test/screenshots/*.png`
where REF=/private/tmp/claude-501/-Users-anmolagarwal/b28a4f8a-731a-44cc-beba-a59ad92f45ba/scratchpad/jp
Copy the layout, copy text, numbers formatting, colours (via the css tokens) and behaviour from the Kotlin.
Skip Android-only things (calendar sync, update checks, haptics, widgets, demo mode, feedback submission).

## Rules
- Edit ONLY the files your slice owns (listed in your task). You may add new files under
  `src/screens/<your-slice>/` or `src/domain/<name>.js`. Do NOT edit app.js, components.js, theme.css,
  dom.js, api.js, store.js, session.js, screens/index.js, build.mjs. If you truly need a shared change,
  work around it locally and list the request in your final report.
- Screen-specific CSS: put a `h('style', null, CSS)` inside your screen's root (it's a shadow root, so
  it's scoped). Use the css tokens (var(--primary) etc.), never hard-coded colours, so dark mode works.
- Every screen: loading skeleton, error state with retry (`errorState`), stale banner when showing
  cached data after a failed refresh (`staleBanner`), empty states with the Android copy.
- Never call the real portal. No new npm dependencies. Plain JS (ES2022), runs in Safari 15+.
- Do not commit. The lead integrates.

## Build, look, compare (do this loop until it matches)
    node build.mjs
    node tools/shot.mjs shots/<name>.png 'tab=attendance&theme=light&now=2026-09-24' [--full] [--click=<css selector>]
- the preview server should already be on :5179; if `curl localhost:5179/dist/preview.html` fails,
  start it with `node tools/serve.mjs 5179` in the background.
- query params: tab=attendance|academics|subjects|me, push=<screen>&params=<json>, theme=light|dark,
  now=YYYY-MM-DD (pins "today"; fixture data is from Sept 2026), marks=<pdf name in fixtures/marks>
- `--click` runs selectors inside the app's shadow root, in order (e.g. to switch a segment).
- Look at your screenshots with the Read tool and compare them side by side with the Android
  screenshots. Check light AND dark. Fix until they match. The shot tool prints console errors: zero allowed.
- `mkdir -p shots` first; name shots with your slice prefix so builders don't overwrite each other.

## Final report (keep it short)
Files you created or changed, what works, screenshots to look at (paths), anything not done,
and any shared-code change you need from the lead.
