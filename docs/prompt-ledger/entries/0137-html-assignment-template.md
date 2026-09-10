# 0137 A blank HTML assignment template, and the document that explains it

- Issued: 2026-09-10
- By: Mr. Pina. Every HTML assignment so far has been built by copying the last
  one, so the reusable machinery and one assignment's curriculum are welded
  together. This bundle separates them: a blank any assignment can start from,
  and a short document saying what the required structure actually is.
- Owns:
  - `src/lib/legacy/assignments/_TEMPLATE.html` (new)
  - `docs/standards/IDEA_HTML_ASSIGNMENT_TEMPLATE.md` (new)
  - its row in `docs/standards/REGISTER.md`
  - `docs/prompt-ledger/entries/0137-*`, and its own `docs/history/` entry
- Migration permitted: none.
- Claims: none.
- Lands on: NOT `main`. Pushed to `claude/html-assignment-template-tm6zvw` and
  released to the `integration` sweep.
- Status: pushed
- Branch: `claude/html-assignment-template-tm6zvw`, branched from
  `origin/integration` at `b2581959`.
- Notes:

  **DUPLICATE CHECK, CLEAN.** No `docs/prompt-ledger/entries/0137-*` existed on
  any ref: every remote and local ref was swept with `git ls-tree -r` over
  `docs/prompt-ledger/entries/` and no ref carried a `0137` file. No commit
  anywhere in the repository has ever touched that path
  (`git log --all --name-only` over the glob: zero). No commit subject on any
  ref names 0137. Forty-two `claude/**` branches stand; none carries a 0137
  ledger commit.

  **THE OTHER TWO LANES WERE READ AND NEITHER WAS WRITTEN.** 0138's
  `src/lib/classroom/html-assignment/manifest.ts` is where the manifest schema
  in the template came from -- read, not taken from the prompt -- along with its
  ported fixture at `src/routes/dev/html-assignment/fixtures/`, which is the one
  worked example of a manifest over this exact document and is where the image
  block's `field` placement was learned. 0136's
  `IDEA_HTML_ASSIGNMENT_SPEC.md` did not exist on `origin/integration` at branch
  time, so there was nothing to read and nothing to conflict with.

  **`idea100-blade-01.html` WAS READ AND NOT TOUCHED.** md5
  `2211141fc0d2e08ee6c005d3d0d639d3` at branch and md5-verified identical at the
  end. The kept CSS was lifted out of it BY SCRIPT rather than retyped, so a
  rule the template keeps is byte-identical to the one IDEA100 students are
  working in right now.

  **WHAT WAS DELETED BEYOND WHAT THE PROMPT NAMED**, all of it content by the
  same test the prompt applies: the rulebook block (`.rulebook-*`, markup and
  CSS, about 100 lines -- a link to the IDEA-Blade Rulebook and its
  acknowledgement), the team-entry banner (`.team-banner-*`, `.scope-tag` --
  prose explaining TEAM and INDIVIDUAL on a Blade team build), and the "Blade"
  disambiguation note under the masthead (`.brand-note`). The `.mod-scope` chip
  on a module header survives and is now drawn from the manifest's own
  `audience`, so the idea is kept and the Blade wording is not.

  **THE MANIFEST DRAWS THE DOCUMENT, WHICH IS THE ONE ADDITION RATHER THAN A
  SUBTRACTION.** Blade 01 states its points three times over (the module header
  chip, the visible rubric panel, the print-only instructor table) and a
  manifest would have been a fourth copy of one arithmetic. The template fills
  all of those, plus the rubric rows and their levels, the total bar and the
  footer, from the manifest at load. That cost a second script-built region, so
  `22016bbd`'s rule is now a CLASS (`js-built`) that `downloadHTML` empties,
  rather than two named ids -- adding a region means adding the class.

  **PROVEN THREE WAYS, AS ASKED.**
  1. `validateHtmlManifest` over the template: **0 errors, 0 warnings**, 10
     document `data-field`s against 10 manifest blocks. With a positive control
     and both refusal directions: a deleted input and an undeclared input each
     refused, as separate mutant FILES so the template was never edited (md5
     checked identical after).
     `python3 tools/validate-assignment-spec.py`: **PASS**, exit 0. Its one
     remaining warning ("document reaches for localStorage") is aimed at the
     embedded form and is carried by 0138's own ported fixture too; saving to
     the browser is how a standalone assignment works.
  2. Real Chromium over `file://`: every field typed, three checkboxes checked,
     two header-verified PNGs uploaded and captioned, Download with Data
     pressed. Export named `IDEA000_ASSIGNMENT_00_Ana_Reyes.html`, **10
     `data-field` attributes, 10 unique, NO duplicates**, and nothing
     script-built written in as markup. Reopened in a fresh browser: all nine
     scalar answers exact, both images once each in upload order with the right
     dimensions and captions, score 20 / 20.
  3. Preflight: 9 issues on an empty document, `[]` when complete, exactly
     `["Module One Title: m1 summary is empty"]` with one required field
     cleared, and `["Module One Title: m1 reasoning (1/3 sentences)"]` with one
     cut below its minimum.

  **TWO INHERITED DEFECTS FOUND BY DRIVING IT, FIXED IN THE TEMPLATE ONLY.**
  Multi-select upload order was the order files finished decoding (measured: two
  PNGs picked "top, side" came back side-first, so captions attach to the wrong
  pictures); and a preview row found itself again by `dataUrl` string equality,
  so two copies of one picture edited and removed the same row. Both exist in
  `idea100-blade-01.html` and were NOT changed there -- it is not this bundle's
  file, students are in it, and the fix belongs in a bundle that owns it.

  **ONE THING TO DECIDE, AND THE GLOB WAS NOT CHANGED.** `_TEMPLATE.html` in
  that folder is a LIVE PUBLIC ROUTE at `/assignments/_TEMPLATE`.
  `src/lib/legacy/index.ts` builds `assignmentSlugs` from
  `import.meta.glob('./assignments/*.html')` and strips `.html` with no filter,
  and `src/routes/assignments/[slug]/+server.ts` reads no session -- both
  confirmed by reading. Nothing in `tests/` or `tools/` pins the assignment
  list, and the template is not in `COURSE_LAYOUT`, so it is linked from nowhere
  and reachable only by typing the URL.
  **The recommendation is to exclude it**, by narrowing the glob to
  `./assignments/[!_]*.html`, which makes a leading underscore mean "not a
  route" the way it does elsewhere and needs no allowlist to maintain. The
  reason is not secrecy -- the file holds placeholder text and no student data
  -- it is that a page reading "IDEA-000 / Assignment 00 / Placeholder prompt"
  on a public school domain reads as a broken assignment to anyone who finds it,
  including a crawler, and there is no way to tell them otherwise. **Accepting
  it as-is is also defensible** and costs nothing today.
  `src/lib/legacy/index.ts` is not this bundle's file, so it was left alone.

  **MEASURED.** svelte-check 0 errors / 37 warnings / 31-5-1, exactly baseline.
  Full suite: see the report. The template is 1575 lines against a target of
  about 1200; the overrun is the verbatim CSS (459 lines) plus the comments the
  template exists to carry, and compressing the CSS would have made it stop
  matching the assignments it was copied from.

  **NOT VERIFIED.** The template was never served through SvelteKit: no dev
  server request to `/assignments/_TEMPLATE`, so `rewriteLegacyLinks` and
  `injectVersionBadge` were not exercised over it and the favicon was not
  observed resolving (over `file://` its absolute `/IDEA/...` path 404s, which
  is expected and not a defect). No print pass. No import into IDEA Classroom,
  which is 0138's surface and does not exist on this branch. No width
  measurements; this is not an app route and `verify:browser` covers `/dev`
  only. `npm run verify:readme` deliberately not run: no route spec was added.
