---
title: "Bundles are served by a SvelteKit route on the apps origin, and the Edge Function is deleted (code only, no migration)"
date: 2026-08-25
branches: []
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 141
---

**Branch:** `lane/foundry-serve-vercel`.

### The measurement that decided this

`foundry-serve` was deployed and it was running correctly. Fetched from the
hosted project, a published bundle came back:

```
HTTP/1.1 200 OK
Content-Type: text/plain
content-security-policy: default-src 'none'; sandbox
x-content-type-options: nosniff
x-robots-tag: noindex, nofollow
sb-gateway-version: 1
x-served-by: supabase-edge-runtime
Server: cloudflare
```

Two things, not one. The gateway rewrote `text/html` to `text/plain`, AND it
**replaced the function's own CSP** with `default-src 'none'; sandbox` -- so
correcting the content type alone would still have produced a blank page, and
`frame-ancestors` (the `FOUNDRY_APP_ORIGIN` function secret) had never once
taken effect. Neither is reachable from function code.

That the function was deployed and had reached its HTML branch was established
before the fetch, from the user's own observation that the storage shim was
present in the rendered text: `injectStorageShim` had exactly one production
caller, inside `if (contentType.startsWith('text/html'))`, and `foundry-ingest`
never writes the shim into the stored bytes. So the function WAS setting
`text/html` and the rewrite was downstream. An undeployed function would have
produced the gateway's own JSON 404, not a student's HTML.

**Supabase does not serve HTML.** Storage's renderer was the first measurement
(the previous lane); the Edge Function gateway is the second. Different
codebases, different languages, identical refusal -- a platform posture against
arbitrary HTML on `*.supabase.co`, not a bug in either.

**A Supabase custom domain was NOT recommended, because it was not measured.**
Whether that control is hostname-conditional is unknown; the storage twin is
unconditional, which is suggestive and not dispositive. It is a paid add-on and
the session had no network reach to test it.

### The contradiction in the instruction, and what was built instead

The instruction was that the route require a session: "the request must carry a
session, and the version must be the app's published version, or the caller
must be an admin previewing a submitted one."

**That is not possible on the apps origin, by exactly the property that makes
the apps origin worth having.** `@supabase/ssr@0.12.0`'s
`DEFAULT_COOKIE_OPTIONS` is `{ path, sameSite: 'lax', httpOnly: false }` with
no `Domain`, and `hooks.server.ts:57` adds none -- so the session cookies are
host-only on `ideabosco.com` and are never sent to `apps.ideabosco.com`. A
session check there would 404 every bundle. The rule "moved to where the bytes
are served" was enforced by the old MINT, which ran on the main host.

The three ways out: `Domain`-scope the cookie onto the apps host (hands every
student bundle the credentials the split exists to withhold), sign a token
(the machinery five lanes were spent removing, and forbidden by `CLAUDE.md`),
or take the licence from the version's own status. **The third is what shipped**
-- it is the gate the Edge Function already enforced and `CLAUDE.md` already
documents, so it is the conservative option rather than a new posture. This is
flagged here because it is a deviation from the written instruction.

### What was deleted, and what was already gone

`supabase/functions/foundry-serve/` entirely, plus its `[functions.foundry-serve]`
block in `config.toml`.

Six of the seven items on the deletion list **did not exist** -- the token mint,
`foundry-token.ts`, `server/foundry-serve.ts`, `foundry/host.ts`, the
`hooks.server.ts` host branch and `scripts/foundry-edge-routes.mjs` were all
removed by `lane/foundry-direct`. `tests/foundry-bundle-url.test.ts` already
swept for them and still does; the Edge Function joined that sweep.

### What replaces it

`src/routes/b/[appId]/[versionId]/[...path]/+server.ts`, an ordinary route.
`serveBundleFile` in `$lib/server/foundry-bundle.ts` does the read, which
collapses Foundry back to ONE reader of `SUPABASE_SERVICE_ROLE_KEY` (it was two
only because the function ran in a runtime that could not import the first).

- `export const trailingSlash = 'ignore'`. **Both SvelteKit defaults are wrong
  here**: `'never'` 308s the slash form to the slashless one, which is the
  broken one; `'always'` sends `.../style.css` to `.../style.css/`. `'ignore'`
  hands both to the handler, which issues the one correct 307.
- The host check lives IN the route, not in `hooks.server.ts`. Unset means any
  host, so dev and previews need no configuration.
- `FOUNDRY_SANDBOX_FLAGS` moved out of `AppFrame.svelte` into
  `bundle-headers.ts`, because the frame attribute and the CSP `sandbox`
  directive must carry identical flags and used to be two literals in two
  runtimes with nothing able to compare them.
- Two new public variables: `PUBLIC_FOUNDRY_APPS_ORIGIN` and
  `PUBLIC_FOUNDRY_PORTAL_ORIGIN`. The first, unset, **removes the launch control
  everywhere** rather than falling back to the current origin -- that fallback
  would serve bundles off the cookie-carrying host, silently.

### Verified

Against the real route on a real dev server, in real Chromium, using the
in-memory fixture (`$lib/server/foundry-dev-fixture`), which now registers the
three on-disk acceptance bundles plus one app carrying a file per servable
extension.

Complete response headers, entry document, apps host, `frame-ancestors` pinned:

```
HTTP/1.1 200 OK
cache-control: private, max-age=60
content-length: 1818
content-security-policy: sandbox allow-scripts allow-modals allow-pointer-lock;
  default-src http://apps.localhost:5173 https: data: blob:; script-src ...
  'unsafe-inline' 'unsafe-eval'; style-src ... 'unsafe-inline'; img-src ...;
  font-src ...; media-src ...; connect-src ...; base-uri 'none';
  form-action 'none'; frame-ancestors http://127.0.0.1:5173
content-type: text/html; charset=utf-8
referrer-policy: no-referrer
x-content-type-options: nosniff
x-robots-tag: noindex, nofollow
```

Every servable extension, fetched:

| path | content-type |
| --- | --- |
| `/` (entry) | `text/html; charset=utf-8` |
| `style.css` | `text/css; charset=utf-8` |
| `app.js` | `text/javascript; charset=utf-8` |
| `data.json` | `application/json; charset=utf-8` |
| `notes.txt` | `text/plain; charset=utf-8` |
| `pixel.png` | `image/png` |
| `mark.svg` | `image/svg+xml` |
| `face.woff2` | `font/woff2` |
| `icon.ico` | `image/vnd.microsoft.icon` |

Routing and refusals, by request: bare root 307s to the slash form with a
relative `Location`; an explicit `index.html` does NOT bounce; unknown app,
cross-app version, missing file and POST all 404 with a zero-byte body. The
host gate both directions: with the apps origin pinned elsewhere, the main host
404s and the apps host 200s.

`deflect.html` **renders and runs** in the real `AppStage` + `AppFrame` --
canvas animating, score advancing, `window.origin` `"null"`.

Sandbox, against the real served bundle:

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
| `localStorage` via the shim | works | works |

The direct-navigation `"null"` is the CSP `sandbox` directive taking effect --
the half the Supabase gateway was destroying.

`tests/foundry-serve-route.test.ts` is new: 28 assertions driving the REAL
handler. `svelte-check` 0 errors / 37 warnings (31 `state_referenced_locally`,
5 `css_unused_selector`, 1 `perf_avoid_nested_class`).

### NOT verified

- **Nothing has run on production, or against any Supabase project.** The
  session had no Docker daemon and no network reach past github.com, so there
  was no local stack and no hosted one. `serveBundleFile`'s Supabase branch --
  the version/app/file reads and the Storage download -- **has never executed**.
  Only its dev-fixture branch has. Everything above about headers, routing,
  refusals and the sandbox is about code paths shared by both.
- **The acceptance flow was NOT the real publish flow.** No `foundry_create_app`,
  no upload, no `foundry-ingest`, no review, no publication. The bytes came from
  the in-memory fixture.
- **`approved-react-app.html` did NOT render.** All four unpkg tags failed with
  `ERR_TUNNEL_CONNECTION_FAILED` -- the session's egress proxy blocks
  `unpkg.com`. **No `securitypolicyviolation` fired**, which is the documented
  discriminator: the CSP permitted the scripts and the network refused them. The
  fixture is unverified either way on this lane.
- Google Fonts is blocked in the same way, so `/_platform` font loading from an
  opaque origin was not re-checked.
- The traversal refusal was measured at the route (`tests/foundry-serve-route.test.ts`)
  but NOT through the dev server: curl normalizes `..` and Vite's own middleware
  answered 403 for a raw one. Production normalization is untested.
- Vercel's own treatment of these headers is untested. The whole premise is that
  it does not rewrite them the way Supabase does; that is an assumption here.
- `apps.ideabosco.com` was reported as already configured on the Vercel project.
  Not confirmed from this session.

---

