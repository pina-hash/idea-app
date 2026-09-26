---
title: "Ledger 0310: land IDEA_HTML_ASSIGNMENT_AUTHORING.md 1.1 in docs/standards/, with its REGISTER.md row (`claude/upbeat-pascal-p9krgk`)"
date: 2026-09-26
branches: [claude/upbeat-pascal-p9krgk]
migrations: []
subsystems: [process, docs]
---

Ledger 0310 (`docs/prompt-ledger/entries/0310-html-assignment-authoring-standard.md`) landed
`docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md` version 1.1, the authoring companion to
`IDEA_HTML_ASSIGNMENT_SPEC.md` written across two claude.ai chats (1.0 on 2026-09-14 from the
IDEA100 IDEA-Blade documents, 1.1 on 2026-09-25 from the Rotation Survey and the Dogtag). Neither
version had ever reached `docs/standards/` or `REGISTER.md` on any ref before this bundle;
`tools/standards-sweep.py` reported it NEW on 2026-09-25. The file distinguishes itself from the
SPEC by owning what an AUTHOR does, in order, rather than what the subsystem is: folding a guide
into its graded assignment rather than posting it separately, permanent block ids, the rubric's
own generate-and-never-re-derive behaviour, what the sandbox refuses, the Gmail-compose-URL
workaround for `mailto:` on a managed Chrome and the `noopener` trap, fluid width at both ends,
the `.hx-frame` border's 2px scrollbar and the IntersectionObserver-probe-clipping and
ResizeObserver-callback traps added in 1.1, not building a compliance form, live checks as
mirrors rather than gates, handing in a non-image file (1.1), read-only/restore, both validators
plus a Chromium pass, and delivery (including that HTML item responses skip the whole-class
grading export and need their own SQL query, added in 1.1).

This is a docs-only bundle. No migration was written, permitted or claimed. Nothing under
`src/**`, `supabase/**` or `materials/**` was touched, and no other row in
`docs/standards/REGISTER.md` was changed beyond inserting the one new row directly below
`IDEA_HTML_ASSIGNMENT_SPEC.md`, per the prompt.

## What was done

- Duplicate checks first, against a freshly unshallowed, fetched tree: no
  `docs/prompt-ledger/entries/0310-*` and no `docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md`
  existed on any ref (`git log --all`).
- The session's working branch (`claude/upbeat-pascal-p9krgk`) was 151 commits behind
  `origin/main` with zero unique commits of its own, so it was fast-forwarded to
  `origin/main` (`0725e49a`) before anything else, rather than merged or rebased, since a
  fast-forward loses no work.
- `docs/prompt-ledger/entries/0310-html-assignment-authoring-standard.md` was committed and
  pushed first, per the prompt's step 0.5, before the standards file was written.
- `docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md` was written byte-for-byte from the fenced
  block in the prompt, header and changelog both stating 1.1.
- The one register row was inserted directly below the `IDEA_HTML_ASSIGNMENT_SPEC.md` row in
  `docs/standards/REGISTER.md`; no other row was touched.

## What was measured

- `npx svelte-kit sync && npx svelte-check`, run with `PUBLIC_SUPABASE_URL` and
  `PUBLIC_SUPABASE_ANON_KEY` exported first (this checkout has no `.env`, per the CLAUDE.md
  phantom-error trap): **0 errors, 37 warnings, in 20 files** -- the documented baseline, held.
  A docs-only change was not expected to move it and did not.
- `npx vitest run --no-file-parallelism tests/standards-version-header.test.ts`: 24 passed, 0
  failed, clean exit. This is the test the prompt named as the one automated check.
- `grep -c "—" docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md`: 0, as the prompt required.
- `npm run history:verify` (see below).

## Not verified

- Whether `integrate.yml` actually collects this branch into `origin/integration` within 15
  minutes of the push, and the confirmation-by-refetch step the prompt's closing section asks
  for, are pending as of this entry -- the branch has just been pushed and the workflow has not
  yet had time to run. Report on that separately once it has.
- No claim is made about anything in `src/**`, `supabase/**`, `materials/**` or production; none
  of them were touched or read for anything beyond the duplicate-check greps above.
