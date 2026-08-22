# IDEA Verification Standards, Pending Additions
**Version 1.2 - 2026-08-21**

**Staging file.**

**This is not a standards document.** It holds rules earned between 2026-08-19 and 2026-08-21 that belong in `IDEA_VERIFICATION_STANDARDS.md` and could not be merged, because the authoring copy of that document was not available and rebuilding a standards file from search results is the failure these rules exist to prevent. Cite these as you would cite the real thing. When they merge upstream, this file is deleted rather than kept in sync.

Every rule below has a dated failure behind it, and in every case the failure was invisible to types, invisible to review, and green in the suite.

---

## 1. A fixture the system under test cannot produce proves nothing, and it proves it silently

A hand-written input that violates the real producer's schema exercises whatever branch happens to match it, passes, and reports coverage of a path no real input will ever take.

Capture fixtures from the real producer, or generate them from the producer's schema. Where a transform sits behind a schema-bound editor, the fixture comes out of that editor. Then assert the impossible shape is impossible: a test that can no longer construct its old input is the proof the old test was fiction.

**Evidence.** Two nested-list tests, in two subsystems, passed for two releases against a document shape ProseMirror cannot emit, while the shape it does emit concatenated six bullets into one unreadable string and destroyed a real notebook entry with no recovery. A third copy of the same fixture was found in a third file afterwards, and a fourth in a file created one hour earlier by a bundle that had just been told about the rule.

## 2. A branch no real input can reach is not a safeguard, it is a description of one

Unreachable code reads as handling, so the reviewer stops looking and the real input falls through to whatever sits below it. When a branch tests for a node type, check what the schema actually puts there before trusting that the branch fires.

**Evidence.** The nested-list branch tested the children of a list node for a list. Under the schema those children are always list items, so the branch was dead, and the content fell through to a text collector that joined it across item boundaries. Worse, the branch handled the impossible fixture *correctly*, so the test passed for a reason that was true and irrelevant.

## 3. The schema is a module the producer and the fixtures both import

Preventing fixture drift by remembering to check is not a control. Extract the schema options into one module, have the editor and the test files both read it, and build fixtures through it. Then a fixture that disagrees with the producer will not compile.

**Evidence.** The fix for rules 1 and 2 was structural rather than diligent, and it is the reason the same defect cannot recur in either subsystem.

## 4. A sweep that tests an outcome cannot test the mechanism

Where more than one mechanism produces the same clean result, an outcome assertion passes under all of them. Test the mechanism by name, separately, and expect the outcome sweep to stay green while it is broken.

**Evidence.** With edge-flipping disabled entirely, a containment sweep over tooltip positions still passed, because the clamp keeps panels on screen either way. Three named tests caught it; the sweep never would have. This shape applies to any check written as "nothing is off screen," "no row is visible," or "the total is right."

## 5. An earlier layer can block a test case, and the result looks identical to a passing test of the later one

A case aimed at a validator may never reach it, because a parser, a route guard, or a type refused it first. The test goes green and asserts nothing.

**Evidence.** A `javascript:alert(1)` case written to prove an image-source resolver refuses dangerous schemes never parsed as figure syntax at all, because the string contains a closing parenthesis. It was rewritten paren-free, and the parenthesis behaviour pinned as its own separate test at the layer that actually owns it.

## 6. A mutation that reddens zero tests is a failure of the proof until the mutation is shown to have applied

A mutation that never landed is indistinguishable from a mutation nothing catches, and it is the more likely of the two. A harness that edits source by pattern proves the pattern matched, by a grep and by a changed hash, before anyone is allowed to read the result. Treat a zero as an error of the harness, not as a finding about the code.

**Evidence.** Three mutations reported zero reddened. All three were the pattern missing against a file with different line endings. In a different bundle, a mutation restore silently failed because an empty replacement could not be located, and the file had to be restored by hand.

Restores are verified byte-identical by hash, not by eye, and re-run green before the next mutation is applied.

## 7. A parser over computed styles silently skips the syntaxes it does not know

Reading colours out of a live document with a regular expression will quietly miss any form the expression was not written for, and report the value from further up the tree as though it were the ground. The measurement then looks precise and is wrong.

Resolve every colour through the browser itself: paint it to a canvas and read the pixel back. Then every syntax the browser accepts is a syntax the measurement accepts.

**Evidence.** A caption's contrast was first measured against the page base rather than the callout fill it actually composites over, because the fill was written as `color(srgb …)` and the extractor skipped it without error. The corrected measurement moved the figure by more than a point of ratio.

## 8. An oracle drawn from a different system than the code under test catches what hand-written assertions cannot

Where the expected value can be computed by something other than the implementation, compute it there. A hand-written expectation encodes the author's belief about the code; an oracle encodes the question the code is supposed to answer.

**Evidence.** Of three mutations against a notebook filter predicate, the third added a plausible extra condition and passed every named assertion in the file. It was caught only by the test that asked Postgres the same question directly and compared whole results. That is the difference between an oracle that is load-bearing and one that is decorative.

A mirror of a database function is compared against the function, never against its description. A TypeScript plain-text projection and its SQL counterpart were assumed to agree for months; the SQL ends in `btrim`, which strips spaces only, while the mirror called `trim()`. Nothing could observe the difference until a document arrived whose first line was empty, at which point the two answered differently about content the stream and the export both read. Twenty-three documents run against the real function found it; no amount of reading either one would have.

## 9. Mutate to the rejected alternative, not only to a broken version

A suite that reddens under obvious breakage can still be silent about the design you deliberately did not choose, and that design is the one a future session will refactor toward, because it looks simpler and nothing stops it. After the mutations that break the code, apply one more that turns it into the alternative you rejected, and require that it reddens too.

**Evidence.** An entry-title resolver was fixed by splitting a step in two rather than by filtering it. Mutating to the rejected design, filter and drop the second step, reddened three tests, and a *different* three from the ones the permissive mutation reddened. That difference is the proof the suite encodes the decision and not merely the behaviour. Had it reddened nothing, the tests would have been indifferent between two designs with visibly different consequences for four surfaces.

## 10. Verify against the artifact, not the source

The compiler can delete what you wrote. A rule present in a component's style block is not a rule present in the served stylesheet, and nothing will tell you: no error, no warning, no type failure. Where a claim depends on a rule existing at runtime, read it back out of what was actually served and prove it takes effect.

**Evidence.** Svelte's CSS pruner silently dropped a component-scoped `::after` from the compiled output while keeping the `::after`-less rule beside it. It carried the hit area for a set of controls, so a target-size sweep would have measured the source as compliant and the page as not. It was found by fetching the served stylesheet and hit-testing, and the fix was to move the mechanism to a global class the pruner cannot reach.

## 11. A harness that mounts a subset silently measures a subset

A sweep reports what it found, not what exists. If the harness renders eight of eleven cases, every case passes, coverage reads as total, and the three that never mounted are exactly the ones nobody has looked at. Assert the denominator: a sweep states how many cases it expected and fails when it finds fewer.

**Evidence.** Three of eleven launcher cards are admin-only and never mount without an explicit flag on the harness route. A contrast sweep over "every card" would have measured eight, passed, and reported the set complete.

## 12. An environment limit found during verification is recorded where the next session will hit it

A constraint discovered by burning an hour is worth exactly one line in the file the next agent reads first. Left in a report, it will be rediscovered at the same price.

**Evidence, all found this week, all now known:** the browser pane does not composite, so no screenshot and no coordinate input; `requestAnimationFrame` never fires and `document.hidden` is true, so anything waiting on a frame cannot be driven; keyboard events dispatched through it do not reach a ProseMirror keymap, so editor key handling cannot be exercised there; print media cannot be emulated, so a print check reads the authored rules out of the live stylesheet and applies them to the live DOM instead; `loading="lazy"` never requests, so lazy images must be forced eager before measurement; and the clipboard refuses `readText` unfocused.

---

## Note on scope

Rules 1 through 3 form one lesson and should probably merge as one clause with three parts. Rules 4, 5 and 8 are all about an assertion that passes without touching the thing it names, and may read better together than apart. Rules 6, 7, 10, 11 and 12 are about the harness and the environment rather than about the tests, and belong wherever the existing document keeps verify-the-verifier. Rule 9 sits with the mutation discipline rather than with the others.

---

## Changelog

- **1.2 (2026-08-21)** - Rule 10 added, on verifying against the artifact rather than the source, after Svelte's CSS pruner silently dropped a component-scoped `::after` from the compiled stylesheet while keeping the plain rule beside it, with no error and no warning anywhere. That rule carried the hit area for a set of controls, so a sweep reading the source would have called the page compliant while the served page was not. Later rules renumbered.

- **1.1 (2026-08-21)** - Rule 10 added, on a harness that mounts a subset silently measuring a subset, after three of eleven launcher cards were found to require a flag before they render at all: a sweep over every card would have measured eight and reported the set complete. The remedy is asserting the denominator rather than trusting the sweep. Rule 8 gained a second piece of evidence: a TypeScript plain-text projection and its SQL counterpart were assumed to agree for months while one ended in `btrim` and the other called `trim()`, a difference nothing could observe until a document arrived with an empty first line, and one that no amount of reading either implementation would have surfaced.

- **1.0 (2026-08-21)** - Created as a staging file after nine rules accumulated against a standards document that was not available to author against, and rebuilding that document from search results would have repeated the stale-base failure these rules exist to prevent. Rule 9 added in the same pass, on mutating to the rejected alternative rather than only to a broken version, after a title-resolver mutation set showed the rejected design reddening a different three tests than the permissive one. Carries a version header and a changelog because the repo's standards sweep globs this directory rather than enumerating it, and exempting the first new file it caught would have retired that check on its first real case.
