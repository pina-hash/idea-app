---
title: "A published app keeps its saved data, and the portal origin stops depending on a Vercel variable (`claude/foundry-sandbox-origin-gtimhj` + `claude/foundry-portal-origin-3n3jq5`, code only, no migration)"
date: 2026-08-27
branches: [claude/foundry-sandbox-origin-gtimhj, claude/foundry-portal-origin-3n3jq5]
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 153
---

Two bundles, recorded together because the second exists only to stop the first
being silently inert. The first shipped and merged as
[#16](https://github.com/pina-hash/idea-app/pull/16) with no history entry; this
is that entry, plus what the follow-up changed.

### The problem the first bundle solved

A student's published app lost every save on reload. A bundle is served into an
OPAQUE origin, an opaque origin has no storage area at all, and `localStorage`
there does not merely come back empty -- **the GETTER THROWS**. `injectStorageShim`
had been standing in with an in-memory object, which keeps the first line of a
generated app from taking the whole page down but cannot survive a navigation.
Every high score, every save slot, every remembered setting died at the next
reload, on a platform whose whole point is that students publish games.

### What changed, and the rule that turned out to be too broad

`bundle-headers.ts` used to carry a flat `FOUNDRY_SANDBOX_FLAGS` constant with a
comment saying `allow-same-origin` **must never** join it: with `allow-scripts`
it cancels the sandbox outright, because a document given both reaches its own
origin, strips the sandbox attribute off itself in the parent and reloads
unsandboxed.

The mechanism is real. The rule dropped its condition. Removing an attribute
from the `<iframe>` element means reaching the PARENT document, and
`window.parent.document` throws `SecurityError` unless the child is same-origin
with that parent. So the pair is unsafe when the framed document shares an
origin with the page framing it, and safe when it does not -- and the origin
split exists precisely to guarantee it does not.

The constant became `foundrySandboxFlags(bundleOrigin, portalOrigin)`, which
appends `allow-same-origin` only when both origins are non-empty **and they
differ**. Either missing, or the two equal, is the strict set. Six flags were
added to the base set in the same pass (`allow-forms`, `allow-downloads`,
`allow-popups`, `allow-orientation-lock` beside the original three), `base-uri`
stopped being `'none'`, `connect-src` gained `wss:`, and `worker-src` and
`frame-src` were stated rather than left to fall back.

### Why it is fail-closed

Two independent reasons, and the second is the one that makes it airtight rather
than merely likely:

1. **A missing origin is not a reason to guess.** Every case the function cannot
   prove cross-origin -- either argument empty, the two equal, an unparseable
   frame `src` -- returns the strict set. A deployment that has not been told
   where its bundles and its portal live never gets the grant.
2. **It composes with `frame-ancestors`.** A non-empty portal origin is exactly
   when the CSP emits `frame-ancestors <portal origin>`, which applies to the
   whole ancestor chain. So in every configuration that grants the flag, the
   browser itself refuses to let any document other than one on the portal
   origin embed the bundle -- and the portal origin is by construction not the
   bundle origin. The parent a bundle could reach into cannot exist. Conversely,
   the configuration where anyone may frame a bundle (no portal origin, so no
   `frame-ancestors`) is precisely the configuration where the flag is withheld.

### The consequence, stated rather than discovered later

**Every bundle on the apps origin now shares ONE storage area.** Storage is keyed
by origin and every published app answers on `apps.ideabosco.com`, so two
published apps can read and overwrite each other's saved state -- deliberately,
or by both choosing the key `save`. That is inherent in having a real origin at
all; **a subdomain per app is the only thing that would separate them**, and
nothing inside the sandbox can partition an origin from itself. The trade was
taken because what is exposed is a student's own save data on a host that holds
no session and no credential of ours, against the alternative of every app
losing everything on every reload.

`base-uri` moving off `'none'` has its own reason: a game ported from elsewhere
routinely ships as one HTML file with a `<base href>` pointing at the CDN its
assets live on, and `'none'` makes the browser ignore that element outright, so
every asset 404s and the app renders empty. It grants nothing new -- `default-src`
already admits `https:`, so every URL a `<base>` could point at was reachable by
writing it out in full.

### What the second bundle found

The grant is gated on the portal origin being non-empty, and the portal origin
was `PUBLIC_FOUNDRY_PORTAL_ORIGIN` and nothing else. **Nobody with access to this
repository can read what that variable is set to on Vercel**, and its absence is
a SUPPORTED configuration -- `frame-ancestors` is deliberately
unset-means-unrestricted, and `bundle-headers.ts` says so in its own comment. The
two rules composed badly. If that variable had never been set, the entire first
bundle would have been inert on production: the flag withheld, every published
app still losing its saved state, and the only symptom a feature that looked
like a fix that did not work. Nothing anywhere would have reported it.

`foundryPortalOrigin(appsOrigin, portalVariable)` is the fix, and it is one
implementation with two callers:

1. `PUBLIC_FOUNDRY_PORTAL_ORIGIN` when it is set. An operator who names an
   origin means it, and a preview on its own portal host has to be able to say
   so.
2. Otherwise `FOUNDRY_PLATFORM_ORIGIN` from `preflight.ts` --
   `https://ideabosco.com` -- but **only when `PUBLIC_FOUNDRY_APPS_ORIGIN` is
   itself set**.
3. Otherwise empty, which is the strict set and no `frame-ancestors`.

**Why the apps origin gates the fallback is the only subtle part, and it is the
fail-closed argument again.** A configured apps origin is what makes a deployment
split-origin: bundles answer on their own host, the serving routes 404 a bundle
path arriving anywhere else, and the portal is by construction somewhere else --
so guessing the canonical portal host is safe there, because the guess cannot be
the bundle host. With the apps origin UNSET the routes answer on ANY host, which
is dev and preview, where the portal and the bundle genuinely do share one
origin. There the old comment's escape is real. So the fallback is withheld
exactly where applying it would MANUFACTURE the vulnerability.

The constant is imported rather than retyped: `preflight.ts` hardcodes
`https://ideabosco.com` for the same reason the OG tags and the sitemap do, and a
second literal is the one that stops matching when the domain moves. Verified
before building that the import creates no cycle (`bundle-headers` -> `preflight`
-> `bundle-path` + `storage-shim`, both of which import nothing) and drags no
browser-only code into the server bundle: `preflight.ts` has no `$app/*` or
`$env/*` import, no top-level DOM access, and only pure declarations at module
scope. It was already imported server-side by `/a/`, `/b/`, `foundry-bundle.ts`
and `/foundry/starter`, so no new bundling category was created.

### The configuration became visible

Which flags a bundle actually gets is a function of two Vercel variables that
nobody here can read, which made drift on the pair invisible. `AppFrame.svelte`
now renders one line, **for an admin only**, stating the resolved apps origin,
the resolved portal origin, whether the fallback produced it, and whether
`allow-same-origin` is granted.

It states values, never a verdict: every one of those configurations is
legitimate somewhere, the strict set is CORRECT in dev and on a preview, and a
line that judged would cry wolf on every local run. `granted` is read off the
flags actually in force -- the same string the `sandbox` attribute carries -- so
it cannot report a grant the frame beside it did not get, which is the one way a
diagnostic like this becomes worse than nothing. The element is not rendered at
all for a student, rather than hidden.

`AppFrame` was the only Foundry surface component in this bundle's scope. The
review console or the shell would be a defensible home too, and the line being
in the frame has a real cost: `AppStage` frames nothing until something is
launched, so an admin sees it only after pressing Run. That is not a bad place --
running the build is what a reviewer came to do, and the line then describes the
very frame beside it -- but a shell-level copy was not considered and rejected,
it was simply out of scope.

### What was measured

- **`svelte-check`: 0 errors, 37 warnings, before and after** (31
  `state_referenced_locally`, 5 `css_unused_selector`, 1 `perf_avoid_nested_class`).
  The count matches `CLAUDE.md`'s baseline and neither the total nor the mix
  moved. Note that a checkout with no `.env` at all reports **11 phantom errors**,
  all `Module '"$env/static/public"' has no exported member` -- the ambient types
  are generated from the env file, so `svelte-kit sync` after writing one is
  required before the baseline means anything.
- **Full suite: 116 files, 2651 tests, all passing** (2640 before; +11).
- **Three mutation proofs, each in the permissive direction**, with every file
  restored byte-identically (md5-checked) and re-verified green. Counts are over
  the four Foundry files that assert the pair
  (`foundry-bundle-url`, `foundry-gallery`, `foundry-serve-route`,
  `foundry-app-route`; 128 tests green):
  - fallback applied unconditionally (`return FOUNDRY_PLATFORM_ORIGIN`, ignoring
    the apps origin) reddened **9**, including `withholds the fallback entirely
    when the apps origin is unset` and `leaves a same-origin dev deployment on
    the strict set` -- the dev/preview direction.
  - fallback removed entirely (`return ''`, the pre-bundle behaviour) reddened
    **9**, including `grants allow-same-origin when the apps origin is set and
    the portal variable is not` -- the production direction.
  - the admin gate opened (`$derived(true)`) reddened **1**, `renders nothing at
    all for a student or a visitor`.
- **Five existing assertions were GENERALIZED, not deleted**, because a
  legitimate change broke them: three in `foundry-gallery` (its `frameWith`
  helper set only the portal variable, so it described one arrangement while
  claiming to test another; it controls both now), one in `foundry-serve-route`
  and one in `foundry-app-route`. All five encoded "portal variable unset means
  the strict set", which was true of a route that READ the variable and is wrong
  for one that resolves a pair. Each keeps both directions -- what moved is that
  the no-grant case is now keyed on the APPS origin being unset, which is the
  configuration where nothing resolves.
- **The exact strings produced**, from the real module:

  | Configuration | Resolved portal | Fallback | `allow-same-origin` |
  | --- | --- | --- | --- |
  | apps set, portal variable unset | `https://ideabosco.com` | yes | granted |
  | apps set, portal variable set | `https://ideabosco.com` | no | granted |
  | apps unset (dev / preview) | *(empty)* | no | withheld |

  The first two produce a byte-identical sandbox directive and CSP; the third
  drops `allow-same-origin` from the sandbox and omits `frame-ancestors`
  entirely.

### Three CLAUDE.md rules were corrected in place

They contradicted the merged code and would have had a future session revert it:
the blanket "`allow-same-origin` must never appear on a Foundry frame", the
claim that the pair cancels the sandbox unconditionally, and the claim that
`<base href>` cannot work because of `base-uri 'none'`. Each now carries its
condition and the reason attached. The shared-storage consequence was added as
its own rule, because it is a property of the platform a future task has to know
before describing bundle storage as isolated. `/a/`'s own route comment carried
the same stale `base-uri` claim and was corrected; its path-shape argument was
left standing, restated on the byte rule (ingest, the source viewer and both
serving routes all serve a stored byte back unchanged) which never depended on
the CSP.

### What was NOT verified

- **Nothing was run against the live Supabase project or a real deployment.**
  The local `.env` is the placeholder (`example-ref`); this container had no
  `.env` at all until one was written from `.env.example` to reach the
  `svelte-check` baseline, and it is gitignored and uncommitted.
- **The production values of `PUBLIC_FOUNDRY_APPS_ORIGIN` and
  `PUBLIC_FOUNDRY_PORTAL_ORIGIN` are still unknown**, which is the whole premise
  of this bundle. What changed is that the resolution no longer depends on the
  answer and the answer is now readable off the admin line.
- **No browser pass.** Every string above is from the real module under vitest,
  not from a served response. Specifically NOT observed in a browser: that
  `localStorage` actually persists across a reload in a granted configuration,
  that a `<base href>` in a real bundle now resolves, and that the admin line
  renders legibly at 1440px and 375px.
- **The escape itself was not attempted.** That a same-origin child with both
  flags can strip its parent's sandbox attribute is taken from the specification
  and from the original comment, not measured here.
- **No screenshots.**

### Deferred

- **A shell-level or review-console copy of the configuration line.** The frame
  is not the only reasonable home and it only appears once a build is running.
  Out of this bundle's file scope.
- **Per-app storage isolation.** A subdomain per app is the only mechanism, and
  it is a routing, DNS and certificate change rather than a code one.

---

