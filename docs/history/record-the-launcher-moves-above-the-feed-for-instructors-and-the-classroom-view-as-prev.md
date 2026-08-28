---
title: "The launcher moves above the feed for instructors, and the classroom view-as preview is deleted (code only, NO migration)"
date: 2026-08-21
branches: []
migrations: []
subsystems: ["Home page, launcher, tour", "IDEA Classroom"]
record_order: 100
---

## The launcher moves above the feed for instructors, and the classroom view-as preview is deleted (code only, NO migration)

Two unrelated items in one bundle, and one of them leaves SQL behind on purpose.

### 1. The home page's section order

**What was there.** `/` rendered Your Classes and then Apps, in that order, for
everybody. The feed is one card per class, so its height is a function of how
many classes the viewer has and how many ranked rows each card carries -- which
is small for a student with one class and large for an instructor with four.
Measured on the harness below at 1440x900 with three rows a card: an instructor
with four classes found the Apps section at **2113px**, a student with one at
**1074px**.

**What changed.** Apps comes first for a viewer who MANAGES any section.

- **The signal is `classroomFeeds.some((f) => f.manages)`.** `buildFeed` already
  computes `manages` per section, mirroring `classroom_manages_section` (teacher
  of record, or admin), so this asks the same question through the same
  implementation on data the page already loaded. No extra read, no second rule.
- **`profile.role` is the WRONG key and a mutation proved the suite could not
  tell.** The `@boscotech.edu` domain grants `teacher` automatically, so staff
  who teach no section would have been given the manager order; an admin whose
  role is not `teacher` would have been given the student one. The test file now
  carries both of those viewers precisely because keying on the role reddened
  nothing until it did.
- **Two snippets, one definition each, rendered in one of two orders.** Not a CSS
  `order` on a flex parent -- that moves the paint and leaves the DOM alone, so
  tab order and screen-reader order would disagree with the screen. And not two
  `{#if}` copies of each block, which is two places to fix everything after; a
  mutation that duplicates one reddens.
- **The student order is untouched**, which is the point: the feed is the only
  thing on the page that deep-links a student into the exact item that is due.

**The accent contradiction, resolved toward CLAUDE.md.** Every `PORTAL_APPS`
entry declared `theme: { primary, secondary }`, and `AppLauncher` wrote it onto
each card as an inline `--acc-primary`/`--acc-secondary`. **An inline custom
property beats the class rule**, so `.app-card`'s shared brass/gold pair -- the
uniform accent the standing rule describes -- never painted on a single card,
and six cards rendered an identity colour (a pure FIRST red, a chartreuse, a
cyan, a mint). The field is deleted from the interface and from all eleven
entries, and the inline pair is gone; the class rule is now what paints.

- **Deleted rather than set to one value everywhere.** A field that may only ever
  hold one value is an invitation to put a second one in it.
- **`cardTexture` went with it.** It keyed a card's interior pattern off the
  theme colours -- scanlines for VANGUARD, a blueprint grid for GAUNTLET,
  diagonal stripes for FRC. Re-keying it on `app.id` would have been the same
  per-card identity treatment wearing a different field. Every card takes the
  design system's `--texture-brushed`, declared once in `.app-card`.
- Product colour still exists where it belongs: inside each product's own scoped
  theme (`.gt-root`, `.glb`, `.frc-root`).

### 2. Deleting the classroom view-as preview

**Why it could not be fixed.** The instructor and the student differ by PAYLOAD,
not by render. `ItemDetail` is already one component gated by `canManage`, so an
instructor reads the student page plus edit affordances -- but a student's page
also carries an engine slice (`StudentEngineData`) that a manager's read never
loads and must never load. `classroom_view_as_section` carried no such slice, so
an assignment previewed as a student hit `ItemDetail`'s `{#if viewAs}` branch and
rendered *"Submission tools are hidden while viewing as a student"* exactly where
the work surface belongs. Nothing short of minting a real student session closes
that, which is not a preview any more (`IDEA_INTERFACE_STANDARDS` 3: a preview
whose fidelity cannot be proven is removed, not tolerated).

**Deleted:**

- `src/routes/classroom/view-as/[studentEmail]/[sectionId]/+page.{server.ts,svelte}`
- `src/routes/classroom/view-as/[studentEmail]/[sectionId]/item/[itemId]/+page.{server.ts,svelte}`
- `src/routes/classroom/view-as/[studentEmail]/+page.svelte` (the class list whose
  every link pointed at the first of those)
- The `?as=<email>` branch on `/api/classroom/attachment/[attachment_id]`, and the
  `viewAs` parameter of `attachmentSrc` and `resolveFigureSrc`
- The `viewAs` prop on `ClassView`, `ItemDetail`, `AttachmentList` and
  `MarkdownText`, and `ItemDetail`'s placeholder branch
- `MyClasses`'s `basePath` prop, whose only non-default caller was the deleted page
- `/dev/classroom`'s three `viewas-*` harness views
- A `/classroom/view-as/.*/deck` alternative in `FEEDBACK_EXCLUSIONS` that had
  never matched a route (the view-as tree has never had a deck page). Removing an
  alternative that matched nothing is not removing an exclusion -- no surface
  gains or loses the control.

**Kept, and why.** `/classroom/view-as/[studentEmail]` is now a **307** to
`/notebook` -- re-pointable, and a permanent redirect would be cached past the
point where re-pointing helps. The picker links straight to the notebook.

**What the notebook preview actually needs**, which the brief asked to
determine:

| | needed? | why |
|---|---|---|
| `classroom_view_as_students()` | **YES** | it is the picker; 0099's own header says so |
| `_classroom_view_as_guard(text)` | **YES** | `notebook_view_as_notebook` (0099) and 0106 both open with it |
| `classroom_view_as_sections(text)` | no | only the deleted class list called it; the notebook's `section_label` comes from its own payload |
| the attachment `?as=` branch | no | notebook photos go through their own proxy, which has never had one |

**Removing `?as=` cannot widen anything.** The branch only ever NARROWED an
already-authorized read: every response is the caller's own, scoped by
`classroom_attachments`' policy, and that is unchanged. What the parameter can no
longer do is make the route answer as somebody else.

### THE ORPHAN LIST, for the follow-up migration

Applied, granted, and now referenced by nothing in the app. All five are STABLE
and read-only, so leaving them applied is harmless; dropping them before this
deploys would 500 a live route, which is why none of it is in this bundle.

**Drop in this order** (`_classroom_item_json` is called by the first two):

1. `public.classroom_view_as_section(text, uuid)` -- latest definition 0113
2. `public.classroom_view_as_item(text, uuid, uuid)` -- latest definition 0109
3. `public.classroom_view_as_can_read_attachment(text, uuid)` -- latest definition 0109
4. `public.classroom_view_as_sections(text)` -- latest definition 0083
5. `public._classroom_item_json(uuid)` -- latest definition 0113; carries no
   grant, reachable only from (1) and (2)

**Do NOT drop:** `classroom_view_as_students()` (the picker),
`_classroom_view_as_guard(text)` (0099 and 0106 call it),
`_classroom_item_live(boolean, timestamptz)` (sixteen callers across
0109/0110/0113, nothing to do with view-as).

**The follow-up migration must also change two test files**, which drive those
functions directly and would fail the moment they stop existing:

- `tests/classroom-security.test.ts` -- the `view as student` describe calls
  `classroom_view_as_sections`, `classroom_view_as_section`,
  `classroom_view_as_item` and `classroom_view_as_can_read_attachment` in four
  places; and the `anon boundary` list names three of them. The
  read-only-is-structural test is already generalized and needs no edit.
- `tests/classroom-attachment-route.test.ts` -- its PostgREST shim allow-lists
  `classroom_view_as_can_read_attachment` as a reachable RPC.

### Generalizing the enumerated assertion

`tests/classroom-security.test.ts` spelled out five `classroom_view_as*` function
names and then asserted all five were STABLE. The list was the fragile half: it
would have failed the moment a sixth read-only reader appeared, and it said
nothing at all about a seventh that could write. It now asserts **the rule**:
nothing under that prefix is VOLATILE, with the row count as its positive
control so a prefix typo or an unapplied 0083 cannot pass by finding nothing. A
mutation turning one of those functions VOLATILE reddens it.

### Measured

**Apps section offset, `top` in document coordinates, measured on the real page
through `/dev/home-order`. "Before" is the shipping page with
`managesAnySection` mutated to `false` -- the pre-bundle order exactly --
applied and hash-verified, then restored byte-identically.**

| viewer | viewport | before | after | change |
|---|---|---|---|---|
| instructor, 4 classes, 3 rows/card | 1440x900 | **2113px** | **582px** | **-1531px** |
| instructor, 4 classes, 3 rows/card | 375x812 | **3218px** | **522px** | **-2696px** |
| student, 1 class, 3 rows/card | 1440x900 | **1074px** | **1074px** | unchanged |
| student, 1 class, 3 rows/card | 375x812 | **1304px** | **1304px** | unchanged |

The instructor's Your Classes block measures 1492px at 1440 and 2656px at 375;
that height plus the hero is the whole of the offset that moved. No horizontal
overflow at either width (`documentElement.clientWidth` 1425 / 375, launcher
element width 1425 / 375).

**The accent, read back through a canvas rather than parsed out of a computed
style.** All eight cards visible to a signed-out viewer now report
`--acc-primary: rgb(200,168,72)` (= `--gold`) and
`--acc-secondary: rgb(120,184,112)` (= `--green`), and every `.app-title`
resolves to the gold. The FRC card previously carried `rgb(237,28,36)`. The only
inline styles left on a card are the entrance animation's, which the component
clears on `transitionend`.

### Verified

**Nothing reaches the deleted paths.** `grep` over `src/` for
`classroom_view_as_section`, `classroom_view_as_item` and
`classroom_view_as_can_read_attachment` returns comments only; for a
`view-as/.../<sectionId>` or `/item/` path, nothing; for `viewAs` under
`src/lib/classroom`, `src/routes/classroom` and `src/routes/api/classroom`,
comments only. `svelte-kit sync` regenerates route types for exactly three
directories under `view-as` (the picker, `[studentEmail]`, and its `notebook`),
and the `[sectionId]` tree is absent.

**The notebook preview still works**, driven through
`/dev/classroom-view-as-notebook`, which mounts the REAL `NotebookView` with the
REAL banner: the notebook renders, the banner reads *"VIEWING AS Ana Reyes ...
read-only preview of what this student sees"*, and the surface carries **0
forms, 0 file inputs, 0 textareas**. Positive control on the same component at
`/dev/notebook`, where the write transports ARE handed in: **1 form, 2 file
inputs**. So the zeros are the absent transports, not an absent component.

**Mutation proof: 11 mutations, each verified APPLIED by grep AND a changed md5
before its result was read, each restored byte-identically, a zero treated as a
failure of the proof.** Nine reddened on the first pass; **two reported zero and
both were real, not harness bugs**:

| # | mutation | reddened |
|---|---|---|
| M1 | `managesAnySection` -> always false (the pre-bundle order) | 1 |
| M2 | `managesAnySection` -> always true (a student loses the top) | 1 |
| **M3** | **keyed on `isTeacher` instead of on `manages` [REJECTED ALTERNATIVE]** | **0, then 1** |
| M4 | both blocks written twice inside an `{#if}` [REJECTED ALTERNATIVE] | 1 |
| M5 | a per-card `theme` comes back on PORTAL_APPS | 1 |
| M6 | the inline accent comes back on the card element | 1 |
| M7 | a `classroom_view_as*` function turned VOLATILE | 1 |
| M8 | `?as=` wired back onto the attachment proxy [REJECTED ALTERNATIVE] | 3 |
| M9 | MyClasses links rebuilt from a basePath [mis-aimed] | 0, withdrawn |
| M9b | `nav.ts` stops matching `view-as` head-first | 1 |

**M3 is the one that mattered.** Keying the whole decision on `profile.role`
reddened nothing, because both fixtures made role and management the same fact:
the teacher viewer was also the teacher of record. Two viewers were added where
they come apart -- staff who teach no section, and an admin whose role is not
`teacher` -- and M3 then reddened by name. Without that, the suite was
indifferent between two designs that give different answers to two people who
really exist here.

**M9 was a mis-aimed mutation, and is recorded rather than quietly dropped.** It
re-pointed `MyClasses`'s hrefs at a `view-as` path; nothing renders `MyClasses`
in the file it was run against, so the zero said nothing about coverage. It was
replaced by M9b, which mutates a rule this bundle actually asserts -- that
`locateClassroom` swallows the whole `view-as` subtree head-first, whatever ends
up under it -- and that reddens.

### Suite

`npx svelte-check`: **0 errors, 36 warnings** -- the baseline, unchanged.
`npx vitest run --no-file-parallelism`: **75 files, 1850 passing**
(74/1844 before this bundle's test file).

`vitest.config.ts` gained two aliases, `$app/navigation` and
`$env/static/public`, both reached by server-rendering the REAL home page
(ProfileMenu imports `invalidateAll`; Avatar's `profile.ts` reads the storage URL
at import time). Without them the page cannot be imported into a test and its
section order could only have been asserted against a copy of its markup.

### NOT VERIFIED, and why

- **The live Supabase project.** The local `.env` is the placeholder
  (`example-ref`). No SQL ships here, and the orphan list above is derived by
  reading the migration files, not by querying a deployed catalog.
- **A real signed-in home page.** `/` needs a session; the offsets were measured
  through `/dev/home-order`, which mounts the REAL `src/routes/+page.svelte` with
  the shape its own server load returns. The load itself was not exercised.
- **The deleted routes returning 404 in production.** `/classroom` is an authed
  prefix, so an anonymous request to any path under it is redirected before
  routing, and a signed-in admin session cannot be created here. What is verified
  is that the router no longer knows those routes at all.
- **Screenshots.** The Browser pane does not composite. Every visual claim above
  is a measured geometry, computed-style or canvas-readback figure.
- **The orientation tour's step order.** `ORIENTATION_STEPS` still walks hero ->
  classes -> apps, so a manager taking the tour now steps down the page and back
  up. Noted, not changed: the steps are authored copy and reordering them is a
  content decision, not a consequence of this one.

**Undoing it:** revert the changed files, restore the four deleted route files
and delete the three new ones (`src/routes/dev/home-order/`,
`tests/home-order-and-accent.test.ts`, `tests/stubs/app-navigation.ts`,
`tests/stubs/env-static-public.ts`). No migration ran and nothing was dropped, so
a revert restores a working preview: every SQL function it called is still
applied. Reverting `classroom.ts` alone would leave `AttachmentList` and
`MarkdownText` passing a `viewAs` that no longer exists -- revert those with it.

---

