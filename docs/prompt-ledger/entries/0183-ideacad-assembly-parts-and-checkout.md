# 0183 IdeaCAD assembly parts and part checkout: decision 24's blocker removed

- Issued: 2026-09-12
- By: router chat
- Owns: `supabase/migrations/0207_*.sql`, `src/lib/ideacad/assembly.ts` (new),
  `tests/db/ideacad-assembly*`, `docs/decisions/entries/24-*`,
  `docs/prompt-ledger/entries/0183-*`, and its own `docs/history/` entry.
  NO UI IN THIS BUNDLE -- no `.svelte` file.
- Migration permitted: exactly one. Claims: 0207. Highest landed migration at issue: 0203
- Status: issued
- Branch: `claude/amazing-bohr-qxhly9`, branched from `origin/integration` at `b0a8101d`
- Runs THIRD in a chain of three in flight: ledger 0179 claims `0205`
  (`claude/great-bell-ppysbn`, owns `src/lib/ideacad/sharing.ts`) and ledger 0181 claims
  `0206` (the replacement for `0202`'s ideacad function guard). Neither file is touched
  here. `0207` must apply cleanly after both.
- Notes: THE BLOCKER LEDGER 0179 NAMED. `ideacad_documents` has no notion of a PART, so
  there is nothing for a checkout to claim. Mr. Pina's design of 2026-09-12: an IDEA-Blade
  assembly is SEVERAL PARTS, ONE PERSON HOLDS A PART AT A TIME -- industry checkout, not
  concurrent editing of one part, which he named as a real future feature and explicitly
  did not want here. Switching who holds what must be "extremely easy and intuitive", and
  THE ASSEMBLY OWNER HAS FULL CONTROL over who is editing what and can reassign teammates
  to parts LIVE. `0207` makes a document hold ordered parts, each carrying its own feature
  tree, migrates every existing document into a one-part assembly, and adds a transient
  exclusive hold on the PART. The ten `0201` RPCs are not redefined -- `0205` redefines
  seven of them and a second replacement would revert its sharing widening. Four
  properties, each a test: a second holder is refused while a part is held; the assembly
  owner can force a reassignment at any time; a released part is immediately claimable;
  and a hold that is never released does not lock the part forever. THE STALENESS RULE IS
  THIS ASSISTANT'S, NOT MR. PINA'S -- he did not specify one -- and is recorded as ours.
