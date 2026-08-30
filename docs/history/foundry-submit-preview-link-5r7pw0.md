---
title: "Foundry: the submit surface offers the preview it just made, an admin can reach a settled published app, the starter stops telling students their saves are lost, and eleven comments stop contradicting the code under them (`claude/foundry-submit-preview-link-5r7pw0`, no migration)"
date: 2026-08-30
branches: [claude/foundry-submit-preview-link-5r7pw0]
migrations: []
subsystems: ["IDEA Foundry", "Documentation", "Testing"]
---

A read-only audit of Foundry reported ten problems. Four of them turned out to
be FEATURES THAT ALREADY EXISTED AND COULD NOT BE FOUND, which is a different
defect from a missing feature and has a different fix. The rest were comments
that had gone on describing a design two or three rewrites out of date. Nothing
here is a migration and nothing here is a new gate.

## What was actually wrong, and what was not

Every audit claim below was re-derived from the tree before anything was
touched. All of them held except one count.

| Claim | Verdict |
| --- | --- |
| The submit surface never offers a preview | **CONFIRMED** |
| The starter file says saves are lost on reload | **CONFIRMED**, and the contract in the same module said the opposite |
| An admin cannot reach a settled published app's controls from the gallery | **CONFIRMED** |
| `portal-apps.ts` claims a per-launch token mint and no anonymous read | **CONFIRMED**, both clauses false |
| `transports.ts` claims a public bundles bucket and a Storage object URL frame src | **CONFIRMED**, and 0135 is a classroom migration |
| Preflight and the platform font route say bundles come off the Supabase host | **CONFIRMED**, at three sites rather than two |
| The contract page says the shell marks the Publish tab active | **CONFIRMED** |
| The launcher's cyan texture "quotes the room's molten seam" | **CONFIRMED**, the seam is amber |
| TWO grant-surface failure messages describe the anon surface wrongly | **PARTLY FALSE** -- there is ONE. Line 513's message says nothing about the composition and is correct as written |

## The preview a student could not reach

The preview mount works end to end and has done for a while: a portal-origin
route, a sandbox that cannot be granted `allow-same-origin` because
`foundryPreviewResponse` hands the header builder the same origin twice, an
author-or-admin gate, and a Run-a-preview control per version on
`/foundry/mine`. What the done panel on `/foundry/submit` rendered was a file
list, a Submit press and a link to My apps. Nothing failed. A student who
uploaded simply never saw their app at the one moment they most wanted to,
because the only way there was to leave the page, find the app and find the
version.

**THE APP ID IS STAMPED WITH THE VERSION ID, AND `createdAppId` IS NOT IT.**
That state is the NEW-APP path's resume handle -- it exists so a retry after a
partial create does not make a second app -- and it is null for the whole
add-a-version path. A preview built from it would have appeared for a first
upload and silently never for a second, which is the half-feature shape that
does not look like a bug on screen. `createdVersionAppId` is written from the
settled `appId` on the same line as `createdVersionId`, so the two cannot name
different things. The browser pass drove the ADD-A-VERSION path deliberately for
this reason and read back `/foundry/preview/app-1/version-new/`.

**`hidden_at: null` IS DERIVED, NOT ASSUMED, and it is the only clause this
surface cannot read off a row.** `foundry_create_app` has no way to make a
hidden app; and an existing app comes from `foundry_list_apps` called WITHOUT
`p_include_hidden`, which `_foundry_app_in_population` gates on `is_admin()`
inside itself -- so a hidden app is not in the list to be chosen, for an admin
uploading their own work either. Being wrong costs a link that 404s in a new
tab, never a disclosure: `previewViewerMayRun` reads the flag itself.

**THE SENTENCE MOVED INTO `surface.ts` RATHER THAN BEING TYPED TWICE**
(`FOUNDRY_PREVIEW_STORAGE_NOTE`), for `deleteAppCostLine`'s reason. Two surfaces
now offer a preview and a student reads whichever they reach first; two typed
copies of a paragraph about what storage does are two copies that can stop
agreeing about it, which is the exact failure the rest of this bundle exists to
repair. `tests/foundry-preview-control.test.ts`'s two sentence assertions were
GENERALIZED onto the constant rather than deleted, and re-mutated to confirm
they still bite.

## The starter file was telling students the opposite of the contract

The starter's storage comment read "They are IN MEMORY: nothing is written to
disk and everything is lost when the page reloads." That was true of every
bundle while every bundle ran on an opaque origin, and became FALSE the day
`foundrySandboxFlags` started granting `allow-same-origin` on the apps host. The
shim PROBES each storage and steps aside when it works, so a published app's
saves persist. `STORAGE_SECTION`, in the same file, says so emphatically and
correctly -- and the wrong one was the copy that goes home with the student.

The replacement keeps the two things that are true and load-bearing: every
published app shares one storage area, so keys must be prefixed; and there are
two places where saves do not stick, a PREVIEW (opaque origin, no storage area)
and a `file://` page. The shim is still the first thing in `<head>` and the
reason is now correct rather than merely present.

## Reaching a published app: a door, not a directory

`/foundry/review`'s lists are built from SUBMITTED versions and from HIDDEN
apps. An app that is published, not hidden and has nothing pending is on
neither -- while the route's own load will serve exactly that app the moment its
slug is in the URL. Every admin control (approve, reject, edit metadata, replace
cover, clear the metadata flag, hide, restore, delete, the file tree, download,
play stats) lives in `FoundryInspector`, which only that route mounts. So the
controls all worked and the only way in was to know the slug and type it.

**A LINK FROM THE GALLERY, NOT A THIRD LIST, and the argument is the review
console's own.** The review route already loads every app, so a published list
there is free -- and it would be a second gallery inside the surface that is
written not to be one ("deliberately NOT a second gallery with extra columns").
The gallery IS the enumeration of published apps, with the covers, the sort and
the author lines, and an admin who wants to act on one is by definition looking
at it. The queue's two lists also each mean something precise; a third list of
everything settled would be the longest of the three and the only one with
nothing to do in it, which is how the two that need reading stop being read.

**IT IS IN `FoundryGallery`'s WRAPPER AND NOT IN `FoundryDetail`.** That
component is the one render path the gallery and the review queue share and it
has no staff branch in it; that is what makes "what does a student see"
answerable by reading one file straight through. **And the component holds no
idea of who is admin**: it takes `staffHref`, a string the caller builds, and
absence removes the control -- the same arrangement every optional transport
here has, so a student's page cannot render it by getting a boolean wrong. No
gate was added; `/foundry/review` still answers 404 to a non-admin and
`is_admin()` inside the RPCs is still the boundary.

## An unrequested finding, and it is the one worth reading

Verifying item 1 needed the submit harness driven to its done panel, and the
"Zip (passes)" fixture DID NOT PASS: it still wrote the root-relative
`/_platform/fonts.css`, which the preflight refuses. Fixing the fixture to
interpolate `PLATFORM_FONTS_URL` -- so it says whatever the rule says, in the
same commit -- surfaced a defect in SHIPPED code, present identically on
`origin/main`:

> `index.html line 6 points at https://ideabosco.com/_platform/fonts.css, but
> this upload does not include a file at https:/ideabosco.com/_platform/fonts.css`

`resolveBundleReference` has no scheme awareness. Since the network stopped
being a preflight rule, `classifyReference` answers `ok` for http, https,
protocol-relative, `data:`, `mailto:`, `tel:` and `blob:` -- so every one of them
reached the missing-asset sweep, where the split-on-slash walk drops the empty
segment after the colon and produces `https:/ideabosco.com/...`, which no stored
path can match. **So the ONE URL the build contract tells students to write
earned a warning saying the upload was missing a file at a mangled path**, and
the React and Babel CDN tags the contract also endorses earned three more.

The fix is two lines returning `null` -- which already means "nothing to check
here", the exit a bare fragment takes -- and it is a NARROWING OF A WARNING that
can refuse nothing: this sweep only ever pushes into `warnings`, so no upload
that passes today can start failing. What it removes is a false sentence.
Mutation-proved three ways, including a deliberately-too-wide guard that kills
the positive control.

## What was measured

Chromium 141.0.7390.37 through the shipped `tools/browser-verify` modules
(browser/server/checks imported directly, so the instrument is the shipping one;
the route spec is printed in the session report rather than committed, since
`tools/browser-verify/routes/` is another session's write point this week).

- `/dev/foundry-submit`, done panel, both widths: preview href
  `/foundry/preview/app-1/version-new/`, `target="_blank"`, `rel="noopener"`,
  text "Run a preview". Control 8.28:1, note 7.26:1, done-panel controls
  smallest 190.7x44 (min dim 44px), 0/3 under floor. `scrollWidth === clientWidth`
  at 375 and 1440. 0 console errors.
- `/dev/foundry-gallery`, both widths: staff door present 1 as admin at 8.28:1,
  216.7x45.4 (min dim 45.4px); **present 0 as student**, with the still-open
  detail pane as the positive control. `scrollWidth === clientWidth` both widths.
- **THE ABSENCE CHECK WAS PROVEN TO BITE RATHER THAN ASSUMED TO.** The
  `expectPresent: 0` ceiling default has landed on main, but a floor that reads
  green over a present node is exactly the failure that ceiling exists for, so
  one matching node was injected into the student view and the row went
  `withinThreshold=false` at both widths.
- `svelte-check`: 0 errors, 37 warnings (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`) -- baseline, unmoved.
  Re-derived after exporting placeholder `PUBLIC_SUPABASE_*`, per the phantom-error rule.
- `npm test`: 211 files, 4404 tests, all passing.
- Mutation proofs, each restored from a copy and md5-checked identical, green
  after: SIX on the preview link (builder replaced by a hand-written path,
  control deleted, app-id stamp dropped, note dropped, same-tab, predicate
  inlined) and THREE on `resolveBundleReference`.

## What was NOT verified

- **No live Supabase, no signed-in session, no real ingest.** The submit drive
  runs the REAL browser preflight over the real normalized zip, but the
  transports are the harness's in-memory ones, so `foundry_create_version`,
  `foundry-ingest` and `previewViewerMayRun` were never called. The preview href
  was measured; the preview RESPONSE was not.
- **No Vercel preview URL.** The deployment is rate limited.
- **`prefers-reduced-motion` is `no-preference`** in the harness, so that path is
  not exercised; external requests are blocked, so text is measured in the
  fallback stack.
- The `/a/` and `/b/` serving routes were not driven; nothing in this bundle
  changes them.

## Deferred, deliberately

- **The launcher card's colours did not move.** The comment claimed the cyan
  texture quotes the room's molten seam; the seam is the amber `--fg-heat-*`
  scale. Only the comment was corrected. Heat means IN PROGRESS in that room and
  a launcher card is not a progress state, so repainting would be a design
  decision with `tests/home-order-and-accent.test.ts` pinning the pair.
- **`FOUNDRY_IGNORED_EXTENSIONS`, the gallery's own empty state and the
  `/foundry/preview` route itself were not touched.**
