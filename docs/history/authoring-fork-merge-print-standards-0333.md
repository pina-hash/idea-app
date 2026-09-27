---
title: "Ledger 0333: merge the HTML authoring 1.1 fork as 1.2, land print standards 1.1 and the register"
date: "2026-09-27"
branches: ["claude/upbeat-pascal-p9krgk"]
migrations: []
subsystems: ["docs/standards"]
---

Docs-only bundle. Landed `docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md` at 1.2,
`docs/standards/IDEA_PRINT_STANDARDS.md` at 1.1, and the two corresponding rows in
`docs/standards/REGISTER.md`.

## The fork this bundle resolves

Ledger 0299 (2026-09-25) was handed a prompt claiming `IDEA_HTML_ASSIGNMENT_AUTHORING.md`
did not yet exist on `origin/main`. That premise was already false at 0299's own audit
step: a separate session had landed a different 1.1 of the same file at commit `f5a4b033`
("Land IDEA_HTML_ASSIGNMENT_AUTHORING.md 1.1 in docs/standards/"), written from the
IDEA100 Rotation Survey and Dogtag documents. 0299's own attached 1.1 was written from a
different pair of documents (the IDEA209H Unit 2 and FRC5669 Shop Trophy work) and carried
different additions. Two chats had independently minted the version number 1.1 dated
2026-09-25 for genuinely different, non-overlapping content. 0299 correctly stopped rather
than guessing which one should stand, and made no changes to `docs/standards/`.

This ledger (0333) was issued with a merged file already reconciling the two: version 1.2,
built on the landed 1.1 (`f5a4b033`) as the base, with the unlanded chat's own additions
folded in as new material rather than as a competing rewrite.

## What the audit proved before anything was copied

1. `origin/main`'s `IDEA_HTML_ASSIGNMENT_AUTHORING.md` header read exactly
   "**Version 1.1 - 2026-09-25**" and its last touching commit was `f5a4b033`;
   `IDEA_PRINT_STANDARDS.md`'s header read exactly "**Version 1.0 - 2026-08-10**". Matched
   the prompt's expectation.
2. The three attached files' sha256 prefixes matched the prompt's stated values exactly
   (`38c6b9f2b8fa`, `f652bf169da9`, `32780080e106`).
3. A script diffed every line of `origin/main`'s AUTHORING file (359 lines) against the
   attached 1.2 (419 lines) and found exactly two lines from main missing verbatim in the
   attached file: the header line (`**Version 1.1 - 2026-09-25**`, correctly rewritten to
   1.2's header) and the line ending "Measured 2026-09-22 on the IDEA100 Rotation Survey."
   (rewritten in place, per the prompt, to add the probe-overflow measurement). No other
   line of the landed 1.1 was lost, reworded or reordered.
4. A diff of the attached `REGISTER.md` against `origin/main`'s showed exactly two changed
   rows: PRINT (1.0 to 1.1, dated 2026-09-04) and AUTHORING (1.1 to 1.2, dated 2026-09-27,
   `Owns` text extended to name the four things 1.2 adds). No other row moved.

All four gates passed, so the three files were copied into `docs/standards/` verbatim and
committed as one commit.

## What 1.2 actually adds over the landed 1.1

Per its own changelog: section 7 gains probe arrays over a single `IntersectionObserver`
and the probe-count formula; section 10 gains the parent's re-echo of `idea:state` after
every `idea:change` and the rule to never trim a value before sending it (the defect that
turned "Char on two slot edges" into "Charontwoslotedges" in a live IDEA209H document on
2026-09-23); section 11 gains a step 7 requiring an echoing harness that types multi-word
text; a new section 11b covers media and the 2 MB document cap. Nothing from the landed
1.1 (the probe-clipping rule, the follow-the-reader element, the ResizeObserver caution,
section 9b on non-picture hand-ins, or the grading-export note) was removed or reworded.

## Ledger bookkeeping

`docs/prompt-ledger/entries/0299-*`'s Status line was changed to "superseded by 0333" and
a note added pointing at this entry, per this bundle's own `Owns` line. No other line of
0299 was touched.

## Not verified by this bundle

No migration, no `src/`, no `supabase/`, no `materials/` change. `npm test`'s full summary
line is reported in the session's own final message rather than copied into this file a
second time; the one test this bundle's diff can affect is
`tests/standards-version-header.test.ts`, which checks a mirrored file's header against
its own newest changelog entry.
