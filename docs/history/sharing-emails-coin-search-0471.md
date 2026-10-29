---
title: "Ledger 0471: IdeaCAD sharing shows names and emails (0329), a coin record search for a full coin admin (0330), and the classmate-name hold on tournament entries and market listings (0331)"
date: 2026-10-28
branches: [sharing-emails-coin-search-0471]
migrations: ["0329", "0330", "0331"]
subsystems: [IdeaCAD, Coins, Connector, Tournaments, Classroom]
---

Solo session, task `docs/feedback/2026-10-28/QUEUE-0471.md` (three parts), worktree `wt-0471`, beside lanes 0458 and 0465.
The three files were written as 0328 to 0330; lane 0458 landed its own 0328 first, so they were renumbered at landing
to 0329, 0330 and 0331 (tests find each file by name, so no test named a number).

### Part 1: IdeaCAD sharing shows a name and an email (0329, decision 72)

- **Decision**: `docs/decisions/entries/72-ideacad-sharing-shows-name-and-email.md`, with his words. It is the one
  exception to CLAUDE.md "A chosen public identity replaces the account identity completely", for IdeaCAD sharing and
  the email only; CLAUDE.md's rule now names it. A chosen picture still replaces the Google photo.
- **0329** `supabase/migrations/0329_ideacad_sharing_names_and_emails.sql` replaces three bodies, no signature:
  - `_ideacad_share_person_json` (the one statement of a person) adds `email`, so the directory, the access list and the
    batch share's results all carry it. A grant whose account is gone carries the grant's address, which 0205's
    `ideacad_document_grants` already returned to the same readers.
  - `ideacad_share_people` matches any part of the shown name, the account name or the address, for everyone. The owner
    check, the school-only filter, the floor, the ranking and the cap are 0325's, unchanged (diffed against 0325: only
    the match terms and the "starts with" rank term moved; the rank term now uses the escaped query, which 0325 did not).
  - `ideacad_direct_documents` (0217's body, diffed: one key added) sends `ownerName` on a model that is not yours,
    from the same person function.
  - Its header is where 0325's notes are corrected; 0325 is not edited.
- **Client**: `PickerPerson.email` and an email line in `src/lib/ui/PersonPicker.svelte` (drawn only when a row carries
  one, so the tournament picker is unchanged); `SharePerson.email`, `AccessPerson.email` and `pickerRow` in
  `share.ts`; the access list and staged rows in `ShareModelPanel.svelte`; the launch card's owner line
  ("by Ana Reyes ana.reyes@boscotech.net", the address alone before 0329) in `DocumentCard.svelte`; the in-memory api
  and fixture follow 0329; the launch page's own search also matches the owner's name.

### Part 2: the coin record search (0330)

- `coin_records_search(category, from, to, note, limit, offset)`, `_coin_full_staff()` only, reads only. Category by
  short name or name (retired included), school days read in school time, note words anywhere (a typed `%` or `_` is
  a character), newest first, 100 a page up to 500, `total` and `next_offset`. Each record: id, time, school day, the
  student's roster name and address, the effective amount, category id and name, note, reversed. It states none of the
  relabel's rules; `coin_transactions_relabel` re-checks the tier and refuses a reversed record itself.
- Connector: a hand entry in `src/lib/server/connector/registry/coin.yaml`, reached as `site_call` on
  `coin_records_search` with `category`, `from`, `to`, `note`, `limit`, `offset`. **Nothing was relabeled.**

### Part 3: the classmate-name hold on tournaments and the market (0331, report 3d4d8b76)

- `_idea_text_hold_trigger`, one trigger function on four tables (`tournament_entries.display_name`,
  `tournament_entry_members.name`, `tournament_entry_styles.tagline`, a student `coin_market_listings` row's title and
  text), calls 0324's `_idea_roster_name_hits` with the entry's registrants or the listing's poster left out. The file
  restates no part of the check (a test holds that). On a hit the text waits in `idea_text_holds`: a new entry or roster
  name shows "Name waiting for an OK", an edit keeps the old text, a tagline keeps the old one (or none), and a listing is
  posted hidden with its reason, through 0276's own hidden state, so every read that lists listings already leaves it out.
- Never held: staff (boscotech.edu), any admin, and a write with no session. A student host is held: anyone may create a
  tournament. Decided by an admin or a staff host of the tournament, and for a listing by coin staff whose scope reaches
  the poster (0276's moderation rule); anything else answers the not-there sentence. Allowing applies the text (or
  unhides the listing); turning it down leaves the stand-in and closes a listing as removed. An accepted change to the
  same field supersedes what was waiting.
- `idea_text_holds_list` and `idea_text_hold_decide`, shown on the sign-offs page beside held team names:
  `TeamNameHolds.svelte` now takes a list of sources ("Names waiting for your OK"), the team pair and the new pair.
  Connector hand entries in `classroom.yaml` (read; decide at confirm, `proof: generic`), and `idea_text_holds` in
  `log-tables.ts`.
- **Decision taken here, worth his look**: roster names (a registrant's chosen name) are checked as well as entry
  names, because a solo registration copies the entry name into the captain's roster name and holding one without the
  other would show the text anyway. A walk-up teammate typed by a captain under a classmate's real name is held; that
  false positive costs one tap, the trade 0456 already made.

### Measured

- `tests/db/ideacad-direct-share-people.test.ts` (19, rewritten from lane 0470's): the chain short of 0329, a grant made
  through 0217's share and two through 0325's batch share before it, the 0325 access list read first (no `@` in it),
  then 0329 applied twice. Email present on every school row, in the access list and in the batch results; found by
  chosen name, account name and any part of the address; no Google photo behind a chosen name (a person with no chosen
  name is the control); no visitor by name or any part of the address (a school account found by the same three
  searches is the control); nothing to a non-owner; the owner line by chosen name and email, none on your own model,
  and neither model listed to a stranger.
- `tests/db/coin-records-search-0330.test.ts` (8): seeded rows backdated to 2026-10-19, one reversed through the real
  reversal, a record at 11:30 pm Pacific on Oct 19 (in) and on Oct 18 (out); applied twice; the scanner over the real
  file finds nothing with a planted insert as control; owner reads 6, a second admin, a teacher of record (who is
  section coin staff, asserted) and a student are refused, anon is denied; filters, paging and the read-only claim
  (coin records and the relabel log unchanged); the ids found, less the reversed one, relabel to Weekly Pay on the test
  database.
- `tests/db/name-holds-0331.test.ts` (14): an entry, a banner and a listing seeded through the real RPCs before the file
  are untouched by it; holds and their controls (no name, own name, staff); who sees and decides each kind; allow and
  turn down; the final count by status.
- `tests/dom/ideacad-share-panel-mount.test.ts` (6): emails in the picker (2 of 2 suggested rows), in who has it (1 of
  1), on the staged row; found by part of an email; the owner line on the 2 cards shared with you and on none of the 6
  of your own. `tests/ideacad-direct-share-transport.test.ts` (8).
- **Mutation proofs**, permissive direction, each against its one file, restored from a copy and md5-checked, measured
  under the files' first numbers (0328 to 0330): the directory's owner check removed, 1 of 19 red; the school-only
  filter removed, 3 red; the Google photo sent behind a chosen name, 1 red; the email left off, 9 red; the coin search's
  full-admin gate opened, 1 of 8 red; the school day read in UTC, 2 red; the hold list and decide gate opened, 2 of 14
  red; a hit never held, 8 red; everyone exempt, 8 red.
- `svelte-check` 0 errors, 33 warnings in 18 files (29 `state_referenced_locally`, 3 `css_unused_selector`, 1
  `perf_avoid_nested_class`), the baseline, after `svelte-kit sync`, on the rebased tree. A first run at the default
  3 GB heap reported 15 errors in team document files this lane never touched and a second run aborted out of memory;
  at a 4 GB heap the same tree reads the baseline, so the 15 were the instrument, not the tree.
- Browser pass (`npm run verify:browser -- --route ideacad-launch`, this container's Chromium, fallback fonts because
  Google Fonts is blocked), 2026-10-28: 6 runs, 114 measurements, 0 outside threshold. `/dev/ideacad-launch?state=sharing`
  at 375px: 0px overflow, 42 controls with the smallest 68x44, the share panel 6 controls with 0 zero-box and 0 clipped
  of 20 text elements, the launch page 136 text elements (emails among them) with 0 clipped. At 1440px: 0px overflow,
  50 controls with the smallest 88x44. Contrast: a name 13.91:1, the grey line under it (the email line uses the same
  token) 7.44:1, Share 7.61:1.
- `connector:build` regenerated the inventory, overlay and schema files; `claude-md-check` and `history:verify` pass.
- Full `npm test` once, on the rebased tree: 967 files, 17444 tests, 18 failed in 8 files. Six files (15 tests) are
  the standing set (`classroom-panel-layout-render`, `db/cert-0262-exam`, `db/cert-flow`,
  `db/feedback-round-0380-foundry`, `db/ideacad-feature-graph-storage`, `standards-version-header`). Two were this
  lane's and are fixed: `connector-registry` (the search's description ran past 200 characters and two argument lines
  named an identifier) and `ideacad-solid-launch-library` (the normaliser now carries `ownerName` only when it is sent,
  so a row from before 0329 reads exactly as it did). After the fix, `connector:build` again and those files plus
  `connector-coverage` green: 3 files, 621 tests. The full suite was not run a second time.

### Not verified

- The live database: this container cannot reach production. The three files apply through `migrate.yml` on push, in
  order; until each does, the share panel shows no email lines, the owner line shows the address alone, the coin search
  answers the connector's not-found, and the sign-offs page shows team holds only.
- A real signed-in round trip on ideabosco.com, and the connector tools through a live chat (`connector:build`
  regenerated the generated layer locally).
- The weekly pay correction itself: not run, by instruction.

### What undoes it

Each file's header carries its paste. 0329: re-run 0325's sections 2 and 3 and 0217's `ideacad_direct_documents`.
0330: drop the one function. 0331: drop the four triggers, the six functions and `idea_text_holds`; a listing held when
it is undone stays hidden until it is unhidden from the market's staff tools.
