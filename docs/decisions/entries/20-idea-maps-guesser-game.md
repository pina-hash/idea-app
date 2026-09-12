# 20 An IDEA Maps guesser game

- Raised: 2026-09-09  By: prompt 0109, `claude/docs-standards-ledger-hihkhd`
- Status: open
- Decision: blank. Mr. Pina asked on 2026-09-09 for the idea to be RECORDED and deferred
  it until the map has more depth. That is a "not now", not an answer to what the thing
  would be, which is why this is still open.
- Default this assistant would pick: **not now, and set the gate rather than the date** --
  revisit when five or more rooms are published with compartment-level photos. Nothing is
  waiting on it.
- Why it is blocked on him: it is a new feature nobody has scoped, in a subsystem whose
  spec "authorizes no build by itself". Nothing game-shaped is in that spec, so there is
  no prior framing to build from.
- What it unblocks: nothing. What this entry buys is that the idea exists in the one list
  instead of in a conversation.
- Context: `docs/standards/IDEA_MAPS_SPEC.md` (sections 2, 3, 5.4, 6, 8, 10);
  `docs/decisions/entries/18-maps-media-draft-photos-and-the-signed-in-listing.md`.

## The question, in one sentence

Should `/maps` gain a GeoGuessr-shaped game -- show a photo, ask which room, unit and
compartment it lives in -- and if so, does that game keep score, which is the one part
that changes what `/maps` currently is?

**The idea, in one line:** it is the viewer's own descent run backwards. Section 6's
staged route goes building plan to room plan to elevation to item card; the game shows the
leaf and asks for the path. That inversion is the whole of the concept.

## What is true in the tree today (measured 2026-09-11)

- **Every P1 mechanism has shipped.** Nine maps migrations are on `origin/main`: `0161`
  core, `0162` search, `0163` media, `0164` search-log retention, `0165` conjunctive
  tsquery, `0166` short-link reservation, `0168` media types and plan frame, `0172`
  editor grants, `0186` the anon listing close. Seven routes exist under
  `src/routes/maps/`, the viewer and the gated editor.
- **The acceptance artifact is content, and a checkout cannot confirm it.** Spec
  **line 185**: "One real room fully cataloged is the acceptance artifact." `maps_nodes`,
  `maps_items`, `maps_stock` and `maps_photos` row counts are properties of the production
  database, which no cloud container reaches. **Production is unreachable from here:**
  `DEPLOY_PROBE_URL` unset, no `.env`, and the egress proxy refuses `ideabosco.com`.
- **There is no player.** Spec **line 34**: read access is "Fully public, no sign-in."
  `src/routes/maps/+page.server.ts` reads `locals.supabase` for published rows and reads
  no session; the search log at **lines 137-138** records "no identity (readers are
  anonymous)". So a scored game has nobody to attribute a score TO.
- **Nothing game-shaped is in the spec, still.** The words game, guess, quiz and score
  appear **zero** times in `IDEA_MAPS_SPEC.md` (v1.1). Section 10's four undecided items
  are the accent identity, DXF specifics, a walkable-space graph and anything
  beacon-shaped; section 3's out-of-scope list is checkout tracking, live positioning, 3D,
  drawn paths, DXF in P1 and inventory audit. Neither mentions a game. This is new
  territory, not a lapsed spec item.

## What each option costs

| | Migration? | Applied production state? | Cost |
|---|---|---|---|
| **A. Not now, with a checkable gate** (five-plus published rooms, compartment photos) | no | no | Nothing. The idea stays recorded; the gate is re-checkable by anyone who can read production. **RECOMMENDED.** |
| **B. Build it browser-scored** (state in `localStorage`, no identity) | no | no | A scoping bundle plus a viewer surface. `/maps` stays anonymous and unchanged in kind. Scores do not survive a device. |
| **C. Build it portal-scored** (a leaderboard, streaks, per-student) | **yes** -- a table and its RLS | yes, once applied | **This changes what `/maps` IS**: either the game sits behind the portal session, which contradicts spec line 34, or a second identity is invented for an anonymous viewer. That is a disclosure decision about the public viewer, not a feature. |

**A and B need no migration and touch no applied production state. C does both**, and C
is the only one that alters the spec's public-read row.

## Two things the eventual scoping must answer

1. **The game cannot be built over DRAFT data.** Answers are the map, and the published
   map is public on purpose; `0161`'s draft-and-publish machinery is on every object for
   that reason. Decision 18 (maps-media-draft-photos-and-the-signed-in-listing) is the
   adjacent one.
2. **A wrong guess is a search miss in disguise.** Section 5.4 already logs misses so the
   vocabulary can improve; a game generates a large cheap corpus of "what a person thought
   this was called". **If it is ever built, that is the argument -- not engagement.**

## If nobody decides

Nothing breaks and nothing is blocked; the entry simply stays open and surfaces at the top
of every router kickoff. The cost of never deciding is one recurring line in that list.
The real risk is deciding YES too early: a game over a half-empty map gives the same three
answers every round, teaches nobody the building, and is then judged a bad feature when
what was thin was the data.

## Tree check (2026-09-11)

- The original entry's tree check listed **eight** maps migrations and called `CLAUDE.md`
  wrong for omitting `0164` and `0186`. There are **nine**: it missed `0166`
  (`0166_short_link_reserve_maps.sql`). Corrected above. `CLAUDE.md`'s maps block still
  names only `0161`-`0165`, `0168` and `0172`; reported, not edited -- this bundle owns no
  source file and no `CLAUDE.md`.
- The spec is still one step behind the build: it shows editor grants at P2, which `0172`
  moved to P1 on 2026-09-02. Also reported, not edited.
