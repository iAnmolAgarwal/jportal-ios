# Releasing

How a fix reaches everyone's iPhone. Installed copies update from
`dist/jportal.user.js` on `main` (the script's `@updateURL`), and only when
`@version` goes up, so every release must bump the version.

## When the portal changes

1. **Check upstream first.** [ktjiit](https://github.com/codelif/ktjiit/commits/main) and
   [jportal-android](https://github.com/codelif/jportal-android/commits/main) usually fix portal
   changes within days. Port the ktjiit diff into `src/core/` and credit the commit in the changelog.
2. **Reproduce without a login:** `node build.mjs && node tools/live-smoke.mjs` checks the script
   still loads on the live portal. Real data needs a signed-in phone.
3. **Add a test** in `tools/test-api.mjs` (or the relevant test file) that fails before the fix.

## Cutting a release

1. Bump the version: `npm pkg set version=X.Y.Z` (patch for fixes, minor for features).
2. `node build.mjs && npm test`, then check `git diff dist/jportal.user.js` shows the new `@version`.
3. Add a section to `CHANGELOG.md`: what users saw, what changed, upstream links.
4. Commit and push to `main`. Installed copies can update from this point.
5. Tag and push: `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`.
   The release workflow builds, tests, checks the tag matches `@version`, and publishes a GitHub
   Release with `jportal.user.js` attached and the changelog section as notes.
6. If the fix was urgent, comment on the related issue or tell users how to update (below).

## How users update

In Safari on the portal page: Userscripts icon → **Show updates** → **Check Updates** → **Update**.
Or open the install link again and tap Install. GitHub's raw file cache can take ~5 minutes after a push.
