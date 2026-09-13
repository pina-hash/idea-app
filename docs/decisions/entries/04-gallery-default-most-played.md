# 04 Foundry gallery: default to most played
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: decided 2026-09-12. Both the DECISION and the BUILD are closed, see the Build line.
- Decision: 2026-09-12, Mr. Pina: MOST PLAYED first.
- Against the default: plainly, yes. The default below was "keep the current
  default (Recent)". He reversed it. The gallery ships newest-first today and that
  changes.
- Build: CLOSED, by ledger 0185 (`claude/awesome-keller-pj6hkc`, merged to
  `origin/main` and `origin/integration` in commit `7a833149`), on the same
  day the decision was made. This line went on reading OPEN for a day after
  that landed, because nothing had come back to close it: ledger 0185 built
  the fix and wrote its own history entry but never touched this file, and
  ledger 0214 is the session that noticed the gap and corrected the status
  here rather than re-deriving a fix that already exists. Re-verified against
  the tree at ledger 0214's branch point (`origin/integration`): `let sort =
  $state<FoundryGallerySort>(FOUNDRY_GALLERY_DEFAULT_SORT)` in
  `FoundryGallery.svelte`, and `FOUNDRY_GALLERY_DEFAULT_SORT: FoundryGallerySort
  = 'played'` in `telemetry.ts` -- a named export rather than a second literal,
  which is stronger than the one-word fix this line originally asked for and is
  why the line numbers below are gone: the value has one home now and a reader
  no longer needs to find a specific line to trust it. `FOUNDRY_GALLERY_SORTS`
  in `telemetry.ts` already offered `recent`, `played` and `played7d`, and
  migration 0139 already supplied the counts, exactly as this line said -- no
  migration was needed and none was written.
  The tiebreak was checked rather than assumed, as this line asked:
  `sortGallery` has no index term and relies on `Array.prototype.sort` being
  stable (required since ES2019), so equal counts keep `foundry_list_apps`'s
  own order -- a gallery where nothing has been played is every app tied at
  zero and renders exactly as Recent did. `tests/dom/foundry-sort.test.ts`
  pins this at sixty tied apps, past any small-array insertion-sort threshold.
- Not part of this answer: the URL half of the old default, which must not ride
  along. He answered which order comes FIRST, not where the order is stored.
  `FoundryGallery.svelte`'s own header says the sort is a view control that stays
  local, "deliberately NOT in the URL", because a sort in the query string puts a
  second parameter on every link a student pastes. That rule is untouched and
  reversing it would be its own decision.
- One thing the build owes the reader: every play figure this order now ranks on
  is plays THROUGH THE PORTAL only. `FOUNDRY_PLAY_COVERAGE_NOTE`
  (`src/lib/foundry/telemetry.ts`) is why, and CLAUDE.md requires it beside every
  figure. Sorting by a number is a stronger claim about it than showing it, so the
  note matters more under this default than it did under Recent.
  Checked at ledger 0214: the note IS rendered wherever a figure is shown at the
  level of ONE app -- `FoundryPlayStats.svelte` and `FoundryOwnerStats.svelte`,
  both mounted on the detail pane a card opens into. It is NOT repeated on the
  ranked LIST itself: `FoundryGallery.svelte` prints a bare number on each card
  under a play sort, with no note near the sort control or the mosaic. This was
  a considered omission on ledger 0185's part for the personal-stats layer
  (rendering it a second time inside `FoundryGallery` would have meant "a
  second coverage note or none", per that ledger's own history entry) but that
  reasoning was never extended to the per-card ranking numbers, which carry no
  note anywhere on the list surface. Reported here rather than fixed: adding
  prose to a card mosaic is a design decision this ledger's Owns does not
  license unilaterally, and the one place a reader can already find the
  qualification is one tap away, on the detail pane every card opens into.
- Default this assistant would pick: Keep the current default (Recent), and expose the sort in the URL so a shared link can carry it.
- Why it is blocked on him: The default sort decides whose work gets seen first by every student, which is a stated refusal in the code and a values call rather than a build call.
- What it unblocks: A small gallery lane, or nothing if the default stands.
- Context: `src/lib/foundry/FoundryGallery.svelte` (the `sort` state, `FOUNDRY_GALLERY_SORTS`), `src/lib/foundry/telemetry.ts` (`sortGallery`), migration 0139 for the counts.
- Tree check (2026-09-02): the sort exists and is offered (`recent`, plus the play-count orders), so the first half of the claim holds. The second half of the default is contradicted by the tree: `FoundryGallery.svelte`'s own header says the order is a view control that stays local, "deliberately NOT in the URL", because a sort in the query string would put a second parameter on every link a student pastes and make two people opening the same app disagree about what page they are on. Choosing the URL half of this default means reversing that written rule, not merely adding a parameter.
