---
title: "Foundry origin split: the two holes production found (`lane/foundry-host-holes`)"
date: 2026-08-23
branches: [lane/foundry-host-holes]
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 125
---

## Foundry origin split: the two holes production found (`lane/foundry-host-holes`)

A production verification pass over the merged origin split found two ways the
bundle host was not "bundles and nothing else". Neither was hypothetical and
neither was visible from the suite, which was green throughout. No migration.

### Hole 1 -- `apps.ideabosco.com/r` booted the portal

`isFoundryProxyPath` was a PREFIX test (`pathname === '/r' || startsWith('/r/')`),
so a bare `/r` passed `appsHostAllows`, the hook handed it to the SvelteKit
router, no route exists at `/r`, and the root `+error.svelte` answered. Measured
in a real browser on production: the page fully booted on the bundle origin, 33
`_app/immutable` modules fetched from `apps.ideabosco.com`, `__sveltekit_*`
present, the `SiteFeedback` control rendered, and `userProfile` in the inlined
payload -- the root `+layout.server.ts` key, so a session read had run on the one
origin that exists to make that impossible. No session leaked (no cookies reach
that origin, and `document.cookie` / `localStorage` were both empty), but the
hook's stated guarantee that nothing on that host reaches the Supabase client
was false for that one path.

Fixed by matching the shape the proxy actually serves rather than the prefix it
sits under: `/r/{token}/` with a non-empty token segment and its slash. It is a
SHAPE test, not a token test -- the charset, signature and expiry stay
`foundry-token`'s job, so there is no second copy of "what a valid token looks
like" to drift. Refusing the slashless `/r/{token}` also closed a small oracle:
the route verified the token BEFORE issuing its trailing-slash 307, so a good
token answered 307 where a bad one answered 404.

**And narrowing it opened something on the other host, which is why there are
now two predicates.** With the shape test governing both branches, a bare `/r`
matched no route on either host, so on the MAIN host it stopped being
intercepted and fell to the router: 404 with 171,045 bytes in dev, against
`/nope`'s 171,048. Harmless in itself, but it would let a route added at
`/r/<anything>` ship reachable on the session-bearing origin.
`isFoundryHostNamespace` (prefix) now governs the main host and `appsHostAllows`
(shape) governs the apps host. Two predicates, two different questions; both
strictly tighter than the single test that used to serve both.

### Hole 2 -- the static tier never invoked the function

Measured on production: `/coins/index.html` served 200 with 177,019 bytes of
`text/html` on the bundle host, plus `/robots.txt`, `/push-sw.js`,
`/manifest.webmanifest` and every `_app/immutable/*` asset. The prior record
called this gap `robots.txt` and `push-sw.js`; it was the whole static tier and
the whole client build.

**`vercel.json` cannot close it, and that took two probe deployments to
establish rather than one reading of the docs.**

- A `routes` entry with `status: 404` FIRES but does not suppress the body.
  `/robots.txt` answered 404 carrying its own 142 bytes; `/coins/index.html`
  answered 404 carrying all 175,996 of its. `/probe-sanity` (no static file)
  answered a real 404, which is the positive control proving the routes were
  live and the config was not simply ignored. A status without a destination is
  precisely the fix that looks right and does nothing.
- A `routes` entry with `dest` DOES shadow a static file -- but Vercel merges
  `vercel.json` routes after the framework's own, and `adapter-vercel` emits
  `{ src: '/_app/immutable/.+', headers: {...} }` with **no `continue`**, which
  terminates the pre-filesystem phase. That config closed `static/` and left the
  entire client build open.

So the route has to go in ahead of the adapter's, which means editing the
generated Build Output config. `scripts/foundry-edge-routes.mjs` runs after
`vite build` and unshifts ONE host-matched route pointing at the adapter's own
catch-all, read out of the generated config rather than hardcoded (the dest is
an internal name, `/![-]/catchall`, that the adapter owns). It names no paths:
sending everything to the function keeps the hook the single decision point
instead of putting a second copy of the allowlist in the routing layer. It
throws on a missing config, a missing catch-all, or a route that did not land,
because the failure it replaces was invisible.

### Verified

Locally, against the real dev server with the apps host pointed at it, every
`/r` shape and both hosts: see the session report. The load-bearing ones are
that a VALID bundle still serves after the narrowing (root 200/7008 bytes, a
file 200/55 bytes) while a tampered signature, another app's file, a missing row
and a cross-app token are all bodyless 404s, and that no response the apps host
serves carries `userProfile` or `__sveltekit` while the main host's homepage
carries both.

On a preview made the apps host by pointing `PUBLIC_FOUNDRY_APPS_HOST` at its
own alias: `/coins/index.html`, `/robots.txt`, `/push-sw.js` and
`/manifest.webmanifest` all returned empty, `/_platform/fonts.css` still served
1,370 bytes, the fonts still downloaded, and `/r` no longer booted anything
(`__sveltekit` count 0). `_app/immutable` went from 3,183 bytes on the same
deployment's non-apps hostname to 9 on the apps hostname -- a paired positive
control, so "closed" is not "the file was missing".

### Residue, stated rather than papered over

- **`_app/immutable/*` refuses with 9 bytes, not zero.** The adapter's own
  post-filesystem rule answers 404 and Vercel supplies its default `Not Found`.
  No asset is served, but that prefix is distinguishable from the hook's
  bodyless refusal. It reveals only that a path is under `_app/immutable`.
- **A trailing slash still costs a 308 before any hook runs.** SvelteKit
  normalizes `/r/` to `/r` pre-hook. Universal (`/nope/` does it too), so it
  distinguishes nothing about Foundry.

### NOT verified

- **The shipped config has not run on `apps.ideabosco.com` itself.** A preview
  has one hostname; the host-matched route was exercised against a preview alias
  standing in for the apps host, which proves the mechanism but not the
  production value of `PUBLIC_FOUNDRY_APPS_HOST`.
- **Still no real bundle end to end on production.** The local dev harness
  exercised the whole proxy path with real minted tokens; production has no
  published app, and this session had no production service-role key.
- **No signed-in load of the main site.** No session was available and obtaining
  one would have meant entering credentials.

---

