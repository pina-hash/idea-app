---
title: "Prompt 0139: the HTML-assignment wiring, or how a finished feature stayed inert (`claude/youthful-edison-8uhhws`, no migration)"
date: 2026-09-10
branches: [claude/youthful-edison-8uhhws]
migrations: []
subsystems: ["Classroom", "HTML assignments", "Transports", "Testing"]
---

Five lanes built the ported-HTML-assignment subsystem: the format and its
validator, the sandbox origin and its serving route, the frame and the bridge,
the answer controller, the manifest-derived rubric, and `0197`, which widened
the one function that writes an answer. Everything was tested and everything
worked. **The feature was unreachable**, and one grep said so:

```
$ grep -rn "htmlAssignmentTransports" src/routes/
$
```

No route supplied them. So `ContentComposer`'s import panel was gated on
`canStageHtml`, which requires a transport nobody passed, and never rendered;
`createHtmlAnswerTransports` had exactly one occurrence in `src/`, its own
definition; and `ItemDetail` derived `htmlWrites` from a `htmlAnswers` prop no
route handed down, so every schema-3 item mounted `readOnly`. This bundle is the
wiring and nothing else.

## What the shape of this bundle says about the four before it

Nothing here required reshaping anything, and that is worth recording because it
is the outcome the seam design was betting on. Every join used was already
written down as a join, in the module that owns it:

- `HtmlAssignmentTransports.setHtmlAssignment` -- "NULL REMOVES THE CONTROL ...
  This is also how the admin-only rule is expressed: the first season hands the
  transport to an admin and to nobody else."
- `ContentComposer.htmlAssignmentAdmin` -- "This flag is what keeps the panel
  off a non-admin's screen, so the refusal is something they never have to
  read."
- `HxAnswersOptions.onvalues` -- "The surface holds the `$state`; this module
  holds none."
- `HxAnswers.destroy` -- "Returned teardown shape, so a surface can hand it
  straight back from an `$effect`."

A lane that had guessed at any of those would have needed this bundle to move a
signature. None did.

**The lesson is the other half, though, and it is the one worth carrying:** a
subsystem can be complete, tested in five files, green on every measurement, and
deliver nothing at all, because "is it reachable" is not a question any of those
instruments asks. The composer's panel had a `data-testid`, a harness, and a
mount test; none of them could see that no production caller existed. What found
it was a grep in a prompt.

## What was added, which is small on purpose

**`createHtmlAssignmentTransports` (`transports.ts`)** -- the write side.
`classroom_set_html_assignment` for the document and its manifest, and
`setRubric` delegated to `createTeacherEngineTransports` rather than spelled a
second time, because there is no HTML-assignment rubric table and
`classroom_set_rubric` is the same call a spec's rubric already takes.

It fills `setRubric` in even though `ContentComposer` would fill it in itself
from `teacherTransports`. `HtmlAssignmentTransports` says every surface that
uploads a document passes one, and the reason is in its own header: the rubric a
ported assignment is graded against is a pure function of its manifest, so a
re-upload that writes a document without rewriting the rubric leaves the OLD
document's criteria on the item -- which stores fine, renders fine, and is wrong
only on the grading console. The composer's fallback stays as defence in depth
for a mount that hands the object over without one.

**`$lib/classroom/html-assignment/answers-store.svelte.ts`** -- a `$state`
mirror over `HxAnswers`. The controller owns "no DOM, no reactivity and no
client" by its own header and takes three callbacks for exactly this; the store
holds the runes and forwards the four writes. It runs **no `$effect`**,
deliberately: `.svelte.ts` modules are outside
`tests/classroom-composer-effect-reactivity.test.ts`'s sweep, which parses
`.svelte` files because "caller-supplied" is a `$props()` shape, and that gap is
a tripwire rather than an omission. The lifecycle belongs to the mount.

Its four writes are **bound arrow properties, not methods**, so an object torn
apart by a future mount or a test keeps working; a plain class method loses
`this` silently and throws on the first private-field read.

**`htmlManifestShaped` exported.** `HtmlAssignmentData.manifest` is `unknown` --
the load stores what the column held and judges none of it -- so a surface
building an answer controller has to narrow. Exporting the one structural check
that already existed beat writing a second one in a route. Failing it hands down
no controller, which `ItemDetail` already renders as a read-only document.

## The two route changes

**`src/routes/classroom/[sectionId]/+layout.svelte`** builds the transports once
and hands them down only for an admin, with `htmlAssignmentAdmin` reading the
SAME flag. Both from `data.navIsAdmin`, which `/classroom`'s own layout load
already computes for the switcher: layout data merges down, so this costs no
second round trip and cannot disagree with the nav about who is an admin.

Reading one flag into both props is what keeps a non-admin out of the
composer's third state. The component renders `HTML_ASSIGNMENT_ADMIN_ONLY` when
a transport is present and the flag is false -- a mount that deliberately wants
to explain the rule. This one does not: a teacher who was never told the control
exists should not be shown a sentence about being refused it.

**`src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte`** builds the
answer controller. Three decisions in it are load-bearing:

1. **It is memoized on a key, not rebuilt per read.** The controller owns one
   `SaveState` per block -- live debounce timers, backoff, and the
   visibilitychange/pagehide net -- so rebuilding it because `data` changed
   identity would silently drop whatever those machines still owed. The key is
   the item and the document, which is exactly what has to change for the
   controller to be the wrong one; `invalidateAll()` after a manager's write
   gets the same object back.
2. **`data.engine` is the seed, not the truth.** The stored rows are read only
   on the run that constructs, so a reload of the page data cannot overwrite
   what a student has typed since.
3. **It is a `$derived.by` with a plain memo cell and an `onDestroy`, not an
   `$effect`.** An effect writing the controller into `$state` would leave the
   frame read-only for the first frame -- the state prop is read during render
   and the effect runs after it -- and this repo's own rules make an effect the
   more expensive thing to get right. The memo cell is a plain local, never
   `$state`, so the derived cannot depend on its own output.

The seed itself is `hxValuesFromResponses` / `hxImagesFromFiles` /
`hxFileIdsByField` over `data.engine`, which is loaded only for a non-manager
already -- so a manager gets no controller by the same route the payload
already takes, and read-only stays structural.

## The walk

The prompt asked for each leg to be proven and for the instrument to be named,
and not for a green suite reported as a walk. There is **no Docker daemon and no
Supabase CLI** in this container, so it could not be one continuous
session-backed run.

| leg | instrument |
| --- | --- |
| an admin imports a document and the item is created | real embedded Postgres, the real chain through `0197`, the real `stageHtmlDocument` -> `applyStagedHtmlAssignment` -> `createHtmlAssignmentTransports` |
| a non-admin is refused, and nothing is written | the same, as the teacher of record |
| the route's gate is a signal only an admin gets | the real `/classroom/+layout.server.ts` load, the same database |
| a non-admin does not see the import control | a real mount of the real `ContentComposer` |
| typing saves, reload restores, all six block types | real Postgres, the real `HxAnswers` over `createHtmlAnswerTransports` |
| an image lands and comes back | real Postgres, the eight-argument `classroom_add_submission_file` |
| the answer mirror is genuinely reactive | a real effect root in `tests/dom/` |
| a student opens it and the frame renders | real Chromium, the real frame against the real `/hx/` route |
| a spec-backed item is untouched | the existing regression file, unmodified |

Three of those are worth expanding.

**The image leg found a real check by failing it.** The first draft of the
upload stand-in invented a random uuid for the storage key, and the RPC refused
it by name: *"That storage key does not belong to this submission."* The key
layout IS the authorization -- every storage policy and the write RPC read the
first path segment and ask whether it names the caller's own submission -- so
the stand-in now opens the submission through `classroom_open_submission` and
mints the key with the real `storageObjectKey`, which is what the sign route
does. The refusal was the check working, and it is why the real minter is used
rather than a plausible-looking string.

**The reactivity leg exists because its failure is silent.** A plain object with
the same shape passes every read: `store.values` answers correctly at any
moment you ask it, so a node-project test comparing values after a change is
green on a mirror that never notifies anything. What would be broken is the
frame -- the document holds its own typing, so nothing would look wrong until a
save failed and the refusal never arrived. It is therefore asserted as a re-run
COUNT inside a real `$effect.root`, which only `tests/dom/` can do: everywhere
else svelte resolves to its server build and a bare `$effect.root` invokes its
callback zero times.

**The admin leg is asserted in two halves because neither half is enough.** A
mount proves what the composer renders for each combination of the two props; it
cannot prove which combination a real viewer gets, because that comes from a
load. So the real `/classroom` layout load is driven against real Postgres as
all three people, and the teacher of record -- granted `teacher` by email
domain, managing this very section -- gets `false`. That is the ADMIN TIER rule
and the whole reason the import panel is not simply a manager control.

## Two instrument gaps, stated rather than papered over

**The shim cannot carry a jsonb ARRAY.** node-postgres serializes a JS array as
a Postgres array literal (`{...}`), so `p_criteria` -- a `RubricCriterion[]`
bound to a `jsonb` parameter -- arrives as text jsonb cannot parse and every
rubric write fails with "invalid input syntax for type json". PostgREST does not
do that: it sends the body as JSON and lets Postgres cast. This is worked around
in the test file, exactly as `tests/frc-quiz-route.test.ts` works around the
identical gap, and NOT in the shared shim. It is the second bundle to meet it;
a third should probably fix the shim.

**Two of the four answer transports are HTTP routes.** `uploadSubmissionFile`
and `deleteSubmissionFile` go through `$lib/classroom/file-upload`, which the
shim cannot reach. The stand-in does what the sign and record routes do and
nothing else, so what the walk proves is the ARITY and the round trip, never the
sign-and-PUT hop -- which is shared with every other hand-in and is proven
elsewhere.

## Measured

- `svelte-check` **0 errors / 37 warnings**, breakdown **31 / 5 / 1**, exactly
  baseline, re-derived after `npx svelte-kit sync` with the two
  `PUBLIC_SUPABASE_*` placeholders exported.
- Full suite **371 files / 7339 tests**, all passed. Baseline was 368 / 7321:
  three files added (8 + 5 + 5 = 18 tests), and 7321 + 18 = 7339 exactly.
- The browser harness's measured region regenerated once at the end, on a clean
  committed tree, with Vite started by hand on 5199 and warmed. The numbers are
  in `tools/browser-verify/README.md` and in ledger 0139.

## Not verified

**No signed-in `/classroom/<section>/item/<id>` page was driven.** There is no
Docker daemon, no Supabase CLI and no PostgREST, auth or storage stack here, and
production sign-in is Google OAuth against a real Bosco Tech account. So the
item page's own composition -- the memoized controller reaching `ItemDetail`
reaching the frame -- is proven by its parts and not as one run. That is the
honest boundary, and the one thing a session with a local stack should do next:
`/dev/login` against `supabase start`, apply nothing (`0193` through `0197` are
already applied to production), post a ported assignment as an admin and open it
as a student.

`0193` through `0197` were taken as applied on the prompt's word. Nothing here
touched the live project, and no migration was written.

## Deferred, deliberately

**A navigation guard on the item page.** `HxAnswers` exposes `dirty` and
`flush()`, and `HxAnswersStore` forwards both, but nothing on the item page
wires them to `guardSaveNavigation`. A page UNLOAD is already covered -- the
per-block `SaveState` carries the shared visibilitychange/pagehide net -- so
what is uncovered is a client-side navigation inside the app within the debounce
window. It is a surface decision with its own answer for `alsoUnsaved` and for
what a refused flush should ask, and it is not wiring.

**No export ping on the document write.** `createTeacherEngineTransports` calls
`pingClassroomExport` after a spec or rubric write; `setHtmlAssignment` does
not. The classroom GitHub export is spec-shaped and has no answer for a schema-3
item, so pinging it would either write nothing or write something wrong, and
teaching it about ported documents is its own bundle.
