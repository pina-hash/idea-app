# IDEA Verification Standards
**Version 2.2 - 2026-08-30**

**This is the verification standard. It is not staging, and there is no upstream file.**

Until 2026-08-25 this document described itself as a staging file holding rules that belonged in `IDEA_VERIFICATION_STANDARDS.md`, which "could not be merged because the authoring copy of that document was not available." That framing was wrong in the way this project has now seen twice. `IDEA_VERIFICATION_STANDARDS.md` has never existed: it is not in project knowledge, not in Drive Library A, not in Drive Library B, and `IDEA_INTERFACE_STANDARDS.md` 2.10 and `IDEA_CLAUDE_DESIGN_STANDARDS.md` 2.0 both record it as a name that was cited into being and never written. An unavailable file and a nonexistent one are the same on the shelf and opposite in what they license: waiting is correct for the first and is indefinite deferral for the second, and a document that calls itself provisional invites a session to treat its rules as provisional too.

So the deferral is closed rather than restated. This file is the owning document for verification discipline across every IDEA and FRC surface. Cite it directly. Nothing is pending, nothing merges upstream, and no session should go looking for a fuller version of it.

This is the same finding as the `IDEA_Design_System.md` retirement on the same date, reached from the other end: there, six documents routed to a file nobody could open; here, one document deferred to a file nobody ever wrote.

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

**Evidence, all found this week, all now known:** the browser pane does not composite, so no screenshot and no coordinate input; `requestAnimationFrame` never fires and `document.hidden` is true, so anything waiting on a frame cannot be driven; keyboard events dispatched through it do not reach a ProseMirror keymap, so editor key handling cannot be exercised there; print media cannot be emulated, so a print check reads the authored rules out of the live stylesheet and applies them to the live DOM instead; `loading="lazy"` never requests, so lazy images must be forced eager before measurement; and the clipboard refuses `readText` unfocused. **Two more, both of which corrupt a measurement silently rather than failing:** `git stash` does not reach the served bundle, because Vite does not invalidate the module, so a stashed baseline can measure the changed stylesheet and understate a diff with no error anywhere; a bare class selector reaches unrelated components, because Svelte scopes the style rather than the class, so `querySelector('.sep')` returned an element from a different component and reported an opacity the measured one did not have, a trap that later paid twice on live pages at four `.sep` matches of which two were the owning component's and seven `.dot` matches of which two were; and **`IntersectionObserver` never fires in this pane at all**, confirmed by scrolling every launcher card through the viewport centre and re-reading an unchanged `opacity: 0`, which had silently dropped the entire launcher from a sweep's denominator.

## 13. A sweep reports how many candidates it visited, or its zero is not a finding

A sweep that returns no failures has made two claims, and only one of them is usually checked. The second is that it looked. **A count of the population it traversed is reported beside the count of failures**, and a zero without a denominator is treated as a broken sweep rather than a clean result, because a clean result is the one nobody investigates. The same discipline runs the other way: **a sweep that forces a condition onto the DOM to measure it reports what it forced**, since a condition applied to a selector that is not unique measures unrelated components, and a state class dropped from a selector measures a state that never occurs.

**Evidence.** A contrast sweep over rules putting muted ink on a wash reported **zero failures over a document holding seventeen such rules**, because `CSSStyleRule` now carries a `cssRules` property for CSS Nesting and an empty `CSSRuleList` is truthy, so the ordinary `if (r.cssRules) { walk(); continue; }` treated every plain rule as a grouping rule and skipped it. It was the third of four attempts on the same question. The first forced a wash onto base selectors that are not unique across components and reported **47 failures of which 46 were artefacts**. The fourth dropped the state class from the selector and flagged a rule that was in fact the precedent the fix was following. The true answer was one rule. A fifth trap sits alongside: `iframe.contentDocument` captured at `onload` keeps measuring a document the iframe has already replaced, and a stylesheet that arrives late in a dev server is absent from the CSSOM at the moment a sweep would read it.

## 14. A sweep that knows which failures not to mention cannot be audited

When a sweep holds different elements to different bars, **it reports every candidate with its measured value and the bar it was held to**, and it never removes a candidate from its own output. An exemption written into the sweep is invisible to the next reader, who has no way to tell a rule that was considered and justified from one that was quietly convenient. The bar belongs in a column, not in a filter.

**Evidence.** A contrast sweep applying a flat 4.5:1 ended a pass with two remaining failures, a separator glyph at 3.38 and a bullet at 3.72, both non-text decoration whose real bar is 3:1 and both therefore passing. The session left them in the output as failures rather than teaching the sweep to skip them, and said so. The alternative was a sweep that would have reported clean while carrying two hand-placed exemptions no later reader could see, on the same surface where a different sweep had already reported clean over seventeen rules it never visited.

## 15. A before-and-after comparison starts from a state both runs can reach identically, and measures a ground rather than assuming one

Two runs that are each driven by clicks are not comparable, because a click lands differently on two trees and the diff then describes the divergence in UI state rather than the change under test. **The comparison starts from the initial state, or from a state reached by a scripted sequence proven to produce the same fingerprint on both trees.** Separately, **the ground a value composites over is read, never inferred from where the element appears to sit**, since an element inside a themed room may take a panel token rather than the room's plate.

**Evidence.** A notebook fingerprint comparison was thrown away after it clicked an entry open on both trees and the click landed differently, producing a 48-row diff of entirely different selectors that read exactly like a regression. Redone from the initial state with no clicks, the two trees were byte-identical at 183 candidates with zero moved. In the same bundle an earlier pass assumed a pathway chip took its plate's background, when it takes `--bg1` on every plate, and produced a table showing regressions that did not exist. Both failures produce a confident wrong answer in the direction that costs the most: a regression report against a change that caused none.

## 16. A stub the suite has to configure before it will refuse is testing the configuration, not the system

A local stand-in for a managed subsystem ships with a different starting state than production, and a test written against it will not run until that difference is closed. Closing it inside the test is the trap: the suite now grants, seeds, or patches the stub into the shape it believes production has, and every refusal it then observes is a refusal of an arrangement the suite built itself. The result reads exactly like a proof and is a restatement of the assumption.

**Every adjustment made to a stub is an unverified claim about production, and is recorded as one.** List them by name, state what each asserts, and treat the list as outstanding until one round trip against the real system closes it. The round trip is a single operation, not a suite: one write that must be refused and one that must succeed. It is not optional before anything depends on the policy, and it is cheapest before there is a caller.

This is the inverse of the existing mock-fidelity rule. That rule catches a mock that permits what production refuses. This one catches a mock that permits what production refuses, gets hand-taught to refuse it, and thereby passes.

**Evidence.** The Foundry storage policies were exercised against the `storage.objects` stub, which ships no table grants at all, so a denied write returned `permission denied for table objects` rather than an RLS refusal and proved nothing about the policy. The test added the grants to match production, after which the same writes returned `42501 new row violates row-level security policy`, which is the correct error and was produced by a table the test had configured. No object touched real Supabase Storage in the entire pass. The bundles bucket is the one surface on the platform that will serve arbitrary student code, so the policy standing between a student and another student's bundle was, at the end of a bundle reporting eleven verified refusals with positive controls beside each, still unexercised.

## 17. A verification query returns the identity of what it examined, never a bare count

A count answers how many and nothing else. When it matches the expected number the result is read as confirmation, and it is equally consistent with the expectation being wrong, with the set having drifted by one in each direction, or with the query having matched a different population than the one intended. When it does not match, the number gives no way to tell which of those happened, so the check produces an argument rather than an answer.

**Return the rows.** Names, identifiers, the policy or column or file each hit belongs to. The reader can then see at a glance whether the set is the set that was meant, and a mismatch says which item is missing or extra instead of only that the total moved. This costs nothing at the scale these checks run at.

**Evidence.** A pre-migration check on open authenticated-only SELECT policies was written as a bare `count(*)` with an expected value taken from one section of an audit rather than the whole. The returned number did not match the bar, and the result could not distinguish a schema that had drifted from a bar that had been mis-stated, which is the one distinction the check existed to make. A query returning policy names would have answered it immediately.

---

## 18. A fix proven by one probe is proven only as far as the first gate

Where several checks guard one operation, the first to refuse hides every one behind it. A probe that fails, gets its named cause fixed, and then succeeds has demonstrated that the named cause was real. It has demonstrated nothing about whether it was the only one, and the evidence looks identical either way, because a second gap would not have been reachable while the first was standing.

So a fix derived from an observed error is scoped to that error, and the fix that matters is derived from the **shape**. Name the property that made the failure possible, sweep the catalog or the codebase for everything else carrying it, and qualify each hit rather than stopping at the ones already known to bite. Then write the assertion against the property rather than against the names found, so the next instance reddens on arrival instead of being discovered the same expensive way.

**Evidence.** A service-role write to `student_app_files` failed on `_classroom_deck_path_ok`, and a write to `student_app_versions` on `_foundry_norm`, so two grants were specified. A catalog sweep for the real shape, a helper reachable from a write-time expression that `service_role` cannot execute, found four. `_foundry_slug_ok` guards `student_apps.slug` and was invisible: an insert into that table fails on `_foundry_norm` first, so granting the two observed functions would have made the probe pass, shipped, and surfaced the third as a fresh bug in a later session with nothing connecting it to this one. The fourth, `coin_semester_key`, carries the shape and has no service-role writer, so it was reported and deliberately left alone. The test that landed asserts the property: every function reachable from a CHECK on a table `service_role` may insert into must be executable by `service_role`.

## 19. A green suite may be a green process, so read the suite's own verdict

A test runner reports twice: once as structured output naming what passed and failed, and once as a process exit code. Only the first is the runner's. The exit code is a property of the process, and anything loaded into that process can set it, including a dependency that registers an exit hook for its own cleanup. When that happens the command succeeds unconditionally, every wrapper reading `$?` reports success, and the suite's real result is visible only to whoever reads the output text.

**A gate consumes the report, not the exit status.** Where a pipeline decides anything from a test run, it parses the runner's own machine-readable result. And the gate is proven the only way a gate can be proven: break something on purpose, watch it fail for the stated reason, restore.

**Evidence.** `npm test` in this repo could not return non-zero. The database harness imports `embedded-postgres`, which registers an `async-exit-hook` calling `process.exit(0)` on the way out, clobbering vitest's code. Every CI run for the life of the workflow was structurally incapable of turning red, and the pre-existing failure it was hiding was a hash pinned against CRLF-translated bytes, which passed on the Windows machine that wrote it and failed on every Linux checkout. Reports quoting explicit counts and named failures were still sound, because those read the runner's output; every conclusion drawn from the command having succeeded was not.

---

## 20. A plausible value is not a checked value, so something must hold the answer independently

Some outputs cannot be wrong in a way the system notices. A line number, a count, a timestamp, a computed offset: the code produces one, it looks like the kind of answer expected, and every assertion written against it takes its expected value from the same code that produced it. The suite is then green, the output reads correctly to a human, and the value has never once been compared against anything that knows the truth.

**The check has to come from outside the implementation.** A fixture whose correct answer was worked out by hand, a second method that computes it differently, a property the value must satisfy regardless of how it was derived. Where an output is a position or a quantity in something the test itself constructs, the test knows the right answer by construction and should assert it rather than record what came back.

The tell is an assertion written by running the code and pinning the result. That is a change detector, which is worth having, and it certifies nothing about correctness. It will hold a wrong value in place just as firmly as a right one.

**Evidence.** The Foundry preflight patterns open with `(?:^|[^\w$.])` so that `prefetch` and `this.fetch` do not match, which makes the match begin at the character before the call. At column 0 that character is the previous line's newline, so every statement starting at column 0 reported the line above. Statements at column 0 are most statements, so the numbers were wrong more often than right, in student-facing messages naming a line to go and look at. It had been shipping in `.js` scanning from the start, through several bundles whose reports quoted those messages verbatim and were read closely. It surfaced only when a fixture written for an unrelated feature disagreed with arithmetic done by hand.

---

## 21. A burst of concurrent calls does not test a lock

N simultaneous callers is the obvious concurrency test and it proves nothing here. The role switch ahead of each call staggers them so they never overlap the critical section: a function with its advisory lock **deleted** passed a two-way burst, then an eight-way burst, four runs in a row, 31 of 31 green. A second file's burst test, headed with the case it believed it was proving, passed 3 of 3 against a lockless function and survived only because a real instrument sat beside it.

The instrument is deterministic: a separate transaction holds the same lock from outside and the test measures how long the call waits, with a positive control on the same clock so a slow or loaded machine cannot pass for a held lock. Different guards need different instruments. A partial unique index cannot be held from outside; it is held by an uncommitted INSERT and observed in `pg_stat_activity`.

And the lock the instrument holds must be the lock under test. A first attempt at this passed against the mutant because the RPC's INSERT takes `FOR KEY SHARE` on a foreign-key parent, which conflicts with a `FOR UPDATE` holder: the instrument was stalling the call through the constraint, green and deterministic-looking, measuring nothing. `FOR NO KEY UPDATE` was the discriminator.

## 22. Repetition is not a nondeterminism detector

Three mutants of a `distinct on` with no `order by` reddened nothing under a test that ran the query twelve times. Unspecified is not random: Postgres agrees with itself on the broken function as readily as on the fixed one. The guard has to be structural, pinning the `order by` clause expression for expression off the catalog. The repetition test is worth keeping and worth labelling as a weak control.

## 23. A prepare step whose predicate the pre-action state already satisfies never acts

A browser-harness route reported `0 attempts, already satisfied` and never fired its click, so every assertion after it measured whatever happened to be on the page. It reproduced 6 of 6 in isolation and had been reported as an intermittent finding for days. **Any "do this until that" step needs a predicate the starting state cannot satisfy**, or an unconditional action with a separate wait. Sweeping every such predicate in one harness found two unsafe and fourteen sound; the sweep is cheap and the failure is invisible.

## 24. A visibility predicate that reads an element's own value misses what it inherits

`isVisible` read each element's own opacity. Opacity is not inherited as a computed value, so an element inside a container at `opacity: 0` reported itself visible. **Seven assertions across two routes had been measuring contrast and tap geometry on invisible elements, at every width, on every run since the harness shipped.** Fixing the predicate exposed them; writing `expectVisible: 0` to match would have recorded the vacuum as the intended reading.

The same shape has a second face: a floor is not a ceiling. `expectVisible: 0` asserts "at least none," which every page satisfies. A count assertion needs both ends.

## 25. A DOM environment that answers some computed styles is more dangerous than one that answers none

happy-dom returns `""` for `getComputedStyle().color` and `"block"` for `.display`. **One working computed read is not evidence about the next.** It has no layout engine at all: `getBoundingClientRect()` is 0x0 and `offsetWidth` is 0, so a geometry assertion there reads zero and passes vacuously. Geometry, contrast and tap targets belong in the real browser and nowhere else. It also navigates iframes over the real network unless a fetch interceptor stops it.

## 26. A test that reads source text can match the comment explaining the absence of the thing it searches

A migration's own self-check raised on the file that fixed the defect, because `pg_proc.prosrc` keeps comments and the new body documented what the old rung had been. A test grepping for a symbol matched a comment saying the symbol was deliberately absent. **A check over source strips comments first, or it is checking prose.**

Its sibling: a check that reads a definition's text is coupled to how the SQL is written rather than to what it means. A regex scanning for `c_volume_tol_pct constant numeric` went red when a later migration refactored the same constant into a shared function with the same value. The instrument was wrong and the test was right; the repair is to ask the database what the effective value is, since the suite already applies the real chain.

## 27. A characterisation test is retired to a contract, never deleted and never left to rot

A test written to pin a defect must go red the day the defect is fixed; its author said so in the file. When that happened it was rewritten to assert the contract in both directions rather than removed, and mutation-proved both ways: reverting the fix reddens the no-callback case, and over-applying the fix reddens the with-callback case. **That second direction is the half a naive fix gets wrong** and the reason a characterisation test earns a replacement rather than a deletion.

## 28. A test that builds its own migration chain is pinned to a world, and the world moves

Tests here construct chains, often stopping short. **An assertion can be green, true of its chain, and false of production.** With six migrations queued, a structural sweep over 104 test files found 28 that could even accept one, of which four carried assertions about behaviour a queued migration removes, four were deliberately about the short chain because a degrade rung was their subject, and twenty were silent. Each of those three outcomes has to be named; the classification is the deliverable and the edits follow from it. Widening every chain would have destroyed the deliberate before-and-after pairs, and a naive widening did exactly that before it was caught.

One hazard belongs with it: `CHAIN_BEFORE = CHAIN.slice(0, -1)` means "without that migration" only while that migration is last. Appending anything silently redefines it. Three instances were found in one day, each by a session that had just fixed another.

## 29. A positive control that can go to zero rows silently is not a control

An exclusion assertion of the form "this mode does not reach the board" passes perfectly against a board matching nothing at all. The guard beside it, "the ranked mode still appears, both players, in score order," went to zero rows under a queued migration and failed loudly, which is the only reason the four exclusions below it were not left certifying an empty view. **Bind the exclusion to its control in the same test**, so an emptied result cannot satisfy an emptiness claim.

## 30. A permissive fixture answers a different question from production, quietly, for everyone

`tests/db/supabase-stub.sql` carried hosted default privileges for functions and never for tables. Every object in the fixture therefore held exactly what its migration granted, so **every assertion anywhere in the suite that an anonymous caller could not reach something was passing for the wrong reason**, and the whole defect class was invisible by construction. Measured rather than argued: with the table defaults added, a migration-created view comes out holding the same seven privileges production showed, and the full chain reproduced a live catalog sweep object for object.

The same file's `rpc()` reported every failure as `PGRST202`, so a missing function and a live one raising were indistinguishable and a mutant survived on exactly that. Its `select` path did the same with `42P01`. And a `returns table` with one column compiles to a base type rather than a composite, so a set-returning call handed back bare scalars where PostgREST emits row objects, certifying a route that could not work.

**A shared fixture is load-bearing in proportion to how many suites import it**, and a correction to one is expected to change results elsewhere. Every changed result is a finding to name, never an assertion to weaken.

## 31. A negative control that removes access cannot detect an over-permissive gate

Mutating a published-only RLS policy by DROPPING it looks like the obvious negative control and proves nothing. Dropping the policy that grants anonymous read makes the anonymous caller see *nothing*, so the assertion "a draft row is invisible to anon" still passes, and passes vacuously. The suite goes green against a database with no boundary at all.

**Mutate in the direction of the failure being defended against, not away from it.** For a published-only gate that is `ALTER POLICY ... USING (true)`: confirm the draft assertion then fails, restore the exact original predicate, confirm it passes again. Established 2026-08-30, when the IDEA Maps schema bundle was handed a prompt specifying the drop form, recognised that it could not fail, and substituted the permissive form on its own.

The general shape: a control must move the system toward the defect, and a control whose mutation makes the assertion trivially true has tested the assertion's phrasing rather than the gate. **Do this for every policy the suite claims to cover, not one representative**, since a mutation proof opens only the layer it actually mutates.

The related trap on the other side: a probe can be swallowed before it reaches the gate. Two delete probes in that same bundle could not leak under a fully-opened policy because a foreign-key `on delete restrict` refused them first, so `leaked = false` meant "refused by something else" rather than "refused by the policy". Every probe carries an admin control running the identical statement, so a `false` can only mean the policy held.

## 32. A shallow clone answers history questions wrongly rather than refusing

`git clone --depth 1` produces a repository that runs history commands successfully and returns fiction. `git log -1 --name-only` on a depth-1 clone lists **every file in the tree** as added by the single commit, because there is no parent to diff against. Nothing errors, nothing warns, and the output has exactly the shape the correct answer would have.

Established 2026-08-30, by the assistant rather than by a session, checking which files a commit touched: it read the whole repository as the commit's file set and was seconds from reporting a bundle had rewritten the project. The file set was verified by reading the files' contents instead.

The standards sweep already carries this rule for its own use and states it in its docstring. The rule generalises: **a shallow clone is a source for file contents and directory listings at HEAD and for nothing else.** Where a history question must be answered, clone with history or answer it another way, and prefer answering it another way, since the cheap check is usually to read the artifact and see what it says.

## Note on internal organization

This section was written as a merge plan for a document that does not exist. It is kept because the groupings are real and a future reorganization of this file should follow them, not because anything is waiting to move.

Rules 1 through 3 form one lesson and should probably merge as one clause with three parts. Rules 4, 5 and 8 are all about an assertion that passes without touching the thing it names, and may read better together than apart. Rules 6, 7, 10, 11, 12, 13, 14 and 15 are about the harness and the environment rather than about the tests, and belong wherever the existing document keeps verify-the-verifier. Rule 16 belongs beside the existing mock-fidelity rule rather than in that group, since it is that rule's other half. Rule 20 sits with rules 4, 5 and 8 as well, and is the sharpest form of the group: the others describe an assertion that never reached its target, while this one describes an assertion that reached it and had nothing to compare it against. Rules 17 and 19 sit with rules 4, 5 and 8, since each is a form of an assertion reporting success without touching the thing it names. Rule 18 belongs with them or with the mutation discipline; either placement is defensible. Rule 9 sits with the mutation discipline rather than with the others.

---

## Changelog

- **2.2 (2026-08-30)** - Two rules from the IDEA Maps P1 build, both about a control that cannot fail. Rule 31: a negative control that DROPS a published-only RLS policy makes the anonymous caller see nothing, so the draft-invisibility assertion passes vacuously and the suite goes green against a database with no boundary; the mutation must run toward the defect (`USING (true)`), across every policy the suite claims rather than one representative, and every probe needs an admin control beside it because a foreign-key `on delete restrict` can refuse a delete probe before the policy is ever consulted. The prompt that started that bundle specified the drop form; the session caught it. Rule 32: a `--depth 1` clone runs history commands successfully and returns fiction, with `git log -1 --name-only` listing the entire tree as the single commit's file set, and the assistant nearly reported a three-file bundle as a whole-repository rewrite on exactly that output.
- **2.1 (2026-08-29)** - Ten rules from one very long day, every one of them a green test that was proving nothing. Rule 21: a burst of concurrent calls does not test a lock, after a function with its advisory lock deleted passed an eight-way burst four runs running, and after the deterministic replacement built to fix it passed against the mutant too because it was stalling the call through a foreign-key constraint rather than the lock. Rule 22: repetition is not a nondeterminism detector, since `distinct on` without a sort is unspecified rather than random and agrees with itself on the broken function. Rule 23: a prepare step whose predicate the starting state already satisfies never acts, and the check after it measures whatever was there. Rule 24: a visibility predicate reading an element's own opacity missed inherited opacity, and seven assertions had been measuring contrast and tap geometry on invisible elements since the harness shipped. Rule 25: happy-dom answers some computed styles and not others, which is worse than answering none, and has no layout engine at all. Rule 26: a check over source text matches the comment explaining the absence of what it searches for, and a check coupled to how SQL is written breaks when the same value is refactored. Rule 27: a characterisation test is retired to a contract in both directions rather than deleted. Rule 28: a test that builds its own chain is pinned to a world that moves, with the sweep that classifies 28 candidate files into three named outcomes. Rule 29: a positive control that can go to zero rows silently is not a control, after an exclusion assertion nearly certified an empty view. Rule 30: a permissive fixture answers a different question from production for every suite that imports it, after table default privileges were found missing from the shared stub, an RPC error path was found conflating every failure into one code, and a single-column `returns table` was found handing back bare scalars.

- **2.0 (2026-08-25)** - Promoted from staging to the owning verification standard, and retitled. No rule changed. The preamble had described this file as holding rules that belonged in `IDEA_VERIFICATION_STANDARDS.md` and could not be merged because that document's authoring copy was unavailable; that document has never existed, which two other standards files had already recorded while this one still deferred to it. An unavailable file and a nonexistent one read identically and license opposite behavior, so the deferral is closed rather than reworded. The scope note is retitled as an internal organization note for the same reason: it was a merge plan for a destination that was never going to arrive, and a standard that calls itself provisional invites sessions to treat its rules as provisional. Registered in the standards file list in `IDEA_instructions.md`, which had carried it since 2026-08-21 while the file itself denied being a standard.

- **1.9 (2026-08-23)** - Rule 20 added, on a plausible value that nothing could check, after a line-number off-by-one was found by hand arithmetic rather than by any test. The Foundry preflight patterns begin with a non-word guard so `prefetch` does not match `fetch`, which puts the match one character before the call; at column 0 that character belongs to the previous line, so every statement starting at column 0 named the line above. Most statements start at column 0. The messages were student-facing and told a student which line to go and look at, the defect had been in `.js` scanning since it shipped, and several bundles quoted the wrong numbers verbatim in reports that were read closely and approved. Nothing in the suite could have caught it, because every assertion took its expected value from the implementation. Filed with the group about assertions that report success without testing what they name, as its sharpest form: here the assertion reached its target and had no independent answer to compare against.

- **1.8 (2026-08-23)** - Reconciliation plus one new rule. Two files existed at 1.7, written the same day in separate chats from the same 1.5 base, each carrying a different rule 17 and neither aware of the other. This version contains both. Rule 17 keeps the identity-not-count rule from the parent-access chat, since renumbering the one already in circulation would have been the more confusing choice; it is **rewritten from its statement rather than copied from that file, so check it against the original and tell me if the argument lost anything**. The first-gate rule delivered as 17 in the Foundry chat is renumbered 18. Rule 19 is new: a green suite may be a green process, after `npm test` was found structurally incapable of returning non-zero because `embedded-postgres` registers an exit hook that clobbers vitest's exit code, which made every CI run for the life of the workflow unable to fail and hid a hash test that had been wrong on every Linux checkout since it was written. This file supersedes both 1.7s; upload it and discard them.

- **1.7 (2026-08-23)** - Rule 17 added, on a fix proven by one probe being proven only as far as the first gate, after a two-function grant gap turned out to be a three-function one. Two service-role writes failed on two named predicates, so two grants were specified; a catalog sweep for the shape found `_foundry_slug_ok` guarding a column whose insert fails on a different predicate first, so it was unreachable behind the failure that was visible and the specified fix would have passed its own probe while leaving the gap. A fourth match with no service-role writer was reported and deliberately not granted. The rule requires deriving the fix from the property rather than from the observed error, sweeping for every instance, and asserting the property so the next one reddens on arrival.

- **1.6 (2026-08-23)** - Rule 16 added, on a stub the suite has to configure before it will refuse, after the Foundry schema bundle proved eleven storage and RLS refusals with a positive control beside each and never touched real Supabase Storage. The `storage.objects` stub ships no table grants, so the denials arrived as `permission denied for table objects` and said nothing about any policy; the test granted them to match production, at which point the refusals became genuine RLS errors produced by a table the test had arranged. The rule requires every stub adjustment to be recorded as an unverified claim about production and closed by one real round trip, and it is filed as the other half of the existing mock-fidelity rule rather than as a harness rule: fidelity failures run in both directions, and the direction where the suite teaches the mock to refuse is the one that produces a clean report.

- **1.5 (2026-08-22)** - Rule 15 added, on comparing from a reproducible state and measuring the ground rather than assuming it, after a fingerprint diff driven by clicks on both trees produced 48 rows of different selectors that read as a regression, and the same bundle produced a second false regression table by assuming a chip took its plate's background when it takes `--bg1` on every plate. Redone from the initial state the two trees were byte-identical at 183 candidates. Rule 12 gained `IntersectionObserver` never firing in the pane, which silently dropped an entire launcher from a sweep's denominator, and the note that the bare-class trap paid twice more on live pages.

- **1.4 (2026-08-22)** - Rule 14 added, on a sweep never removing a candidate from its own output, after a pass ended with two decoration glyphs left standing as failures because their real bar is 3:1 rather than 4.5:1, and the session chose to report them wrongly-barred rather than teach the sweep an exemption a later reader could not see. Rule 12 gained two environment traps, both of which corrupt a measurement rather than failing it: `git stash` does not invalidate a Vite module, so a stashed baseline can measure the changed stylesheet and silently understate its own diff, and a bare class selector reaches unrelated components because Svelte scopes the style rather than the class.

- **1.3 (2026-08-22)** - Rule 13 added, on a sweep reporting its denominator, after a contrast sweep returned zero failures over a document holding seventeen matching rules. The cause was `CSSStyleRule` gaining a `cssRules` property for CSS Nesting, where an empty `CSSRuleList` is truthy, so the standard recursion skipped every ordinary rule. Three of four attempts on that question returned confidently wrong answers in both directions, one of them the clean zero that would have shipped. The rule covers the over-reporting direction as well, since forcing a condition onto a non-unique selector produced 46 artefacts out of 47 findings, and dropping a state class flagged the very precedent the fix was following.

- **1.2 (2026-08-21)** - Rule 10 added, on verifying against the artifact rather than the source, after Svelte's CSS pruner silently dropped a component-scoped `::after` from the compiled stylesheet while keeping the plain rule beside it, with no error and no warning anywhere. That rule carried the hit area for a set of controls, so a sweep reading the source would have called the page compliant while the served page was not. Later rules renumbered.

- **1.1 (2026-08-21)** - Rule 10 added, on a harness that mounts a subset silently measuring a subset, after three of eleven launcher cards were found to require a flag before they render at all: a sweep over every card would have measured eight and reported the set complete. The remedy is asserting the denominator rather than trusting the sweep. Rule 8 gained a second piece of evidence: a TypeScript plain-text projection and its SQL counterpart were assumed to agree for months while one ended in `btrim` and the other called `trim()`, a difference nothing could observe until a document arrived with an empty first line, and one that no amount of reading either implementation would have surfaced.

- **1.0 (2026-08-21)** - Created as a staging file after nine rules accumulated against a standards document that was not available to author against, and rebuilding that document from search results would have repeated the stale-base failure these rules exist to prevent. Rule 9 added in the same pass, on mutating to the rejected alternative rather than only to a broken version, after a title-resolver mutation set showed the rejected design reddening a different three tests than the permissive one. Carries a version header and a changelog because the repo's standards sweep globs this directory rather than enumerating it, and exempting the first new file it caught would have retired that check on its first real case.
