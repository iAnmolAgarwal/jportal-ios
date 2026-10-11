# JPortal for iOS (unofficial)

The [JPortal for Android](https://github.com/codelif/jportal-android) experience on an iPhone, as a Safari
userscript. You sign in to the JIIT webportal with Google as usual, and JPortal takes over the page:
attendance with "can miss / attend the next" counts, exam schedule with rooms and seats, SGPA/CGPA with a
what-if and an SGPA calculator, grade cards and marks.

Unofficial. Not affiliated with or endorsed by JIIT, and not an official part of JPortal for Android.

## Install on iPhone

1. Install **Userscripts** (free, open source) from the App Store.
2. Open the Settings app → Apps → Safari → Extensions → Userscripts → turn it on, and allow it on
   `webportal.jiit.ac.in` (or "All Websites").
3. Open the Userscripts app once and pick a folder for your scripts (e.g. "Userscripts" in iCloud Drive or
   On My iPhone).
4. Put `dist/jportal.user.js` in that folder (AirDrop it to the phone and "Save to Files", or open its raw
   URL in Safari and tap the Userscripts toolbar icon → Install).
5. Open https://webportal.jiit.ac.in:6011/studentportal/ in Safari and sign in with Google.
   JPortal appears as soon as the portal signs you in.

Tip: Safari's Home Screen web apps don't run extensions, so keep it as a Safari bookmark or
Favourite rather than "Add to Home Screen".

Chrome on iOS can't run extensions, so it won't work there. On a computer it works in Chrome, Firefox,
Edge or Safari with Tampermonkey or Violentmonkey.

## How it works

The portal keeps your session in its own page storage. The script runs on the portal's own origin, so it
calls the same API the portal does, with the portal's request encryption (ported from ktjiit). Nothing is
sent anywhere else: no server, no proxy, no analytics. Data is cached in the portal page's localStorage so
the last numbers still show when the portal is down.

The member id that some calls need is only held in the portal's memory, so the script reads it from the
login response as it happens. If you installed the script while already signed in, sign out and in once.

## Develop

    npm install
    node build.mjs            # dist/jportal.user.js + desktop preview
    node tools/serve.mjs      # http://localhost:5179/dist/preview.html (fixture data, no portal)
    node tools/shot.mjs out.png 'tab=academics&theme=dark'
    npm test                  # crypto vectors (+ node tools/test-marks.mjs)

Fixtures are the scrubbed real responses from ktjiit's test suite.

## Credits

Everything good here comes from [JPortal for Android](https://github.com/codelif/jportal-android) and
[ktjiit](https://github.com/codelif/ktjiit) by codelif, and the original
[JPortal](https://github.com/codeblech/jportal) by Yash Malik (codeblech). See NOTICE.

## License

GPL-3.0-only
