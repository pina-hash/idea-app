# The origin split: serving untrusted bundles

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Why student bundles never run on the origin that holds a session, and everything that follows from it. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

### THE ORIGIN SPLIT -- read this before touching anything that serves a bundle

**A STUDENT BUNDLE NEVER EXECUTES ON THE ORIGIN THAT HOLDS A SESSION.** Bundles
are served by **two ordinary SvelteKit routes**,
`src/routes/b/[appId]/[versionId]/[...path]/+server.ts` (the frame src) and
`src/routes/a/[appId]/[...path]/+server.ts` (the direct page), answering on
**`apps.ideabosco.com`** -- a second domain on the same Vercel project -- and
never on `ideabosco.com`. Both go through
`$lib/server/foundry-bundle-response.ts`, which is the one copy of everything
below; a third mount is a caller of it, never a third handler.

- **TWO ORIGINS, NOT ONE HOST PLUS A HEADER, and the difference is subresource
  cookies.** A header governs scripting and document origin; it does not govern
  whether a subresource request carries credentials. A bundle containing
  `<img src="/api/whatever">` served same-host reaches the real backend with the
  viewer's cookies attached. Served cross-site it reaches a host that reaches
  nothing. No header achieves this and no header ever will.
  - **AND THE ABSENCE IS STRUCTURAL, NOT BEHAVIOURAL, WHICH IS THE WHOLE
    ARGUMENT FOR A SECOND ORIGIN OVER A SANDBOX ON THE MAIN HOST.**
    `@supabase/ssr`'s `DEFAULT_COOKIE_OPTIONS` sets `path`, `sameSite: 'lax'`
    and `httpOnly: false` and NO `Domain`, and `hooks.server.ts` adds none -- so
    the session cookies are host-only on `ideabosco.com` and simply do not
    exist on the apps host. Serving from the main host under a sandbox would
    instead rest on the browser computing a null site-for-cookies for an
    opaque-origin initiator: probably true today, subtle, varying by browser,
    and no help against a `SameSite=None` cookie added later. An absence cannot
    regress. **`httpOnly: false` is why it matters more than it looks** -- those
    tokens are readable by `document.cookie`, so the host a student's code runs
    on is the question.
- **THERE USED TO BE A SECOND VERCEL HOST AND IT NEVER SERVED A BUNDLE.**
  `apps.ideabosco.com`, a host branch sequenced first in `hooks.server.ts`, an
  allowlist module, signed HMAC read tokens, a mint endpoint and a build step
  that rewrote the generated Build Output route table -- five lanes of
  diagnosis, production logs showing the hook entering, allowing the request
  and returning 404, and a handler probe that fired on one deployment and not
  the next for identical requests. **It is deleted, not disabled.** Do not
  reintroduce `PUBLIC_FOUNDRY_APPS_HOST`, `FOUNDRY_TOKEN_SECRET`, a `/r`
  namespace, a host branch or `scripts/foundry-edge-routes.mjs`;
  `tests/foundry-bundle-url.test.ts` sweeps for every one of those names and
  reddens.
- **NOTHING SUPABASE-HOSTED WILL SERVE HTML, AND THAT IS TWO MEASUREMENTS, NOT
  ONE.** Storage was the first and the hosted **Edge Function gateway** is the
  second: a deployed, correct `foundry-serve` answered
  `Content-Type: text/plain` AND
  `content-security-policy: default-src 'none'; sandbox` -- the gateway
  REPLACED the function's own policy, so correcting the type alone would still
  have rendered a blank page, and `frame-ancestors` had never once taken
  effect. Different codebases, different languages, identical refusal: it is a
  platform posture against arbitrary HTML on `*.supabase.co`, not a bug in
  either, and **no function code can reach it.** That is why the bytes come off
  a host whose headers we set. **Do not try a Supabase custom domain on the
  strength of a guess** -- whether the control is hostname-conditional was
  never measured, and the storage twin is unconditional.
- **STORAGE'S OWN REWRITE, MEASURED FIRST.** `normalizeContentType` in storage-api's renderer
  rewrites any `text/html` content type to `text/plain`, unconditionally, with
  no bucket flag and no configuration. Measured on a real object: stored
  `text/html; charset=utf-8`, served `text/plain; charset=UTF-8` on the public,
  the authenticated AND the signed-URL path. A framed bundle would render its
  own source as text. **Framing a Storage object URL directly is therefore not
  an option and never will be** -- the check is case-sensitive, which makes
  `Text/Html` a working bypass and a deliberate circumvention of somebody
  else's abuse control that one upstream `.toLowerCase()` would silently break.
  Do not.
- **THE ROUTE OPTS OUT OF TRAILING-SLASH NORMALIZATION, AND BOTH SVELTEKIT
  DEFAULTS ARE WRONG FOR IT.** `'never'` 308s `/b/<app>/<version>/` to the
  slashless form, which is the broken one -- `.../<version>` has `.../<app>/`
  as its base URL, so every relative asset resolves one level too high and the
  app renders unstyled and scriptless, reading as a bad upload. `'always'`
  breaks the other direction, sending `.../style.css` to `.../style.css/`. Only
  `export const trailingSlash = 'ignore'` hands both forms to the handler, which
  then issues the ONE correct redirect: bare root, no slash, 307 with a
  RELATIVE `Location` so it stays right on any host.
- **THE HOST CHECK IS IN THE ROUTE AND IS NOT THE DELETED HOST BRANCH.** The
  branch that burned two lanes sat in `hooks.server.ts` and decided what an
  entire host could serve, ahead of routing, on every request to the site. This
  is one route declining to answer on an origin it is not for, inside its own
  handler. It is what stops the main host quietly becoming a second,
  cookie-carrying way to the same bytes. **Unset means any host**, so local dev
  and previews need no configuration; production pins
  `PUBLIC_FOUNDRY_APPS_ORIGIN`.
- **`allow-same-origin` IS GRANTED, CONDITIONALLY, AND THE CONDITION IS THE
  WHOLE OF WHAT MAKES IT SAFE. DO NOT REVERT IT TO A BLANKET REFUSAL.** This
  rule used to read "`allow-same-origin` must never appear on a Foundry frame",
  on the grounds that with `allow-scripts` it cancels the sandbox outright. **The
  mechanism is real and the rule was too broad.** Stripping the sandbox attribute
  off the `<iframe>` means reaching the PARENT document, and
  `window.parent.document` throws `SecurityError` unless the child is SAME-ORIGIN
  WITH ITS PARENT. So the pair cancels the sandbox only when the framed document
  and the page framing it share an origin -- which the SERVING-HOST GATE prevents
  in production, because a bundle answers only on the apps origin and the portal
  is by construction somewhere else.
  - **THE CONDITION, EXACTLY:** `foundrySandboxFlags(bundleOrigin, portalOrigin)`
    in `$lib/foundry/bundle-headers.ts` appends the flag only when both origins
    are non-empty AND they DIFFER. Either one missing, or the two equal, is the
    strict set. That is fail-closed: a deployment not told where its bundles and
    its portal live never gets the grant.
  - **AND IT COMPOSES WITH `frame-ancestors`, which is what makes it airtight
    rather than merely likely.** A non-empty portal origin is exactly when the
    CSP emits `frame-ancestors <portal origin>`, so in every configuration that
    grants the flag the browser itself refuses to let anything but the portal
    embed the bundle -- and the portal is not the bundle origin. The parent a
    bundle could reach into cannot exist. The configuration where anyone may
    frame a bundle is precisely the one where the flag is withheld.
  - **THE PORTAL ORIGIN IS RESOLVED, NOT READ, AND THAT IS LOAD-BEARING.**
    `foundryPortalOrigin(appsOrigin, portalVariable)` is the ONE implementation:
    `PUBLIC_FOUNDRY_PORTAL_ORIGIN` when set, otherwise `FOUNDRY_PLATFORM_ORIGIN`
    from `preflight.ts` but ONLY when `PUBLIC_FOUNDRY_APPS_ORIGIN` is itself set,
    otherwise empty. **Resting the grant on that variable alone made the whole
    feature silently inert wherever nobody had set it** -- and its absence is a
    supported configuration, because `frame-ancestors` is deliberately
    unset-means-unrestricted, so nothing would have reported it. **The apps
    origin gates the FALLBACK and never the configured value**: with no apps
    origin the routes answer on any host, which is dev and preview, where the
    portal and the bundle genuinely do share an origin and the escape above is
    real -- so the fallback is withheld exactly where applying it would
    manufacture the vulnerability.
  - **TWO FLAGS STAY REFUSED IN EVERY CONFIGURATION**, because neither is about
    what a bundle may do to ITSELF: `allow-top-navigation` (a redirect out of a
    student project onto anywhere) and `allow-popups-to-escape-sandbox` (an
    unsandboxed document opened from a student's app).
  - **THE FLAGS ARE WRITTEN DOWN ONCE, in `bundle-headers.ts`, and they are a
    FUNCTION now rather than a constant.** That moved out of `AppFrame.svelte`,
    which used to hold the only copy, because the SERVING side has to send the
    identical set as a CSP `sandbox` directive. `AppFrame` and
    `foundry-bundle-response.ts` each call the same two functions with the same
    two values; a second spelling, or a second reading of the raw variables, is a
    frame and a document that drift apart with nothing able to compare them.
- **EVERY BUNDLE ON THE APPS ORIGIN SHARES ONE STORAGE AREA, AND A SUBDOMAIN PER
  APP IS THE ONLY THING THAT WOULD SEPARATE THEM.** That is the price of the
  grant above and it is inherent in having a real origin at all: `localStorage`,
  `sessionStorage`, IndexedDB and cookies are keyed by ORIGIN, and every
  published app answers on `apps.ideabosco.com`. **So two published apps can read
  and overwrite each other's saved state**, deliberately or by both picking the
  key `save`. What is exposed is a student's own save data on a host that holds
  no session and no credential of ours, which is why the trade is worth making --
  the alternative was an opaque origin where the `localStorage` GETTER THROWS and
  every high score died at the next reload. **Do not describe bundle storage as
  isolated per app anywhere**, and if it ever must be, the answer is a subdomain
  per app, not a shim: nothing inside the sandbox can partition an origin from
  itself.
- **THE CSP `sandbox` DIRECTIVE AND THE IFRAME `sandbox` ATTRIBUTE ARE NOT
  REDUNDANT.** The attribute covers a document the portal frames; the directive
  covers the document however it was reached, so a student who navigates
  straight to a bundle URL lands in the same opaque origin. Measured both ways
  against a real served bundle: `window.origin` is `"null"` framed AND on a
  direct navigation, and `document.cookie`, `indexedDB` and every reach at the
  parent throw `SecurityError` in both.
- **`'self'` IS NOT A USABLE CSP SOURCE FOR A SANDBOXED DOCUMENT.** It is the
  only origin-relative source expression, and an opaque origin is same-origin
  with nothing -- so a source list must NAME THE BUNDLE ORIGIN LITERALLY.
  Equally, **`default-src` alone forbids inline script**, which kills the
  storage shim and essentially every generated app; `script-src`/`style-src`
  are stated explicitly with `'unsafe-inline'`. **The network is deliberately
  open now** (`https:` on every fetching directive), because the build contract
  tells students a CDN works and a policy that refused one would make the
  contract lie. **The isolation is the ORIGIN SPLIT and `frame-ancestors`, never
  a restriction on how the student's own script runs** -- it used to be the
  opaque origin, which the conditional `allow-same-origin` grant above ends in
  the configuration that grants it.
- **`base-uri` NAMES THE BUNDLE ORIGIN AND `https:`, NOT `'none'`, AND THE
  REASON IS A PORTED GAME'S `<base href>`.** A game brought in from elsewhere
  routinely ships as one HTML file with a `<base href>` pointing at the CDN its
  assets live on; under `base-uri 'none'` the browser ignores that element
  outright, every asset request resolves against the bundle instead and 404s, and
  the app renders empty -- which reads as a bad upload rather than a policy.
  **It grants nothing new**: `default-src` already admits `https:`, so every URL
  a `<base>` could point at was already reachable by writing it out in full, and
  what changed is only whether the student has to. Anything in this repo still
  saying `base-uri 'none'` is stale and is a bug to fix, not a rule to restore.
- **`frame-ancestors` IS UNSET-MEANS-UNRESTRICTED, WHICH REVERSES THE OLD
  RULE.** The proxy defaulted a missing app origin to `'none'`, fail-closed. On
  a feature whose history is silently serving nothing, a variable whose absence
  blanks every frame is the worse failure -- and a framed bundle is sandboxed,
  holds no session and reaches nothing of ours, so another site embedding one
  gains a copy of a student's app and no more. Production pins it with
  `PUBLIC_FOUNDRY_PORTAL_ORIGIN`. **The old `FOUNDRY_APP_ORIGIN` Supabase
  function secret is retired and never worked**: the gateway was replacing that
  CSP wholesale, so the value was read, sent, and discarded.
- **THE PUBLICATION GATE IS NOT A SESSION CHECK, AND THAT IS FORCED RATHER THAN
  CHOSEN.** There IS no session on the apps host -- that absence is the point of
  the split -- so "require a signed-in caller" is not available there without
  either `Domain`-scoping the session cookie onto the apps host, which hands
  every bundle the credentials the split exists to withhold, or putting a signed
  token back on every request, which is the machinery this feature spent five
  lanes removing. The licence comes from the VERSION'S OWN STATUS. Anyone
  proposing to add a session check here has to answer that first.
- **THE SERVICE-ROLE READ IS NOT THE LAST WORD ON ACCESS.** It bypasses RLS, so
  every rule RLS would have enforced is re-checked in the route on every
  request: the version belongs to the app, the app is not hidden, and the
  version is published or submitted.
- **THE FILE LIST IS THE ALLOWLIST.** A served path must have a row in
  `student_app_files` for that exact version and that exact string, so path
  traversal has nothing to traverse to and nothing is ever resolved against a
  filesystem. `bundlePathOk` runs first anyway, as an independent second
  refusal.
- **THE BUNDLE ROOT KEEPS ITS TRAILING SLASH.** `.../<version>` has
  `.../<app>/` as its base URL, so every relative asset in every bundle would
  resolve one level too high -- an app that renders unstyled and scriptless,
  which reads as a bad upload rather than a bad URL. `foundryBundleUrl` only
  produces the slash form and the function 307s the other one. **That redirect
  sends a RELATIVE `Location`**, because the only absolute URL the isolate can
  build is its own unreachable internal one. And **the redirect keys on whether
  the path was DERIVED, never on `path === 'index.html'`** -- keyed the second
  way, an explicit request for `.../index.html` bounced to `.../index.html/`.
- **EVERY REFUSAL IS THE SAME BODYLESS 404.** A malformed URL, an unknown app,
  an unpublished version, another app's file, a missing row and a hidden app
  are indistinguishable from outside.
- **A GAME'S HTML COVER IS THE THIRD APPS-ORIGIN ROUTE, AND IT IS STRICTER
  THAN A BUNDLE (ledger 0422, migration 0291).** `/c/<app id>`
  (`src/routes/c/[appId]/+server.ts`) answers only where bundles answer
  (`foundryOnServingHost`), reads `foundry_cover_html` through the request's
  own client, which on the apps origin is anonymous and so answers only for an
  app the gallery shows, and sends the bundle routes' one bodyless 404 for
  everything else. It is served under `foundryCoverCsp`: `sandbox
  allow-scripts` (no `allow-same-origin`, ever, not even conditionally as a
  bundle's is), `default-src 'none'`, `connect-src 'none'`, `form-action
  'none'`, `base-uri 'none'`, with images, media and fonts only from `data:`
  and `blob:`. A cover is an admin's HTML, not a student's, and it still gets
  no network at all: it can animate and react to the pointer, and it can read
  no cookie, store nothing and send nothing anywhere. `c` is a reserved
  short-link name (0292), and `/c/` is exempt from the report control, with
  its reason, like the bundle routes.
- **THE FRAME GRANTS `allow="fullscreen"` AND NOTHING ELSE, AND THE SANDBOX IS
  A SEPARATE LEVER FROM THE PERMISSIONS POLICY.** The default allowlist for
  `fullscreen` is `self`, no response in this repository sends a
  Permissions-Policy header, and a bundle is cross-origin BY DESIGN -- so a
  game's own in-document full-screen button was refused by the browser with
  nothing on screen to say why (report 33b). Measured as a pair in Chromium with
  the production sandbox set and a real gesture: with the attribute
  `document.fullscreenEnabled` is true and the request resolves, without it the
  flag is false and the request throws "Disallowed by permissions policy".
  - **IT IS A DIFFERENT CONTROL FROM `AppStage`'s**, which is the PARENT's and
    always worked; neither substitutes for the other, because a game that
    repaints on going full screen can only do that from inside.
  - **EVERY OTHER DEFAULT-`self` FEATURE IS REFUSED** -- `gamepad`, `autoplay`,
    `camera`, `xr-spatial-tracking` and the rest -- and each is its own decision
    with its own report behind it. A gamepad in a student's racing game silently
    doing nothing is this same defect one feature over; it has not been reported
    and is not fixed. `tests/foundry-iframe-permissions.test.ts` pins each
    refusal by name, over the file with its PROSE STRIPPED -- the comment above
    the tag explains why `allowfullscreen` was not used, so a raw read finds the
    word it is asserting the absence of.
- **`src/app.html` CARRIES `viewport-fit=cover`, AND THE HALF THAT MATTERS IS
  UNVERIFIABLE HERE.** Without it iOS insets the LAYOUT VIEWPORT to the safe
  area, so `100dvh` is already the inset box and a full-screen stage visibly
  stops short of the edges on a notched iPhone in landscape. No container in
  this repository has WebKit and Chromium ignores the attribute on a desktop, so
  what was measured is what it does NOT break: 9 route/width readings at
  607x320, 375 and 1440, every one identical with and without it, including all
  four `env(safe-area-inset-*)` values and the computed `100dvh`. **Six
  components read those insets** (`InstallPrompt`, `SiteFeedback`,
  `FrcInterestForm`, `CameraCapture`, `PhotoCorrector`, `/fsp/ask`) and every
  one adds its own padding rather than relying on a pre-inset viewport, which is
  why the change is safe to make on that evidence. Anything claiming this was
  verified on Safari is wrong.
- **PREFLIGHT WARNS ABOUT A MISSING VIEWPORT META AND MUST NEVER REFUSE ONE.**
  `htmlDeclaresViewport` reads the RAW SOURCE rather than `HtmlFacts`, and that
  is not laziness: `HtmlFacts` is produced by two different parsers (the
  browser's `DOMParser` and deno-dom inside `foundry-ingest`), so a field added
  to it has to be implemented in both or the server half reads `undefined` and
  warns about every upload ever made. Both sides are handed the same `source`,
  so a test over it cannot differ between them. It is a WARNING because an app
  may legitimately be desktop-only and because every app already published
  without the tag would start failing a check it passed on the day it was
  uploaded.
- **THE STORAGE SHIM IS INJECTED AGAIN, AND IT IS ALSO IN THE CONTRACT.** An
  opaque origin has no storage area and the `localStorage` GETTER THROWS, so
  the first line of a generated app that reads saved state takes the page down
  before anything renders. `injectStorageShim` in
  `$lib/foundry/storage-shim.ts` puts it first inside `<head>` on the way past;
  `foundryBuildContract()` embeds the same string for the student to paste, so
  the app behaves identically opened off their own filesystem. **Two
  deliveries, one source** -- there is exactly one copy of the shim text in the
  repo and running it twice is harmless.
