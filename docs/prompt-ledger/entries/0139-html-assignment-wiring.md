# 0139 The HTML assignment wiring: the routes finally supply the transports

- Issued: 2026-09-10
- By: the last gap after ledgers 0134, 0136, 0137 and 0138. Five lanes built the
  whole ported-HTML-assignment subsystem and `0197` opened the write gate, and
  the feature was still inert: `grep -rn "htmlAssignmentTransports" src/routes/`
  returned NOTHING, so the composer's import control was gated on a prop nobody
  passed, `createHtmlAnswerTransports` had no caller, and a schema-3 item
  mounted read-only.
- Owns:
  - the HTML-assignment wiring in `src/routes/classroom/**`
  - the transport factories in `src/lib/classroom/html-assignment/**`
  - the HTML-assignment regions of `ContentComposer.svelte`,
    `ItemDetail.svelte` and `src/lib/classroom/transports.ts`
  - `src/routes/dev/html-assignment/**`
  - `tests/html-assignment*`, `tests/dom/html-assignment*`,
    `tests/db/html-assignment*`
  - `tools/browser-verify/routes/html-assignment*.mjs` and the generated
    regions of `tools/browser-verify/README.md`
  - `docs/prompt-ledger/entries/0139-*`, and its own `docs/history/` entry
- Migration permitted: none.
- Claims: none.
- Lands on: NOT `main`. Ledger 0140 owns that.
- Status: pushed
- Branch: `claude/youthful-edison-8uhhws`, branched from `origin/integration`
  at `afa3c3da`.
- Notes:

  **DUPLICATE CHECK, CLEAN.** `docs/prompt-ledger/entries/0139-*` exists on no
  ref: zero hits from `git log --all --diff-filter=A`, and `git ls-tree` over
  `origin/main`, `origin/integration` and all **42** standing `claude/**`
  branches found no `0139` ledger file on any of them. `origin/integration`
  tops out at 0138; `origin/main` at 0132. `git fetch --unshallow origin`
  succeeded and the repository is not shallow (2009 commits reachable);
  `git fetch origin integration` succeeded; `git config user.name` is `Claude`
  and `user.email` is `noreply@anthropic.com`.

  **THE CLAIM WAS CONFIRMED BEFORE ANYTHING WAS BUILT.**
  `grep -rn "htmlAssignmentTransports" src/routes/` returned nothing (exit 1),
  and `createHtmlAnswerTransports` had exactly one occurrence in `src/` -- its
  own definition. Both now resolve.

  **NOTHING WAS RESHAPED.** Every seam this bundle used was already there and
  documented as the seam: `HtmlAssignmentTransports.setHtmlAssignment` says
  "the first season hands the transport to an admin and to nobody else";
  `ContentComposer.htmlAssignmentAdmin` says it "keeps the panel off a
  non-admin's screen"; `HxAnswersOptions` carries `onvalues`/`onimages`/
  `onsaved` because "the surface holds the `$state`; this module holds none";
  `HxAnswers.destroy` is a "returned teardown shape, so a surface can hand it
  straight back from an `$effect`". No signature moved and no component gained
  a flag.

  **TWO THINGS THIS BUNDLE ADDED, BOTH SMALL AND BOTH NAMED HERE.**
  `createHtmlAssignmentTransports` in `transports.ts` (the write side: the one
  RPC plus `classroom_set_rubric`, delegated to `createTeacherEngineTransports`
  rather than spelled a second time), and
  `$lib/classroom/html-assignment/answers-store.svelte.ts`, a `$state` mirror
  over `HxAnswers` holding no `$effect` of its own. `htmlManifestShaped` was
  EXPORTED from `transports.ts` -- `HtmlAssignmentData.manifest` is `unknown`
  and the item page has to narrow, and the alternative was a second structural
  check written in a route.

  **THE ADMIN GATE IS THE ABSENCE, AND BOTH PROPS READ ONE FLAG.** A non-admin
  is handed `null` and `false`, so the panel is structurally absent and the
  refusal sentence is not rendered either -- a teacher who was never told the
  control exists should not read a sentence about being refused it. The
  database is still the boundary: `classroom_set_html_assignment` raises on
  `is_admin()` inside itself, which the walk proves as a real refusal.

  **THE WALK, LEG BY LEG, WITH THE INSTRUMENT THAT PROVED EACH.** No leg is a
  green suite reported as a walk.

  | leg | instrument | result |
  | --- | --- | --- |
  | an admin imports a document and the item is created | real embedded Postgres, real migration chain through `0197`, the REAL `stageHtmlDocument` + `applyStagedHtmlAssignment` + `createHtmlAssignmentTransports` over the postgrest shim | `assignment_schema_version` 3, the document stored byte-identically, `imported_by` the admin, the 6-criterion 12-point rubric written beside it |
  | a NON-ADMIN is refused | same | 1 failure containing "limited to site admins", the staged document KEPT, 0 rows, schema version still null |
  | the route gates on a signal only an admin gets | the REAL `/classroom/+layout.server.ts` load, same database | `navIsAdmin` true / **false for the teacher of record** / false for the student |
  | a NON-ADMIN does not see the import control | a REAL mount of the REAL `ContentComposer` in `tests/dom/` | panel 0, refusal 0, file inputs 0, against panel 1 / refusal 0 / file inputs 1 for an admin and panel 0 / refusal 1 for the explainer mount |
  | typing saves, reload restores, ALL SIX BLOCK TYPES | real Postgres, the REAL `HxAnswers` over `createHtmlAnswerTransports` | 5 response rows (the image block has none, correctly), every one restored through `hxValuesFromResponses` |
  | an image lands and comes back | real Postgres, the eight-argument `classroom_add_submission_file` reached through the REAL `classroom_open_submission` + `storageObjectKey` | 1 file on its block, `application/octet-stream`, restored onto its own field by `hxImagesFromFiles`, its row named by `hxFileIdsByField`, and a caption written back through `classroom_set_submission_file_caption` |
  | the answer mirror is genuinely reactive | a REAL effect root in `tests/dom/` | an effect reading `values` re-ran on the change and read the new value; one reading `saved` re-ran on the acknowledgement; both against a first run that read `undefined` |
  | a student opens it and the frame renders | real Chromium, the REAL `HtmlAssignmentFrame` against the REAL `/hx/` route | see MEASURED below |
  | a spec-backed item is untouched | the existing `tests/db/html-assignment-spec-path-unchanged.test.ts` | green, unmodified |

  **THE TWO INSTRUMENT GAPS, STATED RATHER THAN PAPERED OVER.** node-postgres
  serializes a JS ARRAY as a Postgres array literal, so `p_criteria` bound to a
  `jsonb` parameter fails with "invalid input syntax for type json"; that is
  worked around in the test file exactly as `tests/frc-quiz-route.test.ts`
  works around it, never in the shared shim. And `uploadSubmissionFile` /
  `deleteSubmissionFile` are HTTP routes the shim cannot reach, so the upload
  stand-in does what the sign and record routes do and nothing else -- what is
  proven is the ARITY and the round trip, never the sign-and-PUT hop.

  **MEASURED.** svelte-check 0 errors / 37 warnings / 31-5-1, exactly baseline,
  re-derived after `npx svelte-kit sync` with the two `PUBLIC_SUPABASE_*`
  placeholders exported. Full suite **371 files / 7339 tests**, all passed
  (baseline 368 / 7321: three files added, eighteen tests).

  **NOT VERIFIED.** No signed-in `/classroom/<section>/item/<id>` page was
  driven: there is no Docker daemon, no Supabase CLI and no PostgREST, auth or
  storage stack in this container, and production sign-in is Google OAuth. So
  the item page's own composition -- the memoized controller reaching
  `ItemDetail` reaching the frame -- is proven by its parts (a real mount for
  the store, real Postgres for the transports, real Chromium for the frame and
  the `/hx/` route) and not as one continuous session-backed run. `0193`
  through `0197` were taken as applied on the prompt's word; nothing here
  touched the live project.

  **OUTSIDE THE DECLARED PATHS, AND NAMED RATHER THAN LEFT TO BE FOUND.**
  `src/routes/classroom/[sectionId]/+layout.svelte` and
  `src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte` are the wiring
  and are what the prompt asked for; `classroom-updates.json` gained the
  student-readable entry CLAUDE.md's standing directive requires. `CLAUDE.md`
  itself was NOT edited -- it is outside these paths, `node
  tools/claude-md-check.mjs` agrees with the tree, and this bundle introduces
  no route, tier, role, env var or trap.
