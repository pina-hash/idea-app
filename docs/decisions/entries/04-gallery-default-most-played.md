# 04 Foundry gallery: default to most played
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: decided 2026-09-12. The DECISION is closed; the BUILD is open, see the Build line.
- Decision: 2026-09-12, Mr. Pina: MOST PLAYED first.
- Against the default: plainly, yes. The default below was "keep the current
  default (Recent)". He reversed it. The gallery ships newest-first today and that
  changes.
- Build: OPEN, and small, measured 2026-09-12. It is the initial value on
  `FoundryGallery.svelte` **line 127**, `$state<FoundryGallerySort>('recent')`, which
  becomes `'played'`. `FOUNDRY_GALLERY_SORTS` (`telemetry.ts` **lines 81-85**)
  already offers `recent`, `played` and `played7d`, and migration 0139 already
  supplies the counts -- so nothing new is collected and no migration is needed.
  Worth knowing for the lane: `sortGallery`'s tiebreak is the INCOMING order, so a
  gallery where nothing has been played yet is every app tied at zero and renders in
  exactly the order Recent shows. The change is invisible until there are plays.
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
- Default this assistant would pick: Keep the current default (Recent), and expose the sort in the URL so a shared link can carry it.
- Why it is blocked on him: The default sort decides whose work gets seen first by every student, which is a stated refusal in the code and a values call rather than a build call.
- What it unblocks: A small gallery lane, or nothing if the default stands.
- Context: `src/lib/foundry/FoundryGallery.svelte` (the `sort` state, `FOUNDRY_GALLERY_SORTS`), `src/lib/foundry/telemetry.ts` (`sortGallery`), migration 0139 for the counts.
- Tree check (2026-09-02): the sort exists and is offered (`recent`, plus the play-count orders), so the first half of the claim holds. The second half of the default is contradicted by the tree: `FoundryGallery.svelte`'s own header says the order is a view control that stays local, "deliberately NOT in the URL", because a sort in the query string would put a second parameter on every link a student pastes and make two people opening the same app disagree about what page they are on. Choosing the URL half of this default means reversing that written rule, not merely adding a parameter.
