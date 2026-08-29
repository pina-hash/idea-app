---
title: "The bundle proxy is deleted, and a Supabase Edge Function serves bundles instead (code only, no migration)"
date: 2026-08-25
branches: []
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 140
---

**Branch:** `lane/foundry-direct`.

### What this replaced

The Foundry bundle proxy had never once served a bundle in production, across
five lanes of diagnosis. Production logs showed the host branch in
`hooks.server.ts` entering, allowing the request and returning 404, with the
handler probe firing on one deployment and not on the next for identical
requests. The instruction for this lane was to stop debugging it and remove it.

Deleted outright, not left dormant: `src/routes/r/[token]/[...path]`, the mint
at `src/routes/api/foundry/token`, `src/lib/server/foundry-token.ts`,
`src/lib/server/foundry-serve.ts`, `src/lib/foundry/host.ts`, the host branch in
`hooks.server.ts` (both halves), `scripts/foundry-edge-routes.mjs` and its build
step, the `/dev/foundry-proxy` harness, and `tests/foundry-proxy.test.ts` +
`tests/foundry-edge-routes.test.ts`. `PUBLIC_FOUNDRY_APPS_HOST`,
`PUBLIC_FOUNDRY_APP_ORIGIN` and `FOUNDRY_TOKEN_SECRET` are read by nothing and
should be deleted from the Vercel project.

There were two items on the deletion list that **did not exist**: there are no
vendored libraries under `/_platform/lib`, no CDN auto-rewrite, and no
`foundry-probe` lines outside the dev fixture that went with the dev harness.

### The plan was to frame the Storage object URL. That is impossible.

The instruction was to make `foundry-bundles` public and point the iframe at
`.../storage/v1/object/public/<bucket>/<app>/<version>/index.html`. Measured
against a real object on a real Storage instance:

| stored content type | served content type |
| --- | --- |
| `text/html; charset=utf-8` | `text/plain; charset=UTF-8` |
| `Text/Html; charset=utf-8` | `Text/Html; charset=utf-8` |
| `application/xhtml+xml` | `application/xhtml+xml` |

`normalizeContentType` in storage-api's renderer rewrites any content type
containing `text/html` to `text/plain`, unconditionally. It is in the shared
renderer, so the public path, the authenticated path and a signed URL all do it,
and there is no bucket flag or environment variable for it. A framed bundle
would have shown its own source as text.

The case-sensitivity of that check IS a working bypass. It was measured and
**rejected**: it is a deliberate circumvention of somebody else's abuse control,
and one upstream `.toLowerCase()` would silently break every published app at
once with nothing in this repo to change -- which is precisely the failure mode
this lane exists to end.

That measurement was put to the user with the alternatives; they chose the
Supabase Edge Function.

### What serves a bundle now

`supabase/functions/foundry-serve`, at
`<supabase origin>/functions/v1/foundry-serve/<app id>/<version id>/<path>`.
`src/lib/foundry/bundle-url.ts` is the one pure builder and `AppStage` reads
`PUBLIC_SUPABASE_URL` for the origin.

Because a function can set its own headers, **the bucket stays private** --
0130's "no policy at all" is untouched and no migration ships with this bundle.
That is strictly better than the plan: no draft, rejected, superseded or hidden
build is world-readable.

**The publication gate replaced the review-kind token with the version's own
status**: a version serves when it is the app's `published_version_id` OR its
status is `submitted`, and never when the app is hidden. The trade is stated in
the function's header -- it costs a link a student could share to their own
submitted-but-unapproved build, and buys immediacy, because a rejection, a
rollback and a hide all take a build off the web in the same statement that
records them, which a thirty-minute token could not.

Driven against the local stack through the real RPCs, both directions:

| state | published build | the other build |
| --- | --- | --- |
| v2 is a DRAFT | 200 | 404 |
| v2 SUBMITTED for review | 200 | 200 |
| v2 REJECTED | 200 | 404 |
| v3 PUBLISHED, superseding v1 | 200 (v3) | 404 (v1) |
| app HIDDEN by staff | 404 | 404 |
| app un-hidden | 200 | 404 |

### Two platform facts that did not transfer, both found the hard way

Both produced a plausible wrong answer first, and both failed as the same
bodyless 404 a real refusal produces.

1. **The edge runtime strips its own mount.** `url.pathname` inside the isolate
   is `/foundry-serve/<app>/<version>/`, not the `/functions/v1/...` the browser
   asked for, so anchoring on the literal prefix refused everything. `parse()`
   now names no prefix at all: it walks the segments and takes the first place
   two uuids sit next to each other.
2. **`url.origin` inside the isolate is the runtime's internal address**
   (`http://127.0.0.1:8081` measured locally), and `SUPABASE_URL` is the
   internal gateway (`http://kong:8000`). Either one in a CSP source list names
   an origin no browser will load from. The public origin comes from
   `x-forwarded-proto` / `-host` / `-port`, degrading to `url.origin`.

A third, smaller one: keying the trailing-slash redirect on
`path === 'index.html'` sent an explicit request for `.../index.html` to
`.../index.html/`. It keys on whether the entry was DERIVED now. And the
redirect sends a RELATIVE `Location`, because `Response.redirect` demands an
absolute URL and the only one the isolate can build is its unreachable internal
one.

### The preflight relaxed, and the contract with it

There is no `connect-src` restriction on a bundle now, so `classifyReference`
returns `ok` for http, https and the protocol-relative form, and `scanJs` no
longer mentions `fetch`, `XMLHttpRequest`, `WebSocket` or `EventSource` at all.
What still refuses is containment: a leading slash, a `..` that climbs out, a
non-web scheme, a disallowed extension, the caps.

`pushImport` used to SKIP an absolute specifier. With remote imports allowed
that would have left the only genuinely broken import shape as the one nothing
said anything about, so it refuses now.

**`/_platform/fonts.css` is no longer an allowed absolute path, because it
cannot work.** A leading slash resolves against the bundle's own origin, which
is Supabase. The route moved to the main host with
`access-control-allow-origin: *` and the contract names the whole URL. The CORS
header is load-bearing: an opaque origin makes even a same-host font fetch
cross-origin, and `@font-face` is CORS-mode. Measured in real Chrome from a
genuine opaque origin -- the sheet loads, `cssRules` throws `SecurityError`
(proving it really is cross-origin), `document.fonts.load('16px Rajdhani')`
returns one face and `document.fonts.check` is true. This corrects the note in
`CLAUDE.md` that read as "an opaque-origin document cannot load fonts": it
could not load them because nothing sent a CORS header, not because opaque
origins cannot.

**Storage did not relax**, and is the one warning left: touching `localStorage`
or `sessionStorage` earns a warning naming the shim and the entry file. It is
unconditional, because the half of the sentence that says nothing survives a
reload is true of a correctly shimmed app too.

**The shim is injected again AND is in the contract.** The instruction was to
put it in the contract "instead", written on the assumption that nothing would
be serving the bytes. Something is, so both: `injectStorageShim` rescues every
app whose author never read the contract and every app already published, and
the contract's copy makes the app behave the same opened off a filesystem,
which the contract tells students to check. One string, two deliveries.

### Verified

Against a local Supabase stack (`supabase start`, 544xx ports) with the real
migration chain, both fixtures published through the real flow --
`foundry_create_app`, an upload to `foundry-uploads`,
`foundry_create_version`, the real `foundry-ingest` function,
`foundry_submit_version`, `foundry_review_version`,
`foundry_set_published_version` -- and then run in the real `AppStage` +
`AppFrame` through a new dev harness at `/dev/foundry-run`:

- `tests/fixtures/foundry/deflect.html` (canvas, zero external references) --
  renders and animates.
- `tests/fixtures/foundry/approved-react-app.html` (React 18, ReactDOM and
  Babel from unpkg, JSX transpiled in the browser) -- renders and its controls
  work. Every one of those four lines was a refusal before this bundle.

That the React fixture passed ingest at all is the behavioural marker proving
the edge runtime was running the edited `preflight.ts` rather than a cached
copy.

Sandbox, against the real served bundle
(`tests/fixtures/foundry/sandbox-probe.html`), framed and on a direct
navigation:

| probe | framed | direct navigation |
| --- | --- | --- |
| `window.origin` | `"null"` | `"null"` |
| `window.parent.location.href` | BLOCKED SecurityError | (is itself) |
| `window.top.document.title` | BLOCKED SecurityError | (is itself) |
| `window.parent.localStorage` | BLOCKED SecurityError | (its own, shimmed) |
| `document.cookie` | BLOCKED SecurityError | BLOCKED SecurityError |
| `indexedDB.open` | BLOCKED SecurityError | BLOCKED SecurityError |
| `window.open` | returned `null` | returned `null` |
| set `top.location` | BLOCKED SecurityError | not run (nothing to escape) |
| `localStorage` via the shim | works, stringifies, indexes | same |

The parent's own `localStorage` entry was set before the frame mounted and was
intact and unreadable afterwards; the top URL never moved.

Refusals, by request against the running function: cross-app version, cross-app
file, missing file, traversal, unknown app, a URL with no uuids -- all 404 with
no body. The slashless root 307s to the slash form and follows to 200.

`svelte-check` 0 errors / 37 warnings (31 `state_referenced_locally`, 5
`css_unused_selector`, 1 `perf_avoid_nested_class`). Full suite green.

### NOT verified

- **Nothing here has run on production.** The local stack is a different
  Supabase instance; `foundry-serve` has never been deployed to the real
  project and the two platform facts above were measured against the LOCAL edge
  runtime. Both were written to be independent of the mount and of the internal
  origin precisely because a hosted runtime may present them differently, but
  "written to be independent" is not "measured hosted".
- The `foundry-ingest` function was not redeployed to production either, and it
  imports the relaxed `preflight.ts`.
- The fonts measurement was localhost-to-localhost. It is a genuine
  opaque-origin cross-origin request, which is the hard case, but the real
  bundle host was not the requesting party.
- `normalizeFoundryInput` (the browser's File/DataTransfer packing) was not
  exercised; the verification built the same single-entry zip with `fflate`, as
  `tests/foundry-preflight.test.ts` already does.
- The gallery and the review queue were not driven end to end against real
  published apps -- another session holds those surfaces, and this lane touched
  them only to delete their dead `launch` transports.

### A finding outside this lane

`svelte-check` on `main` was **1 error**, not 0: `tests/classroom-submission-open-race.test.ts:86`
read `s.name` off `SeededUser`, which has no such property (from commit
`6d9e884`). The value was always `undefined` and always fell through to
`s.email`, so nothing behaved wrongly. Fixed to `s.email` so the baseline this
lane reports is a real 0. `CLAUDE.md`'s stated baseline of "0 errors, 37
warnings" is correct again and did not need changing.

### Deferred

- **Deploy ordering is a manual step and it is not optional.**
  `supabase functions deploy foundry-serve` must run BEFORE the app deploy that
  names its URL, or every launch 404s.
- `supabase secrets set FOUNDRY_APP_ORIGIN=https://ideabosco.com` pins CSP
  `frame-ancestors`. Unset means unrestricted, which reverses the old
  fail-closed default deliberately.
- `apps.ideabosco.com` can be removed from the Vercel project. Nothing serves
  it and nothing links it.
- A per-subresource function invocation is the running cost of this shape. Not
  measured; a bundle with many files pays one cold-start-capable call each.

---

