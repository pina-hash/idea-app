# 20 An IDEA Maps guesser game, recorded and deferred
- Raised: 2026-09-09  By: prompt 0109, `claude/docs-standards-ledger-hihkhd`
- Status: open
- Decision: Mr. Pina asked on 2026-09-09 for the idea to be RECORDED and explicitly
  deferred it until the map has more depth. This entry is that record. It is `open`
  rather than `decided` because the deferral is a "not now", not an answer to what the
  thing would be.
- Default this assistant would pick: not now. Revisit when the maps viewer has real
  content -- concretely, when `IDEA_MAPS_SPEC.md`'s own P1 acceptance artifact, "one
  real room fully cataloged", is in the published data, and preferably when a second
  room is too, since a guesser game over one room is a game with one answer.
- Why it is blocked on him: it is a new feature nobody has scoped, in a subsystem whose
  spec says in its own preamble that it "authorizes no build by itself: build prompts
  are written from it only after Mr. Pina says the spec is settled." Nothing about a
  game is in that spec -- not in section 3's out-of-scope list, not in section 10's
  deliberately-undecided list -- so there is no prior framing to build from and no
  earlier default to contradict.
- What it unblocks: nothing. Deferring costs nothing and no lane is waiting. What this
  entry buys is that the idea exists in the one list instead of in a conversation, so
  the next person to think of it finds it already raised rather than raising it again.
- Context: `docs/standards/IDEA_MAPS_SPEC.md` (sections 3, 5.4, 6, 8, 10);
  `supabase/migrations/0161_maps_core.sql`, `0162`, `0163`, `0165`, `0168`, `0172`,
  `0186`; `CLAUDE.md`'s IDEA Maps block; `docs/decisions/entries/18-maps-media-draft-photos-and-the-signed-in-listing.md`,
  the only other maps decision.

## What the idea is, written down once so it is legible later

A GeoGuessr-shaped game over the IDEA building: show a photo from the map and ask
where it lives -- which room, which unit, which compartment. **It is the viewer's own
descent run backwards.** Section 6 of the spec describes the staged route a reader
takes now (building plan with the room highlighted, room plan with the unit
highlighted, elevation with the compartment highlighted, then the item card, breadcrumb
throughout). The game shows the leaf and asks for the path. That inversion is the whole
of the concept and is worth having in writing, because "a guesser game for the map" is
the kind of phrase that means four different things to four readers a year later.

**This is the first record of it anywhere.** A sweep of the tree on 2026-09-09 found
exactly one mention of the idea and it was prompt 0109's own ledger entry commissioning
this file: nothing in `docs/history/`'s fifteen maps entries, nothing in the spec,
nothing in `CLAUDE.md`, nothing in the other seventeen decisions, no commit subject.

## Why "more depth" is the right gate, and what it means concretely

**The spec already says content is what P1 is finished by.** Section 8: "One real room
fully cataloged is the acceptance artifact." Every P1 MECHANISM has shipped -- the core
model, search, media, the admin editor, the public viewer -- and one P2 item, student
editor grants, was pulled forward. What has not been confirmed is the artifact, and a
repository checkout structurally cannot confirm it: `maps_nodes`, `maps_items`,
`maps_stock` and `maps_photos` row counts are properties of the production database,
which no cloud container reaches.

**`0172`'s own header is the best statement of why depth is the constraint**, written
about a different feature and true of this one: `IDEA_MAPS_SPEC.md` section 7 put
granted editors in P2, and "it moved to P1 on 2026-09-02 because Mr. Pina is the only
person who can catalog anything, and a map nobody can help fill is a map that stays
half empty." A game built over a half-empty map is a game that gives the same three
answers every time, teaches nobody the building, and is then judged as a bad feature
when what was thin was the data.

**A rough floor, offered so "more depth" is checkable rather than a feeling:** enough
published rooms that a round cannot be won by elimination (call it five or more), and
enough photos attached at the compartment level that a prompt image is not obviously
the one photo the room has. `maps_photos` attaches at three levels -- node, item type,
unique item -- so there is no schema work needed to have prompt images; there is only
cataloging.

## Three things the eventual scoping will have to answer, named so they are not discovered mid-build

1. **There is no player.** Section 2's read row is "Fully public, no sign-in. Published
   data is anonymously readable on every read path", and `/maps` deliberately reads no
   session and sits outside the `/maps/edit` gate. Section 5.4's search log records a
   query, a result count and a timestamp with "no identity (readers are anonymous)". So
   a scored, streaked or competitive game has no one to attribute a score TO without
   either putting the game behind the portal's session (which changes what `/maps` is)
   or inventing a second identity for it. A game that keeps score only in the browser
   is the shape that costs nothing; anything else is a design decision about the
   viewer's public-ness.
2. **Answers are the map, so the game leaks the map.** That is fine -- the published
   map is public on purpose -- but it means a game cannot be built over DRAFT data, and
   `0161`'s draft-and-publish machinery is on every object for exactly that reason.
   Decision 18 is the adjacent one: draft photos and who may list them.
3. **A wrong guess is a search miss in disguise.** Section 5.4 already logs misses so
   the vocabulary can be improved; a game generates a large, cheap corpus of "what a
   person thought this was called", which is arguably more valuable than the game. If
   the game is ever built, that is the argument for building it -- not engagement.

## Tree check (2026-09-09)

- The words game, play, quiz, score and guess do not appear in
  `docs/standards/IDEA_MAPS_SPEC.md`. Confirmed by reading it.
- Section 10's four deliberately-undecided items are the maps accent identity, DXF
  import specifics, a walkable-space graph, and anything beacon-shaped. No game.
  Section 3's six out-of-scope items are checkout/possession tracking, live
  positioning, 3D rendering, drawn walking paths, DXF import in P1, and inventory
  audit. No game. So this is new territory rather than a spec item that lapsed.
- Eight maps migrations exist on `origin/main`, not the seven `CLAUDE.md` lists:
  `0161`, `0162`, `0163`, `0164`, `0165`, `0168`, `0172`, `0186`. `CLAUDE.md` names
  `0161-0165`, `0168` and `0172` and omits `0164` (search-log retention) and `0186`
  (the `maps-media` anon listing close, which is decision 18's). That is a `CLAUDE.md`
  line for a later bundle, reported rather than edited -- this bundle owns no source
  file and no `CLAUDE.md`.
- The spec is one known step behind the build already: it still shows editor grants at
  P2, which `0172` moved to P1 on 2026-09-02. Also reported, not edited.
