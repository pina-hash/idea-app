---
title: "The IdeaCAD team panels reach a student: mounting 0205 and 0207 on the real classroom item page (`claude/epic-noether-yw3cbp`, ledger 0195)"
date: 2026-09-12
branches: [claude/epic-noether-yw3cbp]
migrations: []
subsystems: ["IdeaCAD", "Classroom", "Testing"]
---

Ledger 0190 built `SharePanel.svelte`, `PartsPanel.svelte` and `checkout.ts`,
proved all three on `/dev/ideacad-team`, and mounted none of them. Its own
closing section says why and says it plainly: "Neither panel is mounted on the
real classroom item page. `ItemDetail.svelte` is ledger 0178's file and the item
page's IdeaCAD region belongs to it and to 0171." So `0205` and `0207` were
applied to production -- fourteen RPCs -- two panels were written, measured and
tested, and **a student could reach none of it.** That is the same shape as the
editor two days earlier, where `createIdeacadTransports` was called from the day
it existed and its result was handed nowhere.

This bundle is the mount and deliberately nothing else. No migration.
`Claims: none.`

## What the join actually needed, which was less than it looked

Everything was already there, which is what 0190 promised: `IdeacadTransports`
carries the five sharing functions and the whole `assembly` boundary,
`probeIdeacadAssembly` and `createIdeacadSharingTransports` are the two ladders
onto a deployment that has one migration and not the other, and
`createIdeacadCheckout` owns the heartbeat, the local lapse clock and every
refusal sentence. What was missing was a page willing to call them and a
component willing to render the result.

**ONE PROP, NOT TEN.** `ItemDetail` takes `ideacadTeam` -- role, owner address,
grants, the sharing-ready flag, the assembly and its four callbacks -- for the
same reason `IdeacadTransports.assembly` is one field rather than nine: these
are two features of one document, they arrive together, and ten sibling props on
a 2,400-line file is ten chances to wire nine of them. **Null removes both
panels**, which is a manager, a document that has not opened, and a pre-0205
deployment alike; there is no flag anywhere reading "hide the panels".

**THE PAGE NEVER DECIDES WHO MAY DO WHAT.** `role` comes from the payload,
`canWrite` and `isOwner` come from `ideacad_assembly`, and the panels ask
`ideacadCanShare` and `partRows` about them. The page's own callback gating
mirrors those two booleans, which makes it a second statement of the rule --
so the test below asserts the layer that is NOT a mirror.

## The one decision ledger 0190 left open: where the panels sit

**Part checkout ABOVE the editor, sharing BELOW it.**

An IDEA-Blade is several parts and one person holds a part at a time, so which
part is mine is not information about the document, it is the thing that GATES
the modelling. A student who meets it after the editor has already been used has
met it too late, and Mr. Pina's own words for this feature are that switching
who holds what must be extremely easy and intuitive. Sharing is the opposite:
occasional, administrative, and nothing downstream of the editor depends on it,
so it goes underneath where it does not stand between a student and the work
they came for. At 375 the whole slot is one column and this is simply reading
order.

The ordering is asserted structurally rather than described, and the assertion
is UNCONDITIONAL: a first draft wrapped the editor's position in `if (editor)`,
which would have passed vacuously on the day the editor stopped rendering, which
is the one thing the claim is about.

## The document is always the caller's own, and that bounds the viewer case

`ideacad_open_document` resolves the CALLER's document and creates it if absent,
so on this page the caller is the owner and `role` is `'owner'` rather than a
guess. Reaching somebody else's shared document needs
`ideacad_open_shared_document` plus a way to choose one; `sharedWithMe` is still
uncalled anywhere in `src/`, and closing that is `store.ts`'s surface, which is
ledger 0170's file. **So the shared-document ENTRY POINT is still missing and is
named here rather than left to be discovered.**

What that does NOT bound is the read-only case, because `canWrite` and `isOwner`
arrive per-caller from `ideacad_assembly` and the panels read them directly.

## The assertion that does not trust its own fixture

`tests/dom/ideacad-team-mount.test.ts` mounts the REAL `ItemDetail` on a
schema-4 assignment built from the split fixture, and every case reports BOTH
counts rather than a zero on its own.

- writable owner: **3 part rows, 2 Take** (the third is held by a classmate),
  **3 reassign pickers, 1 share form**
- view-only: **the same 3 rows, 0 Take, 0 Release, 0 pickers**, and the
  view-only sentence PRESENT
- editor-but-not-owner, the middle rung a two-state fixture would miss
  entirely: **3 rows, 2 Take, 0 pickers** -- write and share are two different
  grants and `0205` keeps them apart
- pre-0205: **0 share forms**, the unavailable sentence present, and the parts
  half untouched, because it is a different migration

**The last case is the one that matters and it is the only one not partly
asserting a copy of the page's own rule.** Every other case withholds the
callbacks the way `+page.svelte` does. That one hands ALL FOUR in over a
read-only payload -- the state a page bug would actually produce -- and the
controls are still absent, because `partRows` reads `assembly.canWrite` and the
picker reads `assembly.isOwner`. Defence in depth, measured rather than argued.

## What was measured

- **`svelte-check`: 0 errors, 37 warnings in 20 files**, re-derived on
  `origin/integration` at branch time in a clean `git worktree` with `.env`
  written before the sync, and identical after the change. Breakdown held at 31
  `state_referenced_locally`, 5 `css_unused_selector`, 1
  `perf_avoid_nested_class`.
- **The full suite: 444 files / 8478 tests, all passing.** The baseline was
  measured in the same clean worktree at `31c477f6` and is **443 / 8469**, so
  the delta is exactly this bundle's one new file and its nine tests. The
  prompt's figures of 436 / 8373 were stale, which is why the baseline was
  re-derived rather than read.
- **Mutation proof, 7 mutants, 7 caught**, every one PERMISSIVE: both panels
  mounted with their guards removed, `partRows` ignoring `canWrite`, the
  reassign picker ignoring `isOwner`, the view-only sentence emptied, and the
  two panels swapped around the editor. All three touched files restored from an
  IN-MEMORY copy and md5-checked at both ends; `git checkout --` was not used,
  because it is a discard-to-HEAD that would have eaten this session's
  uncommitted work.
- **`npm run verify:browser -- --route ideacad-team`: 8 route/width runs, 158
  measurements, 0 outside threshold.** The scoped `verify:readme` pass covered
  all 11 ideacad specs: **22 route/width runs, 506 measurements, 0 outside
  threshold**, in 74 seconds.
- **`node tools/claude-md-check.mjs`: agrees with the tree.**

## The measurement the harness could not have made, and the reason to make it

`/dev/ideacad-team` lays its panels out with `columns: 26rem 2`, so at 1440 they
render **440px** wide, and ledger 0190 chose the panels' 24rem container-query
threshold against that. **The real classroom item column is a different width**,
and it was measured on `/dev/classroom`, which mounts the real `ItemDetail`:
**343px at a 375px viewport and 896px at 1440.** So the wide arrangement now
renders at more than twice the width anybody has looked at it in.

Measured with the harness's multicol overridden to those two widths, at
`role=owner` and `role=viewer`: horizontal overflow **0px** in all three renders,
every rendered control inside its own panel (**0 escapes**), no tap target under
44px (**0**), and both selects filling their fields -- the role picker
**176px in 176px** and the reassign picker **299/299 at 375 and 208/208 at 1440**,
which is 0190's clipped-select fix holding at a width it was not tuned for. Part
rows are 177px tall at 375 and 76px at 1440 for an owner, 56px for a viewer.

**And then they were rasterized and looked at**, which is what 0190's experience
says is not optional -- its browser checks all passed first time and looking
found four defects. Three renders were examined at the real widths. Nothing was
found: at 375 everything stacks full width, at 896 the rows read name-left /
action-right, and the viewer render shows three parts, who holds each one in
words, and no Take, no Release, no picker, no share form and no Remove, with both
explanatory sentences present.

**The container query travels with the panel and cannot be broken by this
mount**, which was checked rather than assumed: `container-type: inline-size` is
declared on `.parts` itself, not on an ancestor, so the panel measures its own
box wherever it is mounted. Confirmed in both renders.

## Two entries nobody could read

The classroom update log took an entry for this change, per the standing
directive. Writing it surfaced a defect already on `origin/integration`: **two
entry objects were sitting inside `classroom-updates.json`'s `_readme` array
rather than its `entries` array** -- the IdeaCAD materials entry of 2026-09-12
and the blade-concepts entry of 2026-09-11. `updates.ts` reads
`raw.entries` and nothing else, so neither had ever rendered at
`/classroom/updates`. Both were moved across in the same edit; `entries` goes
157 to 160 and `_readme` is pure strings again. The file parses, which was
checked, because a changelog that will not parse is a page that will not render.

## What is NOT verified, stated rather than left to be discovered

- **Nothing was run against the live Supabase project**, and no RPC in `0205` or
  `0207` was called for real. The local `.env` is the placeholder project. Every
  claim here is about the client against fixtures whose shapes were read off the
  migration files.
- **The real classroom item page was never opened in a browser.** It needs a
  Bosco Tech Google session, which no automated run in this container holds, so
  the panels were measured in the harness at the real page's measured column
  widths rather than on the page itself. The widths are real; the surrounding
  page is not.
- **Production was unreachable from this container.**
  `curl https://ideabosco.com/` answered `curl: (56) CONNECT tunnel failed,
  response 403` and `000`. Ledgers 0188 and 0190 recorded the identical refusal
  on the two preceding days. It was not routed around and no Vercel URL was
  substituted.
- **`prefers-reduced-motion` is `no-preference` in the harness.** Neither panel
  animates, so there is nothing for it to gate; that is an argument, not a
  measurement.
- **Text is measured in the fallback stack** -- the harness blocks every
  non-loopback request, so `fonts.googleapis.com` never answers and Rajdhani and
  Share Tech Mono are not the faces the contrast figures were taken against.

## What was deliberately left undone

**A student still cannot open a document somebody shared WITH them.**
`sharedWithMe` and `openSharedDocument` exist on the transports and have no
caller; the store has no `openShared`, and giving it one is `store.ts`'s change,
not this file's. So sharing today means a classmate can be granted access and
the grant is real in the database, and the surface that lists what has been
shared with you is the next bundle. This is the largest remaining gap in the
feature and it is the one to take next.

**A teacher still cannot EDIT a shared document**, unchanged from 0190 and still
recorded in `sharing.ts`'s `CAPABILITIES` table as a gap rather than a rule:
decision 24 says Mr. Pina and Mr. Cosso see and edit everything, `0201` gave them
read only and `0205` did not change it.

**The panels are not restyled for the wider column.** At 896px a part row puts
its name at the far left and its controls at the far right, which is an ordinary
list-row arrangement and measured clean, but it is looser than the 440px the
panels were designed in. Capping the panels' measure at the mount is the obvious
next move if anyone dislikes it; it was not taken here because nothing was wrong
with it and the panels belong to another ledger.
