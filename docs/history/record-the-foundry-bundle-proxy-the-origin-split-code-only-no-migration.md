---
title: "The Foundry bundle proxy: the origin split (code only, NO migration)"
date: 2026-08-23
branches: []
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 124
---

Student-written code now runs on a second origin. Built on `lane/foundry-proxy`.
No migration, no Edge Function change, and still **no gallery and no submit
surface** -- those are a later lane. What exists is the host branch, the token
mint, the proxy, the platform fonts, the storage shim, the frame component and a
dev harness.

### Why two origins rather than one host and a header

A header governs scripting and document origin. It does not govern whether a
SUBRESOURCE request carries credentials. A bundle containing
`<img src="/api/whatever">` served from the app's own host reaches the real
backend with the viewer's cookies attached, and no CSP directive, no
`Cross-Origin-*` header and no sandbox attribute changes that -- the request is
same-site, so the cookies go. Served cross-site it reaches a host that reaches
nothing. That is the whole argument, and it is why `apps.ideabosco.com` exists.

### The Host header IS visible on Vercel, and it was measured before anything was built

This was the stated precondition, and it was answered against the LIVE
deployment rather than the documentation, using SvelteKit's own pre-routing CSRF
check as the probe: it compares the `Origin` header against `event.url.origin`
before any route resolution, so a 403 versus a 405 reports what
`event.url.origin` actually is.

| request | Origin sent | result |
| --- | --- | --- |
| `POST apps.ideabosco.com/__x` | `https://apps.ideabosco.com` | 405 (reached routing) |
| `POST apps.ideabosco.com/__x` | `https://ideabosco.com` | 403 Cross-site |
| `POST ideabosco.com/__x` | `https://ideabosco.com` | 405 |
| `POST ideabosco.com/__x` | `https://apps.ideabosco.com` | 403 Cross-site |

So `event.url.host` tracks the host the client asked for and is not rewritten
upstream. **It is also not forgeable**, which was the second measurement:
`X-Forwarded-Host: apps.ideabosco.com` sent to `ideabosco.com` left `url.origin`
on the main host (403 for an apps Origin, 405 for a main one), and the reverse
held too. Vercel overwrites the forwarding header with the real host before the
function sees it. `adapter-vercel` v6 hands the platform's `Request` straight to
`Server.respond`, and `svelte.config.js` sets no `origin` override, so nothing
between the edge and the hook can move it.

### What the host branch does, and the one thing it cannot do

`foundryHostBranch` is sequenced FIRST in `hooks.server.ts`, ahead of the
Supabase client, so a request on the bundle host cannot read a session or write
a refreshed auth cookie -- that is a property of the ordering rather than of
every downstream path behaving. It is an ALLOWLIST (`appsHostAllows`): `/r/*`
and `/_platform/*` resolve, everything else is a bodyless 404 answered before
the router, so a route added next month is unreachable there by default. The
main host 404s both prefixes, without which the split would be a convention
rather than a boundary.

**IT CANNOT REACH VERCEL'S FILESYSTEM, and that is a real residual gap rather
than an oversight.** `static/` and the build's own `_app/immutable/*` are served
without invoking the function at all. Measured against production today:
`apps.ideabosco.com/robots.txt` and `/push-sw.js` both answer **200**, while
`/favicon.png` and `/IDEA/idea.png` answer 404 (they are not in `static/`). The
same is true locally through Vite: `127.0.0.1:5173/coins/index.html` answered
200 with the branch in place. Those are public, sessionless bytes and a bundle
cannot fetch them (`connect-src 'none'`), so the leak is duplicate content
rather than reach -- but "every other path returns 404" is not literally true of
the deployed host and should not be read as though it were.

**What was established about closing it, and what was not.** A `vercel.json`
top-level `redirects` entry with a host `has` condition DOES run before the
filesystem -- measured, since `idea-app-sage.vercel.app/robots.txt` answers 308
to the canonical host rather than serving the file. So the lever exists. What a
redirect cannot produce is a 404, and the constructs that can (`rewrites`, whose
ordering against the filesystem was NOT measured, or the legacy `routes` array,
which cannot coexist with the `redirects` entry already in the file) would take
the whole site's static assets down if got wrong. **A probe was written to
settle the `rewrites` ordering question and could not be run: preview
deployments on this project are behind Vercel Deployment Protection (SSO), which
needs a bypass secret this session did not have.** Shipping an unverified
platform routing rule that can 404 `_app/immutable/*` in production was judged
worse than shipping the documented gap.

### The token

53 signed bytes, base64url: a version byte, three raw 16-byte uuids (app,
version, viewer) and a uint32 expiry, followed by a 32-byte HMAC-SHA256 of
exactly those bytes. Fixed-width, so there is no parser and no separator to get
wrong, and base64url means the token carries no slash, no dot and nothing
needing percent-decoding -- `/r/<token>/<path>` splits with no ambiguity.

- **It sits in the PATH, and that is a resolution argument rather than a
  security one.** Every relative request a bundle makes resolves under
  `/r/<token>/` on its own, with the bundle never knowing a token exists. A
  query string is dropped by the browser's relative resolution, so every second
  request would arrive unauthenticated.
- **The expiry is inside the signed bytes** (30 minutes), which is what makes it
  an expiry rather than a suggestion. Verification is `timingSafeEqual`, with
  the length checked first because it THROWS on a mismatch and a throw in a
  handler is a 500 where this wants a 404.
- **It is deliberately not the last word.** See the re-check below.
- **The dev secret is per-process and dev-only.** In production an unset
  `FOUNDRY_TOKEN_SECRET` returns null and the mint answers `not_configured`,
  because a per-instance secret across many serverless instances mints tokens
  that verify on the instance that made them and nowhere else -- an intermittent
  failure that looks like anything except a missing variable.

### The token is not the last word on access

The proxy reads `foundry-bundles` with the **service-role key**, which makes
`src/lib/server/foundry-bundle.ts` the FOURTH module in the codebase to hold
that credential. That is forced rather than chosen: the apps host is a different
site, so the viewer's cookies never arrive and there is no session to read a row
under, and 0130 gives `foundry-bundles` no storage policy at all, so
`service_role` is the only role that reaches it.

A service-role read bypasses RLS, so every rule RLS would have enforced is
re-checked explicitly, on every request: the version belongs to the app named by
the token, that version is STILL the app's `published_version_id`, and the app
is not hidden. **The second of those is the one that is easy to leave out**: a
token is good for half an hour, an app can be republished or withdrawn inside
that window, and without the re-read the withdrawn bundle keeps serving until
the token expires.

**The file list is the allowlist.** A served path needs a row in
`student_app_files` for that exact version and that exact string; nothing is
resolved against a filesystem, so `../` has nothing to traverse to.
`bundlePathOk` is applied first anyway, as a third independent refusal, for the
reason the deck proxy keeps its own: it means this route does not depend on the
ingest function and the CHECK constraint both having been right.

### The CSP, and the TWO places it departs from what was specified

The header asked for was `sandbox ...; default-src 'self' data: blob:;
connect-src 'none'; frame-ancestors <app origin>`. Both departures are about
`'self'`, and the first was measured by serving the literal header and loading a
bundle.

**1. `default-src` alone forbids inline script, which kills every bundle.**
`script-src` falls back to `default-src`, and `'self'` is not `'unsafe-inline'`.
Served literally, the hostile fixture rendered its own "script did not run"
placeholder and the console carried

```
Executing inline script violates the following Content Security Policy directive
'default-src 'self' data: blob:'. ... Note also that 'script-src' was not
explicitly set, so 'default-src' is used as a fallback. The action has been blocked.
```

for the storage shim AND for the bundle's own script. Not a degraded bundle: a
blank one. A single-file app with its script inline is the normal shape of a
generated app and the preflight deliberately permits it. So `script-src` and
`style-src` are stated explicitly with `'unsafe-inline'` and `'unsafe-eval'`.
**The isolation here was never a script-execution restriction** -- it is the
opaque origin, `connect-src 'none'` and `frame-ancestors`. Restricting how a
document executes the student's own script, which is the entire content of the
document on purpose, buys nothing against a document that can already reach
nothing. What the directive still buys is the SOURCE list: an off-origin
`<script src>` is refused, and that is verified.

**2. The source list names the bundle origin literally instead of `'self'`.**
`'self'` is the only origin-RELATIVE source expression, and `sandbox` without
`allow-same-origin` puts the document on an opaque origin, which is same-origin
with nothing -- not even the host it was served from. By the letter of the spec
a sandboxed document under `default-src 'self'` can load none of its own files;
engines have differed on whether to follow that letter. A host source expression
is matched against the URL and has no such ambiguity, and the origin is taken
from the request's own URL rather than a new environment variable.

**THIS ONE WAS FIRST DIAGNOSED WRONGLY, AND THE CORRECTION IS THE POINT.** In
the sandboxed document a `<link>` to a `data:` stylesheet and a `blob:` one both
applied while a `<link>` to the bundle's own `style.css` fired `onerror` --
which looks exactly like the `'self'` mismatch and IS NOT. It was the
verification pane blocking every subresource request made from an opaque origin
(`net::ERR_BLOCKED_BY_CLIENT`, with no `securitypolicyviolation` event at all).
Proven by fetching the identical URLs from an ordinary page in the same browser
and getting **200**. So the literal origin stands on PORTABILITY against a real
spec ambiguity, and **whether `'self'` would in fact have worked here is
untested**; the code comment says so rather than claiming the measurement.

The shipped header, verbatim off the wire (one line in reality; the origins are
the local ones, and in production they are the apps host and
`https://ideabosco.com`):

```
content-security-policy: sandbox allow-scripts allow-modals allow-pointer-lock;
default-src http://localhost:5173 data: blob:;
script-src http://localhost:5173 data: blob: 'unsafe-inline' 'unsafe-eval';
style-src http://localhost:5173 data: blob: 'unsafe-inline';
connect-src 'none'; frame-ancestors http://127.0.0.1:5173
```

### The storage shim

A document on an opaque origin has no storage area, and `window.localStorage`
does not return undefined there -- **the getter THROWS**. Read saved state at
the top of the script is the single most common shape an AI tool writes, so
without the shim the first line of a generated app throws before anything
renders. The proxy injects an in-memory implementation as the first element in
the head, before any student code runs.

- **It is a Proxy, not a plain object with five methods**, because half the
  Storage interface is the index properties. A plain-object shim FAILS QUIETLY:
  the assignment lands, the read comes back, and only `length`, `key()` and
  enumeration disagree, so a save/load feature half works. Verified in the
  browser: `Object.keys`, `JSON.stringify`, `length`, index get/set and `key(0)`
  all behave, and `localStorage` and `sessionStorage` are separate instances
  (`sessionStorage.s` came back "1" while `localStorage.s` came back null).
- **It is an INSERTION, not a rewrite.** The document is not parsed and
  reserialized; a test asserts that removing the injected tag returns the
  original bytes exactly.

### The platform fonts

`/_platform/fonts.css` plus six woff2 files, served from the function bundle via
`read()` from `$app/server` -- **not from `static/`**, because a file in
`static/` is served by Vercel's filesystem on EVERY host, which would put
`/_platform/*` on the main host and out of reach of the host branch entirely.
Serving them from a route is what makes "on the main host, `/_platform/*`
returns 404" true. Six files rather than thirty: the budget is an aging school
desktop, and under `no-store` every weight is a download each bundle pays for.

### The trailing slash, which was a real bug

SvelteKit's default normalization 308'd `/r/<token>/` to `/r/<token>` BEFORE any
hook ran. Measured: every bundle-root URL answered 308 rather than serving, and
on the main host that 308 fired ahead of the 404 the host branch owes it. The
worse half is where the hop lands -- a document at `/r/<token>` has `/r/` as its
base, so the bundle's own `data.json` resolves to `/r/data.json` and every
relative asset in every app 404s. Fixed with `trailingSlash = 'ignore'` plus an
explicit 307 on the bare root. `'always'` would have been the wrong fix in the
other direction: it appends a slash to `/r/<token>/data.json` too.

### What was driven in a browser

Against the real routes on one dev server, with `127.0.0.1:5173` and
`localhost:5173` as the two origins (different origins to a browser, same
server).

**Direct navigation to a bundle URL, outside any frame** -- which is the case
the CSP `sandbox` directive exists for, since the iframe attribute cannot cover
it:

| probe | result |
| --- | --- |
| `window.origin` | **null** (opaque origin) |
| inline script | RAN |
| `document.cookie` | BLOCKED SecurityError |
| `window.open` | returned null (no `allow-popups`) |
| external `<script src>` (jsdelivr) | global undefined, CSP-refused |
| `fetch` to an external URL | BLOCKED TypeError |
| `fetch` to a same-path API URL | BLOCKED TypeError |
| shim present, round trip | count=1 length=1 key0=probe-count index=1 |
| `<img src="/api/notebook/upload">` resolved to | `http://localhost:5173/api/...` -- **the apps host** |
| that image | did not load |

**localStorage does not survive a reload**, proven rather than assumed: a marker
was written, the page reloaded, and the reload confirmed FRESH by a JS-context
sentinel disappearing. Marker `null`, length back to 1. An identical-looking
count before and after would not have distinguished "reset" from "never
reloaded".

**Framed in the real `AppFrame`**, results posted out of the frame (nothing on
the parent page can read into a cross-origin opaque-origin document, and its
console is not the parent's console):

| probe | result |
| --- | --- |
| `window.parent.location` | BLOCKED SecurityError |
| `window.top.document` | BLOCKED SecurityError |
| `window.top.location = ...` | BLOCKED SecurityError |
| `window.open` | returned null |
| `document.cookie` | BLOCKED SecurityError |
| everything else | as the direct-navigation table |

**Top navigation is only a test when there is a top to escape from.** The first
version of the probe set `top.location` unconditionally and the
direct-navigation drive went straight to example.com before a single result
could be read -- which reads exactly like a sandbox escape and is not one: a
top-level document setting `top.location` is navigating ITSELF, which the spec
permits regardless of sandboxing (the "allowed to navigate" steps only refuse
when source and target differ). The probe now reports `n/a` there and runs it
only when framed.

**The proxy's own refusals**, driven with curl against the real routes. The
positive controls are what make the 404s mean something:

| case | result |
| --- | --- |
| valid token, entry file | 200 `text/html; charset=utf-8` |
| valid token, a real relative asset | 200 `application/json` |
| app A's token asking for app B's file | **404** |
| app B's token, app B's file (control) | 200 |
| signature with one byte changed | **404** |
| expired token (properly signed) | **404** |
| token for a version no longer published | **404** |
| path with `../` segments | **404** |
| the same valid bundle URL on the MAIN host | **404** |
| `/classroom` on the apps host | **404** |
| the auth callback on the apps host | **404** |
| `/_platform/fonts.css` on the apps host | 200 |
| `/_platform/fonts.css` on the MAIN host | **404** |

Every 404 is bodyless (`len=0`) and carries no CSP header, so nothing
distinguishes a bad signature from a missing row from the wrong host.

### Tests, and the mutation proof

`tests/foundry-proxy.test.ts`, 33 assertions, no database. The selection rule is
this repo's own: only guarantees whose regression would be SILENT -- a bundle
reachable from the session-bearing origin, a token that verifies after being
edited, a CSP that quietly lost `connect-src 'none'`, a sandbox attribute that
quietly gained `allow-same-origin`. All of those look exactly like success from
outside. It drives the REAL route handler against the dev fixture, and
server-renders the REAL `AppFrame`.

Three mutations, each in the PERMISSIVE direction, each restored md5-identical:

| mutation | reddens |
| --- | --- |
| `appsHostAllows` returns `true` for every path | "allows exactly the two bundle-host prefixes and nothing else" |
| the proxy route drops its own host check | "404s the SAME valid URL on the main host" |
| the publication re-check is removed | "404s a version that is no longer the app's published one" |

The signature test flips **every** byte of the 32-byte HMAC individually rather
than a convenient one, and separately edits the PAYLOAD to point at another app
while keeping the signature -- the forgery that matters.

A fourth mutation was attempted first and reported CLEAN, which was the harness
lying rather than the test being weak: `npx prettier` had been run on
`host.ts` with no config file in the repo, reformatting it from the repo's tabs
to two spaces, so the mutation's match text silently did not apply. The file was
converted back to tabs and the mutation then bit. **A mutation that reports no
failures is a result to distrust until the mutation is confirmed applied.**

### Two new verification-pane traps, both of which cost time here

- **The pane blocks every subresource request made from an opaque origin**
  (`ERR_BLOCKED_BY_CLIENT`, no `securitypolicyviolation`). This produced the
  wrong CSP diagnosis above. The discriminator is to fetch the identical URL
  from an ordinary page in the same browser.
- **Cross-origin iframe navigations to a loopback dev server are blocked
  intermittently**, while the same URL loads fine top-level -- and **`load`
  fires on a blocked navigation**, so a frame that never loaded looks like one
  that did. Read the network log, not the event.

Both are now in `CLAUDE.md`.

### NOT verified

- **Nothing was verified on a Vercel preview deployment.** Preview deployments
  on this project are behind Deployment Protection (SSO): every preview URL
  answers 302 to `vercel.com/sso-api`, and no bypass secret was available. The
  Host-header measurements above were therefore taken against PRODUCTION, which
  already serves both hostnames, and everything else was measured locally.
- **The apps host has never served a bundle.** `apps.ideabosco.com` currently
  serves the normal app, and will keep doing so until `PUBLIC_FOUNDRY_APPS_HOST`
  is set in the Vercel environment. Nothing in this lane has run on the real
  second origin.
- **`FOUNDRY_TOKEN_SECRET`, `PUBLIC_FOUNDRY_APPS_HOST` and
  `PUBLIC_FOUNDRY_APP_ORIGIN` are not set in Vercel.** Until they are, the mint
  answers `not_configured`, the proxy 404s everywhere, and the deployment
  behaves exactly as it does today.
- **The Supabase read path in `resolveBundleFile` has never run.** The local
  `.env` is a placeholder project, so the three re-checks were exercised only
  through the in-memory dev fixture, which mirrors them. The PostgREST select
  itself -- including the `student_apps!inner` embed, which is an assertion
  about a foreign key and exactly the shape the stale-embed rule warns about --
  is untested against a real database.
- **No real bundle has been served.** Every byte came from the dev fixture; no
  object was streamed out of `foundry-bundles`.
- **A bundle's subresource behaviour was not verified in a browser** (its own
  stylesheet applying, the platform fonts rendering, an image loading), because
  the pane blocks exactly those requests. The `<img>` URL RESOLUTION was
  verified, from `img.src` in the DOM; what such a request CARRIES was not --
  the server-side instrument that would have captured it was proven to work
  (a curl-sent cookie was recorded) and the browser's request never reached it.
- **`vercel.json` was not changed**, so static files still answer on the apps
  host. See the host-branch section for what is known and what is not.
- **The mint endpoint's refusals are unexercised.** They need a session and real
  rows; the harness mints directly, and says so.
- **No migration, and no Edge Function change.**

### Verified on PRODUCTION, after the merge landed

The "NOT verified" list above was written before the merge, on the assumption
that the Vercel environment carried none of the new variables. That assumption
was wrong and the corrected record is here rather than by editing the list, so
the sequence stays legible.

**`PUBLIC_FOUNDRY_APPS_HOST` and `PUBLIC_FOUNDRY_APP_ORIGIN` were already set in
the Vercel project**, so the origin split went live with the deploy rather than
waiting. It was noticed because `apps.ideabosco.com/` answered **404** instead
of the 200 it had answered an hour earlier -- which is the host branch working.

Driven against the real deployment:

| request | result |
| --- | --- |
| `apps.ideabosco.com/_platform/fonts.css` | 200 `text/css; charset=utf-8`, 1370 bytes |
| `apps.ideabosco.com/_platform/fonts/rajdhani-400.woff2` | 200 `font/woff2`, **14976 bytes** |
| `apps.ideabosco.com/classroom` | 404, len 0 |
| `apps.ideabosco.com/auth/callback?code=x` | 404, len 0 |
| `apps.ideabosco.com/api/feedback` | 404, len 0 |
| `apps.ideabosco.com/dashboard`, `/admin` | 404, len 0 |
| `ideabosco.com/_platform/fonts.css` | 404, len 0 |
| `ideabosco.com/r/abc/index.html` | 404, len 0 |
| `POST ideabosco.com/api/foundry/token` signed out | 401 `{"ok":false,"reason":"signed_out"}` |
| `POST apps.ideabosco.com/api/foundry/token` | 404 (the mint does not exist there) |
| `ideabosco.com/`, `/coins/index.html`, `/robots.txt` | 200 -- the main host is unaffected |

**The woff2 answering 200 with 14976 bytes settles a real unknown**: `read()`
from `$app/server` over a `?url` import does work through `adapter-vercel`, and
the font files are genuinely copied into the serverless function. That could not
be checked locally in any way that proved anything about the deployed bundle.

The production CSP, verbatim off the wire (one line in reality):

```
content-security-policy: sandbox allow-scripts allow-modals allow-pointer-lock;
default-src https://apps.ideabosco.com data: blob:;
script-src https://apps.ideabosco.com data: blob: 'unsafe-inline' 'unsafe-eval';
style-src https://apps.ideabosco.com data: blob: 'unsafe-inline';
connect-src 'none'; frame-ancestors https://ideabosco.com
```

alongside `cache-control: private, no-store`, `x-content-type-options: nosniff`,
and no `set-cookie`.

**AND THE STATIC-FILE GAP IS CONFIRMED IN PRODUCTION, WITH THE SPLIT LIVE.**
`apps.ideabosco.com/robots.txt` (200), `/push-sw.js` (200) and
`/coins/index.html` (200, 177019 bytes of the legacy Coin Ledger) all still
serve on the bundle host, because Vercel's filesystem answers them without
invoking the function. This is exactly the gap the host-branch section
describes, no longer a prediction. A visitor who types that URL gets the Coin
Ledger on the bundle origin; a bundle still cannot fetch any of it
(`connect-src 'none'`), and none of it carries a session. Closing it remains a
platform-routing change that wants the `rewrites`-versus-filesystem measurement
this session could not run.

### Still NOT verified after the production pass

- **Whether `FOUNDRY_TOKEN_SECRET` is set cannot be determined from outside, by
  design.** The mint checks the session BEFORE the secret, so a signed-out
  request answers 401 either way; and the proxy answers the same bodyless 404
  for "no secret" as for "bad token", which is the no-oracle rule working. It
  has to be confirmed in the Vercel project settings.
- **No real bundle has been served on any host.** There is no published app
  yet, so nothing has been streamed out of `foundry-bundles` and the Supabase
  read path in `resolveBundleFile` -- including its `student_apps!inner` embed
  -- has still never run.
- **The preview deployment was never reachable** (Deployment Protection), so
  nothing was checked there beyond the build succeeding.

---

