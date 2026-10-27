# Changelog

All notable changes to JPortal for iOS. Versions follow [semantic versioning](https://semver.org); the userscript's `@version` is the source of truth for updates.

## [0.2.1] - 2026-10-27

### Fixed
- Every screen showed "Couldn't load this / The portal returned an error". The JIIT portal stopped accepting encrypted request bodies in its October 2026 update; JPortal now sends plain JSON, the same fix [ktjiit](https://github.com/codelif/ktjiit/commit/ba8f8e2) shipped upstream.
- When the portal's server crashes on a request, JPortal now says "The portal couldn't handle this request" instead of a generic error, and no longer retries a request that can't succeed.

### Added
- Transport tests (`tools/test-api.mjs`) that check every portal call sends plain JSON and that server errors are classified correctly.

## [0.2.0] - 2026-10-22

### Added
- Public release: step-by-step install guide with screenshots, troubleshooting, privacy notes and credits.
- `@updateURL` / `@downloadURL`, so the Userscripts app can update JPortal from GitHub.
- CI: tests and a check that `dist/jportal.user.js` matches the source.

## [0.1.1] - 2026-10-11

### Fixed
- The script never ran in the Userscripts app: it rejects `@match` patterns with a port, so the portal's `:6011` address never matched.

## [0.1.0] - 2026-10-11

### Added
- First version: Attendance, Academics (overview, CGPA what-if, SGPA calculator, marks, exams, grade cards), Subjects and Me, ported from JPortal for Android.

[0.2.1]: https://github.com/iAnmolAgarwal/jportal-ios/releases/tag/v0.2.1
[0.2.0]: https://github.com/iAnmolAgarwal/jportal-ios/compare/v0.1.1...v0.2.0
