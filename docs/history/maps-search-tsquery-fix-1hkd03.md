---
title: "IDEA Maps search: `mill room caliper` narrows by place for the first time, because 0162 OR'd the live-typing prefix term into the whole query and its own header line 35 said it did not (`claude/maps-search-tsquery-fix-1hkd03`, 0165)"
date: 2026-08-30
branches: [claude/maps-search-tsquery-fix-1hkd03]
subsystems: ["IDEA Maps", "Database", "Testing"]
migrations: ["0165"]
---

One migration and the acceptance corpus that measures it, in one commit, straight
to `main`. That is forced rather than chosen: `tests/db/` applies the real
migration chain, so `tests/maps-search-corpus.test.ts` observes whatever
`maps_search` currently is. The corpus pinned the OLD behaviour as a known gap
and said so in its own comment ("THIS TEST IS EXPECTED TO GO RED WHEN THE GAP IS
FIXED"). Landing the migration alone turns `main` red; landing the corpus change
alone turns `main` red. There is no ordering that keeps `main` green, so there
is no branch.

## The defect, and the sentence that was wrong about it

0162 builds the tsquery in two statements:

```
v_tsq := websearch_to_tsquery('english', v_q) || websearch_to_tsquery('simple', v_q);
...
v_tsq := v_tsq || to_tsquery('simple', v_last || ':*');
```

`||` on tsquery is OR. The two websearch halves ARE conjunctive; the final-token
prefix term was then OR'd in as a free-standing alternative, so a row carrying
that one token matched regardless of every other word typed.

Measured on the acceptance fixture, anonymously, against 0162 as applied:

```
"mill room caliper" -> 3 rows
   1. stock:Dial Caliper@Mill Room      depth=2 score=1.000000
   2. stock:Dial Caliper@Machine Shop   depth=2 score=1.000000
   3. item:Shop Caliper                 depth=4 score=1.000000
```

Three calipers, which is exactly the set `'caliper':*` returns on its own. The
conjunctive halves contributed nothing that the free prefix term did not already
admit. **0162's header line 35** -- "websearch AND-semantics is what makes 'mill
room caliper' narrow by place through the D band", the sentence opening on line
34 -- describes a function it did not ship. Spec 5.1 uses that exact phrase as
its example of the ancestor chain working and 5.5 makes search quality P1, so
this is an acceptance failure, not a ranking wart.

**The defect was ORDER-DEPENDENT, and that is what hid it.** The same three words
as `caliper mill room` put `room` in the prefix slot, and `'room':*` happens to
exclude everything under Machine Shop, so that phrasing looked like it narrowed
while doing nothing of the kind. The corpus had the working-looking order as a
real acceptance case and the failing order as a pinned gap, ten lines apart, and
both were true.

## The shape chosen, and why it is still a disjunction

```
  (t1 & t2 & t3)      -- english: stems, so "cuts" reaches "cutting"
| (t1 & t2 & t3)      -- simple: literals, so identifiers survive
| (t1 & t2 & t3:*)    -- english head, final token as a prefix
| (t1 & t2 & t3:*)    -- simple head, final token as a prefix
```

Four alternatives, every one of which conjoins **every** term the person typed.
The disjunction is over SPELLINGS of one query, never over subsets of its terms
-- that is the distinction 0162 lost, and it is the whole correction.

Three spellings, each of which a measurement says is load-bearing:

- **english and simple cannot be ANDed together.** `thing that cuts aluminum`
  stems to `'thing' & 'cut' & 'aluminum'` and tokenises to
  `'thing' & 'that' & 'cuts' & 'aluminum'`; requiring both would require
  `'that'`, which english drops as a stopword and no document carries.
- **the exact (non-prefix) spelling carries a websearch PHRASE.** `505-742`
  becomes `'505' <-> '-742'`. The prefix slot sees that token stripped by
  `[^a-z0-9]` to `505742`, which matches nothing at all.
- **the prefix spelling is live typing.** `cal` is a lexeme of no document --
  "caliper" stems to `'calip'` -- so only `'cal':*` finds it, and it is the third
  keystroke of the most common query in the building.

Two implementation details worth keeping:

- **an empty head is absorbed rather than branched on.** `''::tsquery && x` is
  `x`, measured in both operand orders, so a single-token query reduces to
  exactly the bare prefix term it was before, with no second code path.
- **the prefix spelling is skipped when the last token carries a websearch
  operator** (a leading `-`, or a quote). Neither is a word somebody is halfway
  through typing, and re-admitting one as a bare prefix contradicts the term it
  was asked to exclude. Measured: `caliper -mill` returned 7 rows under 0162,
  led by the Bridgeport Mill and the Mill Room node -- the two things the `-mill`
  was there to remove. After 0165 it returns three calipers and nothing else.

## The typo-versus-conjunction trade turned out not to be one, and the reason is structural

The three legs are OR'd in the WHERE clause (`ts_hit or trgm_hit or substr_hit`)
and 0165 touches ONLY the tsquery. The trigram leg is still whole-query `<%`
word-similarity against the per-row vocabulary blob; the substring leg is still
whole-query ILIKE. Neither knows the full-text leg tightened.

Measured, before and after, anonymously:

| query | 0162 | 0165 |
| --- | --- | --- |
| `calipre` (transposition) | 3 rows @ 0.625 | 3 rows @ 0.625 |
| `dial calipre` (typo inside a multi-term query) | 3 rows @ 0.769 | 3 rows @ 0.769 |
| `calip` | 3 rows @ 1.0 | 3 rows @ 1.0 |
| `cal` | 3 rows @ 1.0 | 3 rows @ 1.0 |
| `c` | 13 rows | 13 rows, same order |

**And the trigram leg is what keeps the function query alive**, which is the case
that would otherwise have made the trade real. `thing that cuts aluminum` is spec
5.5's own example, and no document contains `'thing'` -- those words are filler,
not vocabulary -- so a conjunctive full-text query cannot match it, and after
0165 does not. It is carried entirely by trigram: `word_similarity` against the
band saw's blob measures **0.6956**, above the 0.6 default
`word_similarity_threshold`, and every other row in the corpus measures **0.14 or
less** (Dial Caliper 0.138, Hex Key Set 0.107, Digital Micrometer 0.087). One row,
rank 1, unchanged. What moved is the SCORE, 1.0 to 0.6956, which is the more
honest of the two numbers: it was never a full-text certainty.

**The limit this leaves, stated rather than discovered later:** a typo in a PLACE
term still finds nothing. `mill room calipre` returns zero, because the full-text
leg needs a `'calipre'` no document has and the trigram blob carries no ancestor
names to match "mill room" against. It returned zero under 0162 too, for the same
reason, so nothing regressed. Closing it means putting chain names into the
trigram vocabulary, which changes what the three GIN indexes cover.

## The rank clamp stays, and the argument is a measurement

`least(ts_rank_cd(...) * 2.0, 1.0)` is unchanged. Two measurements decided it.

**Un-clamping inverts the quality order.** `ts_rank_cd` is unbounded and tracks
how OFTEN a lexeme occurs and in which band, not how well the row answers the
question: over the four published item types, one query's raw ranks spread
**0.8 to 4.0**. A one-occurrence brand hit at 0.8 would sort BELOW a trigram typo
hit at 0.625-1.0. Spec 5.2 asks for the three legs to be "ranked and merged", and
only the trigram leg is naturally bounded to [0,1] -- the clamp is what puts the
full-text leg on that scale.

**It does not saturate everything, which is the half worth measuring before
reaching for it.** It saturates a match reaching raw 0.5 -- an A-band or strong
B-band hit -- and leaves a chain-only match below. Measured on `mill`:

```
   1. item:Bridgeport Mill                   d=2 s=1.000   (A band, name)
   2. node:Mill Room                         d=2 s=1.000   (A band, name)
   3. stock:Dial Caliper@Mill Room           d=2 s=0.400   (D band only, one level)
   4. stock:Digital Micrometer@Bench Cabinet d=3 s=0.400   (D band only)
   5. node:Bench Cabinet                     d=3 s=0.200   (D band, deeper)
```

So the band weights still separate "this thing is called that" from "this thing
is somewhere called that", which is the distinction a student is making. What
saturates is A against B among direct hits, and there spec 5.2's own tie break --
shallower first -- decides, which is what it is for.

**Observed and deliberately left**: `ts_rank_cd` is a COVER DENSITY rank, so it
penalises terms sitting far apart in the vector. A multi-term place query
therefore scores lower than a single-token name query -- `mill room caliper`
lands its one correct row at 0.5 -- and on `machine shop caliper` the room node
(0.619, from the trigram leg) outranks the caliper standing in it (0.429). That
is a leg-merge SCALE question. Moving the multiplier inside a correctness fix
would make it impossible to tell which change moved which rank, so it belongs in
a ranking bundle that re-derives every corpus rank from measurement.

## Every corpus expectation that changed, and why

Nine of the eleven cases are byte-identical before and after. Two changed and one
was added.

**`caliper mill room` was `count: 5`, Mill Room node at rank 1, the caliper at
rank 2. It is now `count: 1`, the caliper at rank 1.** Both halves of the old
expectation were artifacts of the defect. The five rows under 0162 were the Mill
Room node, the caliper, the Bridgeport Mill, the Bench Cabinet and the
micrometer -- and the last four of those carry no caliper vocabulary in any band.
They were admitted by the free `'room':*` term alone. The case's old `why`
rationalised the room's rank 1 ("the query names a room, and the room is a
legitimate answer to a question about a room"), which reads well and is wrong
under a conjunctive query: the student also typed "caliper", and a room is not
one. **This is the corpus expectation that only passed because of the OR'd prefix
term.** The query was right; the expectation was wrong.

**`mill room caliper` is new, and is the spec's own phrasing.** It asserts the
same count, the same rank and the same traps as the order above -- deliberately,
because the defect was order-dependent, and a corpus carrying only one of the two
orders is a corpus that would have missed it. Both name `Dial Caliper@Machine
Shop` as an absent trap; `mill room caliper` also names the drawer-level
`Shop Caliper`, so that a narrowing which dropped only the room-level twin would
be caught as depth doing the work rather than place.

**`thing that cuts aluminum` did not change.** Count 1, rank 1, same row. Only its
score moved, and the corpus asserts ranks rather than scores.

**The pinned-gap test is gone**, replaced by a note saying so and by one new
assertion worth keeping in its own right: `mill room caliper`, `caliper mill
room`, `MILL ROOM CALIPER`, `mill  room   caliper` and `Mill Room Caliper ` all
resolve to the same single row. Word order is not a search operator, and now
neither is case or spacing.

The denominator moved 10 -> 11 in both places that state it (the coverage test
and the anon/admin control).

## The corpus can still fail, and a fifth mutation reproduces the fault just fixed

All four existing mutations still demote what they claim, over the widened
corpus. A fifth was added: `&& v_pref` -> `|| v_pref`, two occurrences, which
restores the free-standing prefix alternative exactly. A regression proof written
after a fix that cannot reproduce the fault the fix was for has proven only that
the new code agrees with itself.

```
MUTATION: the final-token prefix term OR'd into the whole query (the 0162 defect)
  edits  : 2x "&& v_pref" in public.maps_search(text, integer)
  BEFORE : all 11 corpus queries pass
  AFTER  : 2 demoted
      "mill room caliper" -> expected 1 result(s), got 7 -> [stock:Dial Caliper@Machine Shop,
         stock:Dial Caliper@Mill Room, node:Mill Room, item:Shop Caliper, item:Bridgeport Mill,
         node:Bench Cabinet, stock:Digital Micrometer@Bench Cabinet]
      "caliper mill room" -> expected 1 result(s), got 5 -> [node:Mill Room,
         stock:Dial Caliper@Mill Room, item:Bridgeport Mill, node:Bench Cabinet,
         stock:Digital Micrometer@Bench Cabinet]
  RESTORED: definitions byte-identical, all 11 corpus queries pass again.
```

The other four, re-run over the widened corpus: tie-break-inverted demotes 6
(`hex key set`, `Mitutoyo`, `Dial Caliper`, `calipre`, `calip`, `505-742`),
alias-band-removed demotes `allen wrenches` (2 rows -> 0), tag-band-removed
demotes `thing that cuts aluminum` (1 -> 0), threshold-raised-to-0.9 demotes
`calipre` (3 -> 0). Every one restores byte-identically and the whole corpus is
green again after each.

## The third file, and why it is not scope creep

The bundle was specified as the migration plus `tests/maps-search-corpus.test.ts`.
It also adds one line to `MAPS_MIGRATIONS` in `tests/db/maps-fixture.ts` (and
corrects a `0161-0163` range in that file's own header). That constant is the ONE
statement of the maps chain, shared by the corpus and by the two RLS suites, and
a chain stopping at 0163 would run the corpus against a superseded function.
`tests/maps-rls-boundary.test.ts` section E makes claims about `maps_search` --
that anon may execute it, that a draft never surfaces, that a published node
under a draft parent is unreachable -- and those are claims about the definition
in place. Spreading the constant inside the corpus file instead would have been a
second statement of which migrations are in the chain. **0164 is deliberately
still absent**: it creates only the search log's prune trigger, which no maps
test reads.

Verified that the widening costs the boundary suite nothing: `Dial Caliper`
returns the same 3 rows, `Lab Cart` and `Unreleased Gadget` still return zero
anonymously. The conjunction can only narrow the tsquery leg, so a result set
that was empty stays empty.

## Verification

- **`mill room caliper` before/after**: 3 rows (Mill Room caliper, Machine Shop
  caliper, Shop Caliper, all at 1.0) -> 1 row (Mill Room caliper, 0.5).
- **`caliper mill room` before/after**: 5 rows -> 1 row.
- **typo tolerance**: `calipre` 3@0.625 -> 3@0.625; `dial calipre` 3@0.769 ->
  3@0.769.
- **single-token prefix**: `calip`, `cal`, `c`, `hex`, `Mitutoyo`, `bridgeport`,
  `vernier`, `mic`, `allen` all identical before and after.
- **websearch operators**: `"mill room" caliper` 3 -> 1; `caliper "mill room"`
  5 -> 1; `caliper or micrometer` 4 -> 4 unchanged; `caliper -mill` 7 -> 3.
- **the full corpus after**: 22 tests, all passing, all 11 queries.
- **the failure proof re-run**: five mutations, quoted above.
- **idempotence**: applied three times against a real Postgres. `pg_get_functiondef`
  identical, `proacl` identical
  (`{postgres=X/postgres,service_role=X/postgres,anon=X/postgres,authenticated=X/postgres}`
  -- anon and authenticated granted deliberately, service_role untouched), and
  all twelve probe queries identical row-for-row and score-for-score.
- **the precondition refusal bites**: applied to a chain holding 0161 but not
  0162, 0165 raises `0165: 0162 is not applied -- missing _maps_chain_link,
  _maps_item_type_vocab, _maps_item_vocab, _maps_node_vocab, maps_search. Apply
  0162_maps_search.sql first.`
- **`npm test`**: 211 files, 4397 tests, all passing, 166.89s.
- **`npm run check`**: 2704 files, **0 errors, 37 warnings, 20 files with
  problems** -- the documented baseline, breakdown 31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`. (Run with
  `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` exported before the sync;
  without them a fresh checkout reports the documented 11 phantom errors.)
- **`npm run history:verify`**: 168 entries, 2252747 bytes, sha256 IDENTICAL.

## NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` points
  at the placeholder `example-ref`. 0165 is written and tested; it is not applied.
  Whoever pastes it should read the three notices back.
- **No browser pass.** `maps_search` has no caller in `src/` at all -- P1's viewer
  has not shipped -- so there is no surface to drive. `grep -rn maps_search src/`
  returns nothing, which is also why this bundle touches no application code.
- **Production corpus behaviour is unmeasured.** Every number here comes from the
  fixture in `tests/db/maps-fixture.ts`, which is one building of five item types.
  The narrowing is structural and does not depend on corpus size, but the
  cover-density ranking observation above may read differently against a real
  room full of tools.
- **Performance was not measured.** The query gained two `websearch_to_tsquery`
  calls and two `&&` compositions per call, all on the query string rather than
  per row, against a function that already sequentially scans three tables. It is
  not expected to be measurable and was not measured.

## Left alone deliberately

`thing that cuts aluminium` still returns zero. It is a US-versus-British spelling
in the fixture's own tag content, the fix is an alias or a tag rather than a
schema change (spec 5.4's miss-driven vocabulary growth is exactly this
mechanism), and it is Mr. Pina's call. Its pinned-gap test is untouched and still
passes, control included -- measured after 0165: `word_similarity` for the
British spelling against the band saw is **0.5417**, below the 0.6 threshold,
where the US spelling is 0.6956.
