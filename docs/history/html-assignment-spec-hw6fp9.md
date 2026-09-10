---
title: "Prompt 0136: the HTML-assignment contract becomes a mirrored standard, corrected from the tree -- `event.origin` is `\"null\"`, the CSP eats all three typefaces, and three of the prompt's own claims did not survive the source (`claude/html-assignment-spec-hw6fp9`, no migration)"
date: 2026-09-10
branches: [claude/html-assignment-spec-hw6fp9]
migrations: []
subsystems: ["Standards", "HTML assignments", "Classroom", "Security boundary", "Rubrics"]
---

The HTML-assignment subsystem was specified in a chat document that was never
mirrored. Five lanes shipped against it (ledgers 0126, 0127, 0128, 0129, 0134)
and two migrations were applied (0195, 0196), and `docs/standards/` had no entry
for any of it -- so the only surviving statements of the contract were the chat
copy, which is wrong in three measured places, and roughly four thousand lines of
source comments that are correct and unfindable.

This bundle writes `docs/standards/IDEA_HTML_ASSIGNMENT_SPEC.md` at version 1.0,
from the tree, and registers it. No source file, no migration, no test.

## What the document covers

Fifteen sections in `IDEA_MAPS_SPEC.md`'s house shape: what an HTML assignment is
and how it differs from a `schemaVersion: 1` spec; the manifest schema as it
actually exists in `manifest.ts`; the security boundary and why `allow-scripts`
without `allow-same-origin` is the whole model; the bridge protocol as it exists
in `bridge.ts`; what the sandbox costs; where each artifact is stored; the write
gate; validation at import; how an existing document is ported; the recorded
conflicts; verification; deployment; and what is deliberately undecided.

## The three corrections it carries, and what each one costs

**1. `event.origin` from a correctly sandboxed frame is the literal string
`"null"`.** Measured by ledger 0126. The contract said to validate `event.origin`
against the document origin; implemented as a literal comparison against
`https://sandbox.ideabosco.com`, that drops every real message and the feature is
inert with no error anywhere -- the sandbox the contract itself mandates is
exactly what makes the origin opaque, and `postMessage` serialises an opaque
origin to `"null"`. `hxExpectedOrigin` derives the expectation FROM the sandbox
flags instead, so the check is still real in both directions and cannot drift if
anybody ever weakens the sandbox. **This is the correction that matters most,
because its failure mode is silence.**

**2. The CSP as originally written refuses all three IDEA typefaces.**
`style-src 'unsafe-inline'` carries no host, so the `@import` of Google Fonts is
refused by name, and there is no `font-src` at all, so the font files would fall
to `default-src 'none'` even if the sheet loaded. Both halves have to move;
fixing either alone changes nothing. **This is still OPEN on the tree** -- the
CSP in `src/routes/hx/_headers.ts` has neither -- and the document says so and
names the `/_platform/fonts.css` shape as the fix, including why
`access-control-allow-origin: *` is load-bearing rather than decorative.

**3. The CSP carried no `sandbox` directive**, so a DIRECT navigation to `/hx/`
was not placed in an opaque origin the way a framed one is. Found by 0126,
closed by 0134 with `sandbox allow-scripts` built from `HX_SANDBOX_FLAGS` and
proved by direct navigation with a cookie planted on the serving origin.

## The five further findings it now carries

Images did not round-trip (`idea:image` was add-only, `idea:state` could not
return one, and module 04 of the Blade port is 10 of 50 points); a table is ONE
block whose value is structured JSON, not N per-cell fields, which is what
`addMfgRow()` minting `mfg-06-p` at runtime exposed; the manifest needs top-level
`header` blocks, because without them 0128 had to invent a 0-point module that
would have rendered in the grading console as something to score; block ids are
`^[A-Za-z0-9_-]{1,40}$` from migration 0086 and the contract never said so, which
cost a port 63 dotted ids; and the write gate.

## Three places the prompt was wrong and the tree won

The prompt was explicit that it was a pointer and that the tree wins. It did,
three times.

**The font correction is ledger 0128's, not 0126's.** The prompt attributes it to
0126. The measurement is in `docs/history/html-assignment-manifest-contract-8xazmp.md`,
which is the port-fixture lane's entry -- 714.56px for each of Rajdhani, Orbitron
and Share Tech Mono against a 714.56px unknown-family baseline and 838.06px for
an installed family. 0126's entry mentions fonts only as a browser-harness
limitation (`fonts.googleapis.com` blocked on both runs, so text is measured in
the fallback stack), which is a different fact about a different instrument.

**The sandbox-directive correction belongs to two lanes, not one.** The prompt
credits 0134. 0126 MEASURED the absence and deliberately did not patch it -- its
own ledger lists it as contract deviation 2, "Not added; reported for the
contract owner" -- and 0134 added it and proved it. The document credits both,
because "who found it" and "who closed it" are different questions and this
subsystem's whole history is lanes reporting rather than working around.

**"Nothing in the database refuses the shape the standard forbids" is half
right, and the half that is wrong is the actionable half.** The prompt says the
no-half-points rule lives only in client validation. What ledger 0129 measured is
that `classroom_set_rubric` / `_classroom_check_levels` (0095) accepts a level
worth 0.5 -- `numeric` column, `jsonb_typeof` satisfied, `2 > 0.5 > 0` descends
strictly. But `_classroom_check_html_manifest` (0195) REFUSES a fractional level,
on every level, with `(...)::numeric <> floor((...)::numeric)`, and 0195's own
apply-time self-check constructs a 1-point three-level criterion and raises if
the checker accepts it. So the rule IS in SQL on the MANIFEST path, in both
halves, and is absent only on the RUBRIC-STORE path -- which is the path the
derived rubric a ported document writes actually goes down. Section 12.3 states
it that way, because "add it to SQL" and "it is already in SQL at import and
missing at the store" lead to different work.

## The write gate, as it stands on this tree

**Migration 0197 is not present.** `supabase/migrations/` tops out at 0196, and
the document names the tree it was read at (`origin/integration` `b2581959`) and
says a concurrent lane may supersede the section.

`classroom_save_response` (0086, last replaced in 0128) is still the only
function writing `classroom_responses`, and refuses a ported assignment three
independent ways: it reads `classroom_assignment_specs` and raises without one;
it resolves the block id inside that spec; and its type gate accepts `textField`,
`table`, `checklist` against manifest types `text`, `longText`, `checkbox`,
`radio`, `image`, `table`. **The overlap of one is the half worth writing down,
because it is what makes "give the item a companion spec" not a repair either:**
even with a spec row present and the ids duplicated into it, five of the six
manifest block types are still refused. `classroom_add_submission_file` carries
the identical gate.

The document records that the feature is INERT ON PURPOSE and that inertness is
structural: `createHtmlAnswerTransports` exists in `transports.ts` with no
caller, no route supplies `htmlAssignmentTransports`, and the item page hands
`htmlAssignment` down but no `htmlAnswers` controller -- so a schema-3 item
renders its real document read-only, and a worksheet that takes typing and saves
nothing is not reachable.

## The conflict it records and does not resolve

`IDEA_RUBRIC_STANDARDS` requires three or four levels and never two, and requires
the top level to equal the maximum with the bottom at 0. **A 1-point criterion is
therefore unrepresentable**: its only three-level shape is `1 / 0.5 / 0`, and
both halves of the importer refuse a fractional level. Section 12.2 names all
three candidate resolutions with their costs -- merge into a sibling, permit two
levels at 1 point, permit half points -- and points at
`docs/decisions/entries/22-a-one-point-leveled-criterion-is-unrepresentable.md`,
`Status: open`. It takes no position, and says so.

**A smaller citation correction went in beside it.** Decision 22 cites the rubric
standard as "`IDEA_RUBRIC_STANDARDS.md` 1.3" and ledger 0128 as "1.2". Those are
VERSION numbers: that document's sections are named, not numbered, and `1.3` is
the header version. It is the trap `CLAUDE.md` already records for
`IDEA_INTERFACE_STANDARDS` ("its sections are integers and everything with a
decimal point in it is a CHANGELOG VERSION"), in a second document. This
specification cites it as `Criterion Structure > Rules` and says why.

## What was measured

- **Every backticked name in the document swept against the tree before commit**:
  52 exported symbols, 29 file paths and the browser-verify route names, all
  present. This is the checkable half `tools/claude-md-check.mjs` enforces for
  `CLAUDE.md`; there is no equivalent sweep for `docs/standards/`, so it was run
  by hand.
- **The file is pure ASCII.** Zero em dashes, en dashes or curly quotes
  (checked by codepoint, not by regex over a few characters).
- **`tests/standards-version-header.test.ts`** was run before the register row
  and failed on exactly one assertion -- "has a version header but no row in
  `REGISTER.md` naming it" -- which is the positive control that the row was
  genuinely needed, and passes after it.
- **Full suite: see the ledger entry.** Baseline 368 files / 7314 tests.

## What was NOT verified

- **No source file, migration, harness or browser pass.** This lane writes
  documentation. Every measurement quoted in the document is attributed to the
  lane that took it, and none was re-taken here.
- **Nothing against the live Supabase project.** The local `.env` names a
  placeholder project and this container cannot reach production, so every SQL
  claim in the document is read off the committed migration files and off the
  db-harness tests that exercise them.
- **`npm run verify:readme` was deliberately not run.** No route spec was added,
  and a fifteen-minute pass while two lanes are moving is the collision this repo
  has paid for repeatedly.
- **`svelte-check` carries no baseline claim here.** No file under `src/` was
  touched, so the 0 errors / 37 warnings figure is neither asserted nor
  re-measured.
- **Whether the font gap of section 6.3 is still open** was read off
  `src/routes/hx/_headers.ts` on this tree and not re-measured in a browser. The
  browser harness could not see it either way: it blocks every non-loopback
  request, so text is measured in the fallback stack there regardless of the CSP.

## Deferred

- **A `docs/standards/` name sweep.** The by-hand check above is what
  `tools/claude-md-check.mjs` does for `CLAUDE.md`, and this directory has
  nothing equivalent. Several standards files name repository symbols; a stale
  one fails silently, which is the argument that file's own header makes for
  itself. It is a tool, not a line, and belongs in its own bundle.
- **The font fix.** Named in the document as an open item with the shape of the
  answer; it is `src/routes/hx/_headers.ts` plus a serving route, and both are
  another lane's files.
