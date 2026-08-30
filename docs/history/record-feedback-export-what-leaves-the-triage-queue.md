---
title: "Feedback export: what leaves the triage queue"
date: 2026-08-21
branches: []
migrations: []
subsystems: ["FRC / FSP / feedback"]
record_order: 98
---

**Subsystem:** feedback (`src/lib/feedback/*`, `src/lib/classroom/FeedbackConsole.svelte`).
**Code only. No migration, no RPC signature change, no new grant.**

The queue's export was written to prove that filtering happened before exporting.
It did that, and then the bundles went into use, where a different set of
problems showed up: fields that were captured but never printed, fields printed
whether or not they said anything, a paragraph of build provenance repeated under
every report, and a section id shown raw in the position a course name occupies.

### What changed, and why each one

1. **The app, the route id, and the path -- the path only when it differs.**
   The bundle never carried `row.app` at all. It carried the route in the entry
   heading and the path nowhere. Both are now facts on the entry, and the path is
   suppressed when it is the same string as the route id, which on an
   unparameterised route it always is. Printing both trains the reader to skip the
   line on exactly the routes where they differ (which student, which item, which
   section), so the field earns its place by being absent most of the time.
   `rowDistinctPath` is the ONE implementation of that comparison and the console's
   own row list reads it too -- it had its own unconditional `{#if rowPath(row)}`,
   which is two answers to one question.

2. **The user agent, captured at file time.** THE ONLY CAPTURE CHANGE in this
   bundle. `captureMeta` stores the FULL string verbatim; `summarizeUserAgent`
   (in `context.ts`, beside the capture, one implementation) reduces it to
   `Chrome 126 on Windows` for the markdown and for the queue's row list. The full
   string rides the JSON. Summarising at capture time would throw away the half
   that turns out to matter -- an in-app webview, an OS build -- and a summary can
   be recomputed from a string forever while the reverse is not true. Order in the
   matcher is load-bearing: every Chromium fork carries "Chrome" and Chrome
   carries "Safari", and iPadOS reports itself as a Mac. Major version only,
   uniformly, so two rows are comparable. An unrecognised string says
   "unrecognised browser" rather than guessing.
   **The student-facing copy on the box was updated in the same change** -- it
   listed what is attached automatically and would otherwise have been quietly
   incomplete about a new field -- and the classroom log carries an entry saying so.

3. **The section id resolved to its course and period, AT EXPORT TIME.**
   `resolveSectionId` asks `curriculum.ts`, so a course renamed after a report was
   filed exports under the name it has today and no stored copy can go stale. The
   raw id survives beside the resolution, so the value is still greppable against
   the database. An id that does not resolve is NAMED as unresolved rather than
   printed bare: a bare slug in the position a course name occupies reads as a
   course nobody has heard of rather than as a section that was retired or
   mistyped. **`period` is the registry's `term`** (T1 / T2 / T3 / S1 / Summer) --
   `curriculum.ts` has no field called `period`, and this is that field under the
   word the export uses, not a second source for it.

4. **The correlation id on its own line, at the top of the entry.** It is the only
   field in a report that leads anywhere else: it is what joins the report to the
   server log line `handleError` wrote. Set among a dozen bullets it read as one
   more attribute of the page, and the join never got made.

5. **The build identifier's meaning stated once, in the header.** The words exist
   because neither available identifier is a hash of the built artifact, which is
   what a bare hex string gets mistaken for. They do not have to be under every
   report: the header carries one line per SOURCE PRESENT, and the per-report line
   keeps the value and which kind it is (`a1b2c3d (git-commit)`). On a
   six-report bundle that is one paragraph instead of six.

6. **Grouped by route above five reports, flat at or below.** A flat list of four
   is read straight through and grouping it only puts headings between single
   entries. Past that the useful question stops being "what did each person say"
   and becomes "which page is generating these". Groups carry a count and are
   ordered count descending, **tiebroken on route id ascending** -- without the
   tiebreak two exports of one set can order two equal groups differently and a
   bundle stops being diffable against the one taken an hour earlier.

7. **Submitter identity is a toggle, defaulting to included.** Knowing who to go
   and ask is most of what makes a report actionable, so the default does not
   change. A bundle pasted into a chat window does not always need student names
   attached, and that is a decision worth taking BEFORE the paste rather than
   noticing afterwards. Both exports honour it; both STATE which way it was set,
   so a bundle with no names cannot be read as a bundle from nobody. The JSON
   blanks `submitter_name` and `submitter_email` and leaves every other field
   verbatim.

**A multi-line message cannot break the structure.** Every line goes inside one
blockquote, so no line of it can be a document-level block. On top of that, a
leading `#` or `>` is escaped, and so is a line that is NOTHING BUT a run of
`-`, `=`, `_` or `*` -- a rule of dashes after a line of prose is a SETEXT
HEADING, so a pasted trace silently promotes the sentence above it. A leading `-`
with words after it is left alone, because that is a bullet the person typed.
The failure this prevents is not an untidy bundle: an unescaped `###` closes the
entry it sits in and the NEXT report's fields read as part of that message.

**The JSON gained two lookups BESIDE the rows, not fields inside them**
(`sections`, `buildIdentifiers`), so a row still reads exactly as it is stored.
The one thing that edits a row is withholding the submitter, which is the point
of the toggle.

### Measured

- **`npx svelte-check`: 0 errors, 36 warnings** (the baseline, unchanged).
  `npx svelte-kit sync` was needed first -- the generated route types were stale
  and reported three phantom errors under `src/routes/dev/feedback`.
- **`npx vitest run --no-file-parallelism`: 72 files, 1812 passing.**
- **21 new assertions in `tests/feedback-coverage.test.ts`** over fixtures
  covering an empty set, one report, six reports across three routes, a report
  with an error id, a multi-line message, and an unresolvable section. The
  grouping threshold is asserted BOTH WAYS on the same fixture minus one row.
  Expected values for the section case are read off the real `curriculum.ts`
  entry (`eng1h-junior`), never recomputed with the resolver.
- **MUTATION PROOF, 15 mutations, each verified APPLIED (md5 changed) before its
  result was read and restored byte-identically afterwards (md5 back to the
  original), with a zero treated as a failure of the proof rather than a pass.**
  All 15 reddened between 1 and 2 assertions. Baseline before mutating: 0 failed
  of 66. Final after restoring: 0 failed of 66.
  Two of them failed the proof on the first run and were real gaps, not script
  bugs: **group ordering by count was uncovered** (the six-report fixture happens
  to arrive largest-group-first, so a bucketer that simply kept insertion order
  passed), fixed by adding a fixture that arrives smallest-first plus a tiebreak
  case; and one mutation's own pattern was malformed and never applied, which the
  "verified applied" check is what caught.
- **Driven end to end in the Browser pane through `/dev/feedback`**, which mounts
  the REAL SiteFeedback, FeedbackBox and FeedbackConsole against one in-memory
  sink. A report was filed from the real box with a multi-line message containing
  `###`, `---` and `>`; the captured meta carried
  `userAgent: "Mozilla/5.0 (Windows NT 10.0 ...) Chrome/148 ..."` beside
  `viewport: 1280x720`. The console row showed `Chrome 148 on Windows` and
  `section s-1 (unresolved: not a known section id, shown as filed)`, and showed
  NO path line (route and path were the same string). The identity checkbox
  measured **44x44** and carries the visible words "Include submitter names".
  The exported markdown was captured by intercepting `URL.createObjectURL`:
  with the box ticked it carried `- from: Harness User`, unticked it carried the
  withheld header and no `- from:` line, and in both the message came out as
  `> \### Not a heading` / `> \---` / `> \> and this came out of the box`.

### NOT VERIFIED, and why

- **The live Supabase project.** The local `.env` is the placeholder
  (`example-ref`). Nothing here ships SQL, changes an RPC signature, or needs a
  grant: `meta` is free-form jsonb and a new key needs no migration.
- **Real rows filed before this change.** They have no `userAgent`, which renders
  as nothing rather than as "unknown" everywhere; asserted on a fixture, not
  against production data.
- **Screenshots.** The Browser pane does not composite. Every claim above is a
  measured DOM, geometry or captured-blob read.
- **Every browser in the summariser's table.** Only the two real strings in the
  test and the Electron-based Chrome string the pane itself reports were driven;
  the rest are pattern-matched against strings written from the published formats.

**Undoing it:** revert the changed files. There is no migration and nothing
applied. A revert of `console.ts` alone would leave `FeedbackConsole.svelte`
importing `rowDistinctPath`, `rowUserAgentSummary` and `resolveSectionId`, which
would no longer exist -- revert the component with it.

---

