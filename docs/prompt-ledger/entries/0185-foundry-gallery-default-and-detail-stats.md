# 0185 Foundry: most played by default, and the stats a student can actually see

- Issued: 2026-09-12
- By: router chat
- Owns: `src/lib/foundry/FoundryGallery.svelte`, `src/lib/foundry/telemetry.ts`, the
  Foundry detail route and its `+page.svelte`, `tests/dom/foundry-sort*`,
  `tests/dom/foundry-detail-stats*`, `tools/browser-verify/routes/foundry*.mjs` and its
  measured store entries, `docs/prompt-ledger/entries/0185-*`, and its own
  `docs/history/` entry. NO MIGRATION.
- Migration permitted: no. Claims: none. Highest landed migration at issue: 0203
  (`0204` is claimed by ledger 0177 and already applied to production by hand).
- Status: pushed
- Branch: `claude/awesome-keller-pj6hkc`, branched from `origin/integration` at `b0a8101d`
  (level with `origin/main`).
- Notes: TWO DEFECTS MR. PINA FOUND BY USING THE APP ON 2026-09-12, both against the
  mosaic he otherwise liked. (1) The gallery still opens on Recent
  (`FoundryGallery.svelte:127`) although decision 04 was answered MOST PLAYED on
  2026-09-12 and ledger 0173 recorded the answer; no lane changed the code. (2) The
  three metrics `0204` made public are handed down on `/foundry/mine` and
  `/foundry/review` only, so the detail page a student lands on after tapping a card
  shows none of them -- Mr. Pina can read an app's numbers through the review controls
  and nowhere else. Both layers of decision 07 are owed on that page: the PUBLIC TOTALS
  for the app, and the VIEWER'S OWN playtime through `foundry_my_play_stats`.
  THE n=1 CASE IS ACCEPTED AND IS NOT A BUG -- on an app one person has played the
  totals identify when that student played, and Mr. Pina was asked precisely this and
  said it is fine. No threshold, no floor, no rounding, and decision 07 is not reopened.

## Outcome

**Both defects fixed.** The gallery opens on `FOUNDRY_GALLERY_DEFAULT_SORT`
(`telemetry.ts`), imported rather than spelled a second time in the component,
because a decision recorded in a document and a literal typed into a component
are exactly the pair that demonstrably stopped matching here. The tiebreak was
CHECKED rather than assumed: `sortGallery` has no index term and rests on
`Array.prototype.sort` being stable (required since ES2019), so equal counts keep
`foundry_list_apps`'s order -- incidental under the old default, load-bearing
under this one, and pinned at 60 tied apps, well past any insertion-sort
threshold a 3-element fixture would pass by luck. No comparator term was added:
it would be a second statement of an ordering the runtime already guarantees.
The detail page now carries both layers of decision 07, reusing
`FoundryPlayStats` with the personal row as a second, separately optional
transport, mounted in the gallery's own wrapper the way `staffHref` is so
`FoundryDetail` keeps having no branch the review queue would also render. n=1
is accepted and a test renders `1 / 1 person / 44s` unrounded so a later
"improvement" has something to break.

**Duplicate check, three ways, all clear.** (1) `git log --oneline
origin/main..origin/integration` at branch time: ZERO commits, `integration`
level with `main` at `b0a8101d`. (2) `git ls-tree` over all 55 remote refs: no
`0185` ledger entry anywhere, highest on any ref `0183`; a live GitHub contents
listing of `entries?ref=main` returned 164 entries, highest `0180`. `0185` exists
only as a MIGRATION number (`0185_bucket_limits_under_the_global.sql`, landed
2026-09-04); this entry claims none. (3) `tools/idea-status.py` across `main`,
`integration` and every `claude/**` and `codex/**`: 162 prompts in flight,
exactly TWO still `Status: issued` (0182 notebook-overhaul resolution, 0183
IdeaCAD with no UI), neither naming Foundry; every Foundry entry reads `pushed`.

**The three fetches and the identity check.** `tools/idea-status.py` from raw,
722 lines, md5 `e044d18ba0c9`, identical to the local mirror;
`docs/standards/REGISTER.md` from raw, 51 lines, md5 `bda5ad4d6d9a`, identical;
the ledger directory live from the GitHub contents API on `main`. Container: the
clone WAS shallow and `--unshallow` took it to 2268 commits; the branch identity
was already set. Identity read from the session rather than asserted: configured
`claude-opus-5`, last served `claude-opus-5`, effort `high`, permission mode
`auto`.

**`0204` IS NOT ON `integration` OR `main`**, which the check turned up and which
governs what could be covered here. The migration file and every mention of
`foundry_my_play_stats` live on `claude/busy-newton-trto6y` (ledger 0177,
`pushed`, unmerged); on `integration` the name appears only as prose in two
documents. So no `tests/db/` coverage was possible from this branch and none was
written; what is proved is the client contract. 0177's edits to `telemetry.ts`,
`transports.ts` and `FoundryPlayStats.svelte` were read before editing and are
comment-only, well away from the lines touched here, and a test merge into the
CURRENT `integration` is clean.

**Measured.** Full suite **412 files, 7963 tests, 0 failures**, 485.03s.
`svelte-check` **0 errors, 37 warnings in 20 files** (31/5/1) -- IDENTICAL to the
branch point, re-derived in a clean `git worktree` at `origin/integration`
`b0a8101d`. `CLAUDE.md`'s stated baseline of 38 in 21 is stale by one, the drift
again entirely `state_referenced_locally` (32 to 31) and again downward; NOT
corrected here, because `CLAUDE.md` is outside this lane's Owns and ledger 0177
carries a pending edit to that exact paragraph. One `verify:browser --route
foundry`: 20 route/width runs, **394 measurements, 0 outside threshold**, 63.5s.
One `verify:readme --route foundry`: 10 specs, 64.6s; the store now holds 201
specs, 402 runs, 7130 measurements, 0 outside threshold. `npm run
history:verify` and `node tools/claude-md-check.mjs` both clean.

**Fourteen mutants, all reddening, restored from `cp` copies verified by md5** --
never `git checkout --`. One of the first eight reddened NOTHING, and that was
the finding: deleting both transport props from the route left every test green,
so `tests/dom/foundry-detail-stats.test.ts` now mounts the REAL
`src/routes/foundry/+page.svelte`, and four route mutants redden.

**An instrument finding, caused by the default moving.** `/dev/foundry-mosaic`'s
focus step had been passing VACUOUSLY -- while `Most played` was the state it
measured, every plate carried a count and was exempt from the hover rule already,
and the harness said so in as many words. Pressing `Recent` removed the exemption
and the honest answer came back. The component is right (`:focus-visible`) and
the harness cannot produce a trusted keypress, so **the rendered keyboard reveal
is NOT VERIFIED by this harness**; a new stylesheet sweep proves the reveal rules
are still in the cascade instead, with the `:hover` rule as its positive control.

**THE MERGE TO `main` WAS NOT TAKEN, AND GATE 5 IS WHY.** `origin/integration`
moved during this session: `cc286e14` now carries
`supabase/migrations/0206_ideacad_grant_guard.sql` (ledger 0181,
`claude/confident-babbage-wr1umb`). Ledger 0114's gate 4 substitution applies
ONLY while the migration check is empty and it is not, so the stop rule fires
first. `node tools/deploy-probe.mjs --ref origin/integration` says
`DEPLOY_PROBE_URL is not set, so production's applied set cannot be read. This is
"cannot confirm", never "applied"`, and CANNOT SAY is never a pass. Gate 1 holds
(`git merge-base --is-ancestor origin/main origin/integration`, exit 0); gate 6
holds (the one new entry, 0181, reads `pushed`); gate 2 was unmet at the time of
writing because CI on this branch's tip was still running, so `integrate.yml` had
not yet swept it. **Production reachability could not be checked from this
container either**: `https://ideabosco.com/` and `https://apps.ideabosco.com/`
both answer `curl: (56) CONNECT tunnel failed, response 403` -- the agent proxy's
refusal, not production's, with `raw.githubusercontent.com` at HTTP 200 as the
control proving the network path is fine and the block is host-scoped.

**Outside the stated Owns, named rather than hidden:** the optional second layer
in `FoundryPlayStats.svelte` and the transport type beside its twin in
`transports.ts`; one stale sentence in `FoundryCard.svelte` that called `Recent`
the default; one assertion in `tests/dom/foundry-card-mosaic.test.ts` GENERALISED
rather than deleted (it conflated the count rule with the default); the
`/dev/foundry-gallery` harness, which gets both transports and a control that
turns the personal one off; and `classroom-updates.json`, per the standing
directive. `docs/history/awesome-keller-pj6hkc.md` carries the measurements.
