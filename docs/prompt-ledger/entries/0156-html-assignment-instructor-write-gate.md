# 0156 The instructor write gate for a ported HTML assignment, and the working copy it licenses

- Issued: 2026-09-11
- By: router chat
- Owns: `src/lib/classroom/html-assignment/**`, a new instructor-copy surface for schema-3
  items, the instructor-copy region of `ItemDetail.svelte` and the item route,
  `supabase/migrations/0199_*.sql`, `tests/db/html-assignment-instructor*`,
  `tests/html-assignment-instructor*`, `src/routes/dev/html-instructor/**`,
  `tools/browser-verify/routes/html-instructor*.mjs` and the generated regions of its
  README, `docs/prompt-ledger/entries/0156-*`, and its own `docs/history/` entry
- Migration permitted: exactly one. Claims: 0199. Highest on origin/integration at issue: 0198
- Status: pushed, NOT merged -- carries a migration
- Branch: claude/intelligent-bell-te9r2l
- Notes: GAP TWO FROM LEDGER 0154 IS CLOSED AT BOTH ENDS. `classroom_save_instructor_response`
  (0128) still carried the gate `0197` opened for the two student write functions: it read
  `classroom_assignment_specs`, raised 'This assignment has no interactive spec.' without a
  row, and gated on `textField|table|checklist` against a manifest's
  `text|longText|checkbox|radio|image|table` -- an overlap of ONE. 0154 measured that
  through the real RPC, correctly built nothing over it, and pinned the refusal as a probe
  written to be deleted. The probe is deleted, not inverted.
  `0199` gives that one function `0197`'s branch, calling `_classroom_html_manifest` and
  `_classroom_html_block` rather than reimplementing either: same signature, same table,
  same row shape, same answer-key functions, no deploy ordering. THE SPEC PATH IS PROVED
  UNCHANGED THE WAY THE WIDENING RULE ASKS -- 21 calls to the DEPLOYED function, the
  migration applied over the same database, 21 answers compared case for case with refusal
  text and refusal ORDER included, 0 differences, against 3 ported controls that flipped
  from refused to accepted so a no-op apply cannot pass. The six-type vocabulary is now
  stated in two functions and pinned EQUAL both ways: behaviourally on every suite run, and
  at apply time off the deployed `classroom_save_response`'s own `prosrc`. Paste trap
  checked two ways against a planted positive control: 0 and 0, control 1 and 1. NOT
  APPLIED.
  THE SURFACE IS `InstructorCopy.svelte` WITH THE OTHER ENGINE UNDER IT: same banner, same
  key row, same designate/undesignate sentences, every string imported from
  `assignment-spec.ts` rather than retyped. A manager on a schema-3 item now gets a WRITABLE
  frame stored against their own identity through 0128's RPC; the working copy REPLACES the
  read-only mount rather than joining it. `htmlInstructorAnswers` is a second prop for a
  second RPC writing a second table, never `htmlAnswers` reinterpreted for a manager.
  PHOTOGRAPHS ARE STILL IMPOSSIBLE AND NOW SAY SO: there is no instructor counterpart to
  `classroom_submission_files`, so the projection carries `saveResponse` alone, the three
  file transports on `HxAnswerTransports` became individually optional, and each absence
  settles a REFUSAL rather than dropping the message.
  THE READ-ONLY HALF WAS PROVED SEPARATELY AND MUTATION-PROVED: two mutants on the grading
  route (a write callback on its frame; a working-copy mount) each reddened exactly one
  assertion, restored byte-identical by md5 from a copy and never by `git checkout --`.
  RASTERIZED AND LOOKED AT, 1440 and 375, over the REAL ported document (IDEA100 Blade CAD
  01) -- which is what showed that the blade document paints its OWN global "Not saved"
  sentence on any failed acknowledgement, so the only sentence guaranteed to reach an
  instructor about photographs is the one in parent chrome.
  No `classroom-updates.json` entry: nothing a student sees changes.
