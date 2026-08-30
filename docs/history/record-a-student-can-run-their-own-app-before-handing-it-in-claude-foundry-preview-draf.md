---
title: "A student can run their own app before handing it in (`claude/foundry-preview-drafts-60xko9`, code only, no migration)"
date: 2026-08-27
branches: [claude/foundry-preview-drafts-60xko9]
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 158
---

### The problem

`serveBundleFile` serves a version when it is the app's `published_version_id`
or its status is `submitted`, and nothing else. A DRAFT was therefore unreachable
by anybody -- including the student who had just uploaded it. The first time
anyone on earth found out whether a Foundry app actually ran was when a reviewer
opened it, which spends a review cycle on a build the author could have fixed in
a minute and teaches a student that the platform is somewhere you post work into
rather than somewhere you work.

### Why it could not be a widening of either published gate

Both published mounts (`/b/` and `/a/`) answer on the APPS ORIGIN, which
deliberately holds no session: the portal's cookies are host-only on the main
host, and that absence is the entire point of the split. So the apps origin has
no way to ask whether the person requesting a bundle is its author -- the only
question available to it is the version's own status, which is exactly why both
gates are written that way. On that host the only audience a widening can
express is EVERYONE, so admitting `draft` there would admit every draft in the
table to the open internet.

"Is this viewer the author" can only be asked where the session cookie is. So
preview answers on the PORTAL origin, at `/foundry/preview/<app>/<version>/`,
and resolves the viewer from `locals.claims` plus `is_admin()`.

### The containment, which is the part that had to be explicit

Serving student HTML on the cookie-carrying host is the thing the apps origin
exists to prevent, so this route does not inherit its isolation from any
environment variable. `foundryPreviewResponse` hands `foundryBundleHeaders` the
SAME VARIABLE TWICE as bundle origin and portal origin.

`foundrySandboxFlags` appends `allow-same-origin` only when both origins are
non-empty AND they DIFFER. Passing one variable twice makes them the same string
by construction, so the comparison cannot come out any way but equal and the
strict set is a property of the CALL SITE rather than of a deployment's
configuration. The document therefore lands in an opaque origin, where
`document.cookie` throws -- which matters here more than anywhere else, because
`@supabase/ssr` sets the portal's session tokens with `httpOnly: false` and they
are readable by `document.cookie` on that host.

The prompt asked whether `foundrySandboxFlags` already produced the strict set
for two equal origins, and whether that was enough to rely on. It does, and it
is -- but only because the two arguments are literally the same variable rather
than two values that happen to agree. That distinction is what the test sweep
below turns from an argument into a measurement.

Passing the request origin rather than two empty strings buys one thing and
costs nothing: two empty origins also produce the strict set but emit no
`frame-ancestors` at all, so any site anywhere could embed a preview. Passing
the portal origin twice pins `frame-ancestors` to the portal. It grants nothing
on the source lists, because `default-src` already admits `https:` and that
already covers the portal origin whether or not it is named.

### The gate, and the one clause that is a judgement

`previewViewerMayRun` is a pure predicate over the rows, separated from the IO so
its refusals can be asserted directly rather than through a Supabase client:

| Case | Answer |
| --- | --- |
| any status, including `draft` and `rejected` | the point of the feature |
| app row missing (deleted, 0136) | refused |
| version's `app_id` is not the app in the URL | refused |
| viewer null, or viewer id empty | refused |
| neither author nor admin | refused |
| **hidden app, viewer is the OWNER** | **refused** |
| **hidden app, viewer is an ADMIN** | **permitted** |

The hidden split is the one clause that is a JUDGEMENT rather than a consequence,
and it goes beyond what the prompt enumerated (it listed status, deletion and
viewer, and was silent on hiding). Hiding is admin-only and NARROWS what the
owner may do to an app: 0130 refuses their edit of a hidden one and 0136 refuses
their delete of one, both because a shelved app is under discussion with staff. A
new owner capability that ignored the flag would cut against an established rule,
so the owner is refused and reads the notice that pane already carries. An admin
is permitted for the reason the review load asks for hidden apps at all -- a
decision about a shelved app that cannot run the shelved app is made blind. If
that ever has to change it is one line in one predicate.

### `serveBundleFile` was not reused and not loosened

`previewBundleFile` is a second reader in the same module, with a header stating
exactly what it permits that the other does not. One function with a flag would
have put a single boolean between every draft in the table and the open internet.
What IS shared is everything downstream: `bundleBytesResponse` was extracted from
`foundryFileResponse` and now builds the headers, injects the storage shim and
sets the content length for all three mounts. That extraction is what makes
"preview is the published response minus one sandbox flag" a fact rather than a
claim -- it is asserted directive by directive.

The shim matters MORE here than on the published mounts: preview never gets
`allow-same-origin`, so it is always on an opaque origin, where the
`localStorage` getter throws.

### The control, and what it does not prove

Every version on `/foundry/mine` gets a "Run a preview" link opening in a new
tab, gated by `foundryPreviewable` -- a pure predicate mirroring the two clauses
of the gate the owner's surface can see (an upload that never unpacked has no
entry document; a shelved app is refused to its owner). That is the same
arrangement `versionIsDeletable` has with `foundry_delete_version`: the boundary
is the server's, and this exists so no control is offered whose only possible
answer is a refusal. It deliberately does not ask the STATUS, which is the whole
point and also the shape a regression would take -- every other control in that
row is status-gated.

One sentence sits under the version list, once:

> A preview runs your app exactly as it will run published, with one difference:
> saved data does not survive a reload in a preview, and it does once the app is
> live. Anything that works in a preview works published.

The difference only ever runs in the safe direction, which is the half that
actually helps a student decide whether they have found a bug.

### What was measured

- **`svelte-check`: 0 errors, 37 warnings before and after**, same breakdown (31
  `state_referenced_locally`, 5 `css_unused_selector`, 1
  `perf_avoid_nested_class`). The container had no `.env` at all -- it is
  gitignored, so a fresh clone has none -- and without one `$env/static/public`
  declares no members and `svelte-check` reports **11 phantom errors** in files
  nobody touched. Writing `.env` from `.env.example` reproduces the documented
  baseline exactly. Worth knowing: that figure is an artefact of the environment,
  not a finding.
- **Tests: 120 files / 2733 tests before, 122 / 2797 after.** All passing. The 64
  added are `foundry-preview-route.test.ts` (50) and
  `foundry-preview-control.test.ts` (14).
- **Mutation proof, the author check.** `previewViewerMayRun`'s last clause
  opened to `return true` (the permissive direction) reddened **6**: `refuses a
  second student the author's draft`, `refuses a second student every asset of
  it`, `is indistinguishable from a version that does not exist`, `reaches
  another student's unpublished build`, `refuses another student`, `refuses a
  null owner`. Restored md5-identical (`16c0eddd…`).
- **Mutation proof, the sandbox -- and the FIRST ATTEMPT WAS TOO WEAK, WHICH IS
  THE USEFUL PART.** `foundryPreviewResponse` mutated to resolve a portal origin
  the way `foundryFileResponse` does reddened only **1 of 5** rows. The sweep
  varied the ENVIRONMENT but always requested on the canonical portal host --
  where the resolved portal origin and the request origin are the same string, so
  the two spellings coincide and the mutation is invisible. The single row that
  caught it did so by accident.

  Where they genuinely diverge is **a portal host that is not the canonical one,
  which is a Vercel preview deployment**: `PUBLIC_FOUNDRY_PORTAL_ORIGIN` is
  deliberately allowed to be unset, the fallback then names `ideabosco.com`, and
  the request arrives on `idea-app-git-….vercel.app`. There the mutation grants
  `allow-same-origin` **on a host that is carrying that deployment's session
  cookies**. The sweep now varies the request origin too and the same mutation
  reddens **4 of 7**, including both preview-deployment rows. Restored
  md5-identical (`a39fd3f8…`).
- **The published mounts are unchanged**, asserted rather than assumed: `/b/`
  still refuses a version that is neither published nor submitted, still refuses
  a hidden app, still refuses another app's file, and both mounts still serve the
  published version with no session in scope at all.
- **Indistinguishability** is compared field for field -- status, every header,
  and the body -- between a draft a viewer may not see and a version that does
  not exist, so the URL cannot be used to ask whether a given student has work in
  progress.

### `FoundryMine`'s detail pane cannot be server-rendered, and that shaped the tests

Measured: `render(FoundryMine, { props: { selected, … } })` produces the list
pane and an **empty** detail pane -- 916 bytes, `cr-detail` with nothing inside
-- because the open app is `let app = $state(null)` filled by an `$effect`, and
effects do not run under `svelte/server`. Every version row, every control on it
and every sentence under it is absent from that markup.

A test asserting over that render would pass or fail for reasons unrelated to
what it claims. Reshaping the component so a test could see it would be the
harness dictating the code, and would touch the local-refresh path (`app = fresh`
after a write) for a test's convenience. So the OFFERING RULE was extracted into
`foundryPreviewable` and asserted directly, and the three things left in markup
(the predicate call, `target="_blank"`/`rel="noopener"`/`Run a preview`/`tap-44`,
and the sentence) are asserted as presence checks over the component's own
SOURCE, each with a positive control and each labelled as exactly that. That is a
file people edit in commits, not a directory the app writes -- the thing
`tests/spec-instructions-budget.test.ts` was deleted for.

### What was NOT verified

- **No browser pass of any kind, and none was possible**: this cloud session has
  neither the `mcp__Claude_Browser__*` pane nor a connected Chrome. So the
  following are argued from the code and the specification and were NOT observed:
  that a preview document actually lands in an opaque origin, that
  `document.cookie` and `localStorage` actually throw there, that the shim
  actually rescues a generated app, that relative assets actually resolve in a
  real browser, that the new tab opens, and that the control and its sentence
  render legibly at 1440px and 375px.
- **Nothing was run against the live Supabase project.** The non-dev branch of
  `previewBundleFile` -- the three real reads against `student_app_versions`,
  `student_apps` and `student_app_files`, and the Storage download -- has never
  executed. Only the dev-fixture branch and the pure predicate have.
- **`isAdmin` was driven through a stub client** answering the `is_admin` RPC.
  The real function is exercised, but not against a real database.
- **A genuinely deleted app was never tested end to end**, because in dev a
  deleted app and an unknown one are the same absence. The route test proves the
  caller gets the standard 404; the predicate test proves the gate refuses a null
  app row, which is the half the route cannot show.
- **The preview URL was never opened in a signed-in session.** `/dev/login`
  against a local Supabase stack is the way to do that and there is no Docker or
  WSL here.

### Out of scope, found and left alone

- **`CLAUDE.md`'s Foundry environment section now undercounts this module's
  readers.** It says `src/lib/server/foundry-bundle.ts` backs "the review queue's
  source viewer, BOTH serving routes … AND the delete sweep -- four functions,
  one module, one client". There are five functions and three serving reads now.
  The file is outside this lane's scope and was not edited; the rule it states
  (one module, one client, no second reader) is unchanged and was followed.
- **`classroom-updates.json` was not touched.** The standing directive covers
  classroom-facing behaviour; this is Foundry, and the file is outside this
  lane's scope.

### Deferred

- **A dev harness route for the preview mount.** The repo's convention is a
  dev-guarded route mounting the real component, and one would be the right way
  to drive this in a browser -- but nothing in this session could open a browser,
  so it would have shipped unexercised.
- **Preview from the review console.** An admin can reach any preview URL by
  construction, but no staff surface builds one. The queue already frames the
  submitted build, which is the case it needs.

---

