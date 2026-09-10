---
title: "Prompt 0126: the HTML-assignment boundary -- an opaque-origin frame, a bridge that trusts nothing the document says about itself, and the measurement that `event.origin` is `\"null\"` (`claude/html-assignment-manifest-contract-tpr7eg`, no migration)"
date: 2026-09-10
branches: [claude/html-assignment-manifest-contract-tpr7eg]
migrations: []
subsystems: ["Classroom", "HTML assignments", "Browser harness", "Security boundary"]
---

One of four lanes building the ported-HTML-assignment subsystem against a
single normative contract. This lane owns the BOUNDARY and nothing else: no
database, no import UI, no grading. A hardcoded document string is the fixture.

The branch name says "manifest", which is lane 0127's subject. It is the name
the harness minted for this session; the ledger id, the owned surface and every
file written here are 0126's, and nothing in this branch touches a manifest
module.

## The opening

`git fetch --unshallow origin` -- the clone WAS shallow, `is-shallow-repository`
answered true before and false after. `git fetch origin integration` clean.
Identity `Claude <noreply@anthropic.com>` already set. Branched from
`origin/integration` at `fd8e136e`.

**The duplicate check found nothing**: no `docs/prompt-ledger/entries/0126-*` on
`origin/main`, on `origin/integration`, or on any of the 37 standing `claude/**`
branches, swept with `git ls-tree` per ref rather than by reading the mounted
directory, and no branch carrying a 0126 ledger commit and nothing else.

## What was built

- `src/routes/hx/[docId]/+server.ts` -- the serving route, with
  `src/routes/hx/_headers.ts` (the CSP, the header set, the host gate) and
  `src/routes/hx/_documents.ts` (two hardcoded documents).
- `src/lib/classroom/html-assignment/bridge.ts` -- the protocol types and the
  pure message handling, with no DOM in it.
- `src/lib/classroom/html-assignment/HtmlAssignmentFrame.svelte` -- the
  sandboxed frame, the listener, and the parent side of every message.
- `src/routes/dev/html-assignment/` -- the harness, which mounts the real frame
  against the real route and is attacked by a hostile document.
- `tests/html-assignment-bridge.test.ts` -- 48 tests.
- `tools/browser-verify/routes/html-assignment.mjs` -- 36 measurements per full
  pass, at 375px and 1440px.

## THE FINDING THAT SHAPED THE LANE: `event.origin` IS `"null"`

The contract says the parent "validates `event.origin` against the document
origin on every message and drops anything else". Implemented as a literal
comparison against `https://sandbox.ideabosco.com`, **that rule drops every real
message and the feature is inert** -- and it fails silently, as an empty
worksheet.

The reason is that the sandbox the contract mandates is exactly what makes the
document's origin OPAQUE, and `postMessage` serializes an opaque origin to the
string `"null"`. Measured in the container's Chromium (141.0.7390.37) against a
real served document before any of this was designed:

| sandbox | `event.origin` at the parent | `window.origin` in the frame |
| --- | --- | --- |
| `allow-scripts` | `"null"` | `null` |
| `allow-scripts allow-same-origin` | `http://127.0.0.1:33855` | `http://127.0.0.1:33855` |

So `hxExpectedOrigin(documentOrigin, sandboxFlags)` DERIVES the expectation from
the sandbox rather than hardcoding either answer. Under the flags this feature
ships it returns `"null"`; hand it a sandbox that grants `allow-same-origin` and
it returns the concrete origin. That keeps the check a real check in both
directions, and it means anyone who weakens the sandbox has the origin rule move
with them rather than silently apart from them.

**`"null"` is not by itself an identity**, which is why the SOURCE check is
load-bearing and not decoration: every opaque-origin document in the world
serializes to that same string. `hxReceive` also requires `event.source` to be
the frame's own `contentWindow`, which no other window can forge. In production
the two refusals are independent (two hosts); in development they are not, and
the source check is the one doing the work -- stated on the harness page in
words, because it is the one way the local measurement is weaker than the real
deployment.

## The negative controls, and the mutation proof

The point of the lane. A hostile document served by the real route, inside the
real frame, attacking the real boundary. Every probe reports through the
ORDINARY bridge -- an `idea:change` on a field the manifest declares -- so a
result arriving at all is itself evidence the bridge works.

The harness writes `hx-parent-sentinel = 'PARENT-SECRET'` into the PORTAL
ORIGIN's `localStorage` before the frame is mounted, so a leak does not read
"storage was available in there", it reads `REACHED: read PARENT-SECRET`.

**Baseline, measured:**

```
hx-probe.parent   REFUSED: SecurityError      window.parent.document.title
hx-probe.cookie   REFUSED: SecurityError      document.cookie
hx-probe.storage  REFUSED: SecurityError      localStorage.getItem('hx-parent-sentinel')
hx-probe.topnav   REFUSED: SecurityError      window.top.location.href = 'https://example.com/'
hx-probe.fetch    REFUSED: TypeError          fetch('/hx-exfiltration-target', {method:'POST'})
hx-probe.origin   OPAQUE: origin is null
hx-probe.csp      ENFORCED: connect-src
verdict           5 refused, 0 reached
```

**Weakened, in a scratch copy, restored from an in-memory copy and md5-checked
(never `git checkout --`, which restores from HEAD and would have discarded this
session's whole uncommitted tree):**

| mutant | what moved |
| --- | --- |
| `allow-same-origin` added to the sandbox flags | `parent` -> `REACHED: HTML assignment boundary harness`; `cookie` -> `REACHED: cookie=`; `storage` -> `REACHED: read PARENT-SECRET`; `origin` -> `NAMED: http://127.0.0.1:5199`; verdict 0 reached -> **3 reached** |
| `connect-src 'none'` -> `connect-src *` | `csp` -> `NOT ENFORCED: no violation fired`; `fetch` **unchanged** |
| the field-to-block map bypassed | drop reasons lose both `field` entries; a forged write `hx-probe.parent=forged by id-as-field` appears |

Run through the browser-verify route itself, the sandbox mutant puts **4 of 18
measurements outside threshold at 1440px**, and the failures say so in words:

```
>>> text-contains [the verdict says nothing escaped ...] missing ["Nothing escaped"];
    forbidden ["THE BOUNDARY LEAKED"] -- "2 probe(s) refused, 3 reached out of the frame. THE BOUNDARY LEAKED."
>>> text-contains [the sandbox attribute on screen] forbidden ["allow-same-origin"]
>>> order-result [the five escape attempts ...] ... "reached=3"  (threshold ... "reached=0")
>>> order-result [the document announced itself ...] "sandbox=allow-scripts allow-same-origin",
    "expectedOrigin=http://127.0.0.1:5199"
```

Restored: `bridge.ts` md5 `e29dda6fb4349a1f703628299366df00`, identical, and the
route back to **36 measurements, 0 outside threshold**.

### The fetch probe cannot see its own directive, and says so

**Opening `connect-src` did not move the fetch outcome at all.** The request is
refused twice over: by the CSP, and independently by the opaque origin, which
makes every request cross-origin so a response with no CORS header is unreadable
either way. An outcome that cannot move is not a control for that directive, and
reporting it as one would have claimed coverage of `connect-src` that nothing
had.

So a second probe was added that IS sensitive to the lever: the document listens
for its own `securitypolicyviolation` events and reports which
`effectiveDirective` fired. `ENFORCED: connect-src` at baseline,
`NOT ENFORCED: no violation fired` under the mutant. The two levers are now
separately observable, which is the property that matters -- a passing fetch row
is not evidence about the sandbox, and a passing containment row is not evidence
about the CSP.

### The origin probe was reporting containment under the word for its opposite

`probeOrigin` originally went through the same `REACHED`/`REFUSED` helper as the
four real escape attempts, so the row read **`REACHED: origin=null`** -- the
single strongest piece of evidence that the sandbox held, counted as a leak. It
reports `OPAQUE` now and is not counted.

### Top navigation takes two answers because browsers give two

Chrome THROWS `SecurityError` here, measured, so the ordinary refusal path
covers it. Chrome ALSO logs "Unsafe attempt to initiate navigation", which is
what a browser prints when it blocks a navigation WITHOUT raising -- and an
engine taking only that path would return normally and be indistinguishable from
success to the document. The `ATTEMPTED` branch and a parent-side check (the
harness asserts it is still on its own URL) cover that case. An earlier draft
predicted the no-throw behaviour and wrote it up as measured; it was not, and the
comment now says what was actually observed.

## Two defects in the frame, found by driving it

**THE DOCUMENT RAN BEFORE ANYTHING WAS LISTENING.** The `<iframe>` and its `src`
are in the server-rendered HTML, so the browser begins fetching the document as
it parses that tag -- long before the client bundle has loaded, let alone
hydrated and attached a `message` listener. Measured on the real harness:
**0 of 7 messages arrived**, `readySchema` null, reported height 0, with the
frame plainly loaded and running (its own CSP refusals were in the console). It
fails silently and it fails as an empty worksheet: a student whose answers never
save and whose seeded state never appears.

It cannot be fixed from the document side -- the contract has the frame announce
itself ONCE, with `idea:ready`, so a missed `ready` is missed for the life of the
page -- and no listener can be attached before the JavaScript that would attach
it has been fetched. So the order is made STRUCTURAL: `listening` is false until
the listener is attached, and the frame element does not exist until then. There
is no window in which a document can speak to nobody, rather than a window that
is usually short enough. The cost, stated: with JavaScript off there is no frame
at all, which is the honest outcome either way for a scripted bridge.

**A BACKTICK IN A COMMENT ENDED THE DOCUMENT.** The fixtures ARE template
literals, so one backtick inside ends the literal and the parse error lands
hundreds of lines later in whatever follows. A comment cost exactly that, and
`tests/html-assignment-bridge.test.ts` now asserts no served document contains
one.

Two more, found only because the drive captured `pageerror` rather than console
errors alone: an unguarded `getElementById(...).textContent` in the shared
bridge client threw on every state message inside the probe document (which has
no such element), and a `{#each}` keyed on block id threw `each_key_duplicate`
when the synthetic positive control wrote a probe field twice -- which in Svelte
5 takes the WHOLE PAGE down, so the harness reported nothing rather than
reporting a duplicate.

## The unit tests, and the two mutants that survived

48 tests, driving the real `bridge.ts`, the real `_headers.ts` and the real
route handler. Every refusal is paired with a positive control, because a gate
that has stopped listening refuses everything.

Mutation-proved in the permissive direction, restoring from an in-memory copy:

```
baseline: 48 passed
REDDENS  A: the origin check never refuses                    2 failed
REDDENS  B: the source check never refuses                    1 failed
REDDENS  C: a null frame window is treated as a pass          1 failed
REDDENS  D: the expected origin is always the document origin 18 failed
REDDENS  E: the field map is a bare lookup                    1 failed
REDDENS  F: an unresolved field falls through to the field    5 failed
REDDENS  G: the height ceiling is removed                     1 failed
REDDENS  H: connect-src is opened in the served policy        2 failed
REDDENS  I: frame-ancestors falls back to the request host    2 failed
REDDENS  J: BOTH layers of the field guard opened             2 failed
after restore: 48 passed
```

**C and E survived the first run, and both were real coverage gaps.**

C -- the explicit null-frame-window guard. Every other refusal still held
(`source !== frameWindow` catches a real window against a null frame), so the
mutant passed 46 of 46 and the guard looked redundant. It is not: a message with
NO source, arriving before the frame is mounted, makes the comparison
`null !== null`, which is FALSE, and the message is accepted. That is precisely
the window in which a page can be handed a forged event and nothing real is
speaking yet. A test for that pair now exists.

E -- `Object.hasOwn` on the field map. Behind it sits
`typeof blockId === 'string'`, and for the ordinary prototype keys
(`constructor`, `toString`, `__proto__`) the type check alone is enough: they
resolve to functions and objects. The case that needs the guard is a map built
with `Object.create(defaults)`, which carries STRING-VALUED inherited keys that
sail past the type check -- an ordinary way to build a lookup with defaults, so a
shape a future caller can genuinely hand in. CLAUDE.md's rule is exactly this:
do not remove a redundant check because a test did not notice; open BOTH and
confirm only the pair reddens. Mutant J is that pair, and it reddens.

## Contract deviations: none taken locally, three reported

1. **`event.origin` is `"null"`.** Above. Not a change to the contract's intent
   -- the contract mandates the sandbox that makes it so -- but a literal
   reading of its wording is unimplementable, and the next reader is likely to
   "fix" the derived form back into a hardcoded origin. Two tests exist to stop
   that.

2. **The CSP carries no `sandbox` directive.** The contract states the policy
   exactly and does not include one, so a DIRECT navigation to a `/hx/` URL gets
   the real sandbox origin rather than an opaque one, where a FRAMED document
   gets an opaque origin from the iframe attribute. Foundry closes the same gap
   with a CSP `sandbox` directive on its bundle responses and CLAUDE.md records
   why. **Not added here**, because the CSP is normative and three other lanes
   are building against those words. What holds without it: the document is on a
   host that carries no session cookie of the portal's, `connect-src 'none'`
   refuses every outbound request, `form-action 'none'` refuses every
   submission, and there is nothing on that origin worth reaching. Reported for
   the contract owner to decide.

3. **`frame-ancestors` is resolved rather than written out.** Pinned to
   `https://ideabosco.com` and nothing else, the directive also refuses a dev
   server and a Vercel preview -- so the frame, the bridge and every containment
   control in this lane would be unverifiable anywhere but production, on the
   one feature whose entire deliverable is a measured security boundary.
   `hxPortalOrigin` is `foundryPortalOrigin`'s shape for the same directive on
   the bundle routes: an explicitly named portal origin wins; otherwise
   `https://ideabosco.com` when `PUBLIC_HX_SANDBOX_ORIGIN` is set (which is what
   makes a deployment split-origin, i.e. production); otherwise the origin the
   request arrived on (one host answering both roles, i.e. dev and preview).
   **Production with nothing configured produces the contract's literal byte for
   byte**, and a test asserts the whole policy string against it.

## The deployment work nobody in a session can do

`sandbox.ideabosco.com` does not exist yet. Two steps, neither reachable from
here:

1. **Add `sandbox.ideabosco.com` as a domain on the Vercel project** (the same
   project, a second domain, exactly as `apps.ideabosco.com` already is for
   Foundry bundles) and create the DNS record it asks for.
2. **Set `PUBLIC_HX_SANDBOX_ORIGIN=https://sandbox.ideabosco.com` in the Vercel
   project env** and redeploy.

Until both are done the route answers on ANY host, which is correct for dev and
preview and is NOT correct for production: `/hx/<docId>` would answer on
`ideabosco.com`, which is where the session cookies are, and serving an uploaded
document there hands it the credentials the second origin exists to withhold.
`vercel.json` needs no change -- its only rule is the `idea-app-sage.vercel.app`
redirect, which is host-matched and does not touch this.

Note also that a Vercel PREVIEW deployment answers on one host for both roles,
so `PUBLIC_HX_SANDBOX_ORIGIN` must be left UNSET there. Setting it to the
preview's own URL would make `frame-ancestors` name `https://ideabosco.com` on a
host that is not it, and every frame on the preview would blank.

## Verification

- **`svelte-check`: 0 errors, 37 warnings, 31 `state_referenced_locally` / 5
  `css_unused_selector` / 1 `perf_avoid_nested_class`.** Re-derived with
  `npx svelte-kit sync && npx svelte-check` and the two public Supabase values
  exported first. It went to **38** mid-lane: `let height = $state(minHeight)`
  earns `state_referenced_locally`, which is the compiler correctly saying the
  prop is read once at construction and a later change to the floor would be
  ignored. Fixed by deriving rather than by suppressing.
- **`tests/html-assignment-bridge.test.ts`: 48 passed**, mutation-proved above.
- **`npm run verify:browser -- --route html-assignment`: 36 measurements, 0
  outside threshold**, at 375px and 1440px, in Chromium 141.0.7390.37. 0px
  horizontal overflow at both. Containment verdict at 14.66:1, probe lines at
  14.22:1, the one control 320.5x44 (min dim 44px). Console: 0 errors, 4 ignored
  by pattern -- the frame's own CSP and navigation refusals, which are the
  boundary working and are asserted positively by the rows above.
- **Two harness limits belong in any report quoting those numbers**: the harness
  blocks every non-loopback request (`fonts.googleapis.com` was blocked on both
  runs), so text is measured in the FALLBACK stack; and
  `prefers-reduced-motion` is `no-preference`, so that path is not exercised.

### NOT verified

- **Nothing on a real `sandbox.ideabosco.com`.** The host does not exist. Every
  containment measurement here is one host answering both roles, which is
  strictly the HARDER case for the sandbox (with one origin, weakening it
  genuinely does hand the frame the parent's DOM -- that is what the mutation
  showed) and strictly the WEAKER case for the origin check, which is why the
  source check exists and why the harness says so on screen.
- **No production or preview deployment was opened.** No Supabase project was
  reached; this lane touches no database.
- **`prefers-reduced-motion: reduce` was not exercised** on the harness page.
  Nothing here animates.

### THE ONE THING THIS LANE BREAKS AND CANNOT FIX: `/hx` MUST BE A RESERVED SLUG

**`tests/short-link-reserved-names.test.ts` goes red on this branch, with two
failures, and it is right to.** This lane adds a top-level route directory
`src/routes/hx/`, and `hx` is SLUG-SHAPED. SvelteKit resolves a real
single-segment route ahead of the `[shortlink]` catch-all, so a short link
created at `ideabosco.com/hx` would never be reached -- and that test exists
precisely so a route added later reddens the suite instead of drifting silently
the way the list did for a year. `/a` and `/b`, Foundry's two bundle mounts, are
in `RESERVED_SLUGS` for exactly this reason.

**The fix is three parts and this lane may make none of them:**

1. `hx` added to `RESERVED_SLUGS` in `src/lib/short-links.ts` -- a file outside
   this lane's owned surface.
2. A new migration redefining `public._app_short_link_reserved` to name the
   identical set (the pattern of `0156` and `0166`, the latter of which added
   `maps` for the same reason). **This lane is `Migration permitted: no`, and
   the repo's own rule is that migration work happens on `main`, never on a
   branch, because there is one production database and a migration is global
   whichever branch its file sits on.**
3. `CHAIN` in `tests/short-link-reserved-names.test.ts` extended with that
   migration, because the SQL-to-TypeScript check reads the LAST definition to
   apply.

**Doing part 1 alone was considered and refused.** It would trade the two
current failures for two different ones -- the SQL-to-TypeScript check asserts
exact set equality against the deployed function -- and it would leave the
client and the database disagreeing about the reserved set, which is the thing
`src/lib/short-links.ts`'s own comment ("change both together") exists to
prevent. Two failures that say "the migration has not been written" are more
honest than two that say "the code and the database now disagree".

**The other five failures in a full run are NOT this lane's.**
`tests/derived-numbers.test.ts` was already red on `origin/integration` before
any of this work -- verified by stashing the whole branch and re-running: 5
failures over **11** unmeasured route specs, which this lane makes 12. See "Left
undone" below.

A third file, `tests/notebook-guidance-propagates.test.ts`, produced an
unhandled `57P01 terminating connection due to administrator command` on the
first full run -- the shared embedded Postgres cluster shutting down under an
open connection -- and did not recur on either of the two runs after it. It
passes in isolation. It touches nothing this lane wrote.

Full-suite figures on this branch: **356 files, 7050 tests, 7043 passed, 7
failed** -- 5 pre-existing, 2 introduced here and diagnosed above.

### Left undone, deliberately

- **The measured half of `tools/browser-verify/README.md` was NOT regenerated.**
  The STATIC half was (`npm run verify:counts`, 5 lines: 175 -> 176 specs,
  70 -> 71 routes, 350 -> 352 runs), which is that tool's own freshness rule for
  adding a route spec. The measured half needs a full ~14-minute pass (the
  committed block records `totalMs: 840487`) and rewrites a single 4KB line
  listing every spec. Three things argue against doing it here: it was **already
  red on `origin/integration` before this lane** -- `tests/derived-numbers.test.ts`
  reported 5 failures over **11** unmeasured specs, verified by stashing this
  work and re-running, and this lane makes it 12; regenerating it on four
  concurrent lanes is precisely the documented five-branch merge failure that
  cost bundle 0017, since every lane writes different numbers into the same
  line; and a tree-wide regeneration riding inside a lane diff is the thing the
  lockfile rule exists to prevent. **The fix is one `npm run verify:readme` by
  whichever bundle lands last**, and it fixes the pre-existing 11 at the same
  time.
- **`.env.example` and `CLAUDE.md` were not edited.** Both are shared files
  outside this lane's owned surface, with three lanes working the same subsystem
  concurrently. What they owe is in the ledger entry: a stanza for
  `PUBLIC_HX_SANDBOX_ORIGIN` and `PUBLIC_HX_PORTAL_ORIGIN`, and the origin-split
  rule for HTML assignments beside Foundry's.

## For the lanes beside this one

- `bridge.ts` exports `HX_SANDBOX_FLAGS`, `HX_SCHEMA_VERSION`,
  `HX_MAX_HEIGHT_PX`, `hxReceive`, `hxExpectedOrigin`, `hxStateMessage`,
  `hxSavedMessage` and `hxPostTarget`. Nothing in it imports from another lane.
- `HtmlAssignmentFrame` takes `fieldToBlockId` as a PROP. It is the parent's map,
  built from the manifest the parent stored at import -- 0127's job to produce
  it, and the frame deliberately cannot derive one.
- **The field names and the block ids in the fixtures are deliberately DIFFERENT
  strings** (`reflection` -> `mod-1.b.reflection`). If they were ever spelled the
  same, every test of the mapping would pass whether or not the mapping ran: the
  identity function is unobservable. A test sweeps every fixture for it.
- `src/routes/hx/_documents.ts` is the seam the import path replaces. The route
  asks for bytes by `docId` and does not care where they came from.
