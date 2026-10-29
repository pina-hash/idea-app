---
title: "Ledger 0470: IdeaCAD sharing you can pick, see and confirm (0325), many people per model in one call with undo, and one shared person picker"
date: 2026-10-28
branches: [ideacad-sharing-0470]
migrations: ["0325"]
subsystems: [IdeaCAD, Connector, Tournaments]
---

Solo session, task `docs/feedback/2026-10-28/QUEUE-0470.md`, report 155bba3d (a student, on `/ideacad`):
"sharing sucks. theres no confirmation and typing manually sucks. just pickl and share. simple. smooth
experience. and ensure many users per file".

### What was there, read off the tree before designing

- The launch page's Manage area on a model card (`DocumentCard.svelte`) had one email box, a Permission
  select (Can view, Can edit, Remove access) and Update sharing. It called 0217's
  `ideacad_share_direct_document` (owner only, any signed-in account) or 0205's `ideacad_unshare_document`,
  then refreshed the list with no notice, so nothing confirmed a change.
- Nothing on the launch page listed who had a model. 0205's `ideacad_document_grants` exists and returns
  grant rows WITH addresses; no direct-modeler surface called it.
- Many people per model was already true of the schema: `ideacad_grants` is keyed (document_id,
  grantee_email) with no cap. The limit was the one-address form, not the data.

### What was built

- **0325** (`supabase/migrations/0325_ideacad_sharing_people.sql`), three functions and two private
  helpers; no table, policy, signature or existing body changes.
  - `ideacad_share_people(document, query)`: the picker's directory.
  - `ideacad_direct_document_access(document)`: who has a model, by name and picture.
  - `ideacad_set_direct_document_access(document, changes)`: share, change and remove many people in one
    call, calling 0217's and 0205's single-row functions per person, per-row refusals, at most 100 changes
    a call, and an `undo` list (the inverse of exactly the rows that changed) the same function takes back.
  - `_ideacad_share_circle` (teammates and classmates, computed once per call) and
    `_ideacad_share_person_json` (the one statement of the identity rule).
- **`ShareModelPanel.svelte`** in the card's Manage area replaces the old form: who has it (Can view or Can
  edit changed in place, Remove), the picker (teammates suggested on focus), a list of picked people each with
  its own access, one Share button, and a confirmation in words with Undo for eight seconds. A refused person
  stays in the list with the reason; everyone else lands. Wording in `src/lib/ideacad/solid/launch/share.ts`.
- **The person picker.** Lane 0455's `src/lib/tournaments/PersonPicker.svelte` was on main. It could not
  carry pictures, a multi-pick, or rows without an address, so it was generalised into
  **`src/lib/ui/PersonPicker.svelte`** (with `src/lib/ui/person-picker.ts`) and the tournament file became a
  thin adapter over it with its props unchanged: one picker, two surfaces. Each surface hands in its own
  directory and maps rows onto `PickerPerson`. One behaviour fix rode along for both: typing now clears the
  highlighted row, so Enter can never pick from a list drawn for the words before the keystroke (found by the
  share mount test, where a typed address picked a stale teammate suggestion).
- **The retired path is removed**: the `share` transport, the email box and its state. One existing test
  (`tests/db/ideacad-direct-documents.test.ts`, the revoke case) called that transport and now calls the two
  functions directly.
- **Connector**: hand entries in `src/lib/server/connector/registry/ideacad.yaml` for all three (two reads,
  the batch share at `confirm` with `proof: generic`), and `ideacad_grants` added to
  `src/lib/server/connector/log-tables.ts`. Each acts as the caller on the caller's own models, so through the
  connector it is Mr. Pina sharing a model of his.

### The decision: what a student may search (the minimum the feature needs)

- Only while sharing their own model: the directory takes the document and answers its owner alone.
- Only Bosco Tech accounts that have signed in (boscotech.net, boscotech.edu); a visitor is never listed,
  though a typed address still shares with any signed-in account as 0217 always allowed.
- Two letters first (an empty box suggests teammates only), twelve results, teammates then classmates
  then the school.
- A name, a picture, Staff or not, the relation and their access to this model. **Never an address**, from
  the directory or the access list; a person is an opaque key (their account id).
- A chosen display name replaces the account completely: found by that name or by the whole address typed
  exactly, never by the account name or part of the address, and no Google photo behind a chosen name.
- Probing: a missing model and one that is not yours answer the same sentence from all three functions; a
  typed address that has never signed in answers 0217's own sentence, which an owner could already get.
- Teammates are a posted, visible team draw (`_classroom_team_set_visible`) in a class both are active in;
  classmates share an active class or its teacher of record. Teacher of record, not "manages", because an
  admin manages every section.

### Measured

- `tests/db/ideacad-direct-share-people.test.ts`: 15 tests over the whole tree short of 0325, with a grant
  seeded through 0217's real share before 0325 applies; re-applies cleanly. Forty people in one call land
  (41 on the model); 101 changes is refused.
- Mutation proofs, permissive direction, against that file only, restored from a copy and md5-checked each
  time: the directory's owner check removed (1 test red), address-prefix matching allowed behind a chosen
  name (1 red), the access list's owner check removed (1 red), the Google photo sent behind a chosen name
  (1 red), the school-domain filter removed (2 red). Green again after each restore.
- `tests/dom/ideacad-share-panel-mount.test.ts` (5) and `tests/ideacad-direct-share-transport.test.ts`.
- Browser pass (`npm run verify:browser`, this container's Chromium, fallback fonts because Google Fonts is
  blocked), 2026-10-28, new route `/dev/ideacad-launch?state=sharing` (Manage open, one existing grant, one
  teammate picked) plus the two existing launch routes: 6 runs, 114 measurements, 0 outside threshold. At
  375px: 0px horizontal overflow, 42 controls with the smallest 68x44, share panel 6 controls 0 zero-box
  0 clipped. At 1440px: 0px overflow, 50 controls with the smallest 88x44. Contrast: count 13.91:1, a name
  13.91:1, the relation line 7.44:1, Share 7.61:1. The first pass failed the front door's word-off-border
  claim on Remove (a visually hidden name inside the button measured as its word, -50.5px); the hidden
  name moved to `aria-label` and the claim passed at both widths.
- `svelte-check` 0 errors, 33 warnings in 18 files (the baseline), after `svelte-kit sync`, on the rebased tree.
- Full `npm test` once, on the rebased tree: 951 files, 17320 tests, 21 failed in 8 files. Five are the
  known pre-existing set (`classroom-panel-layout-render`, `db/cert-0262-exam`, `db/cert-flow`,
  `db/feedback-round-0380-foundry`, `db/ideacad-feature-graph-storage`); two of the earlier seven,
  `db/coin-stocks-relaunch` and `db/html-manifest-team-roles`, now pass. Three were new: two were this
  lane's and are fixed (`db/ideacad-grants-anon-execute-surface` wants every new ideacad function
  classified, so the five are; `derived-numbers` wanted the browser README counts regenerated and the new
  route measured, `tools/browser-verify/measured/ideacad-launch-state-sharing.json`); the third,
  `standards-version-header` on `IDEA_MORNING_ANNOUNCEMENTS.md` (header 1.6, changelog 1.7), arrived from
  main in `481afb99` and is not this lane's to edit (the test says to correct it upstream).
- Two lanes landed 0322, 0323 and 0324 while this one was being verified, so the file was renumbered twice
  at landing and is 0325. After the last rebase: `connector:build` regenerated, `svelte-check` at the
  baseline again, and 13 targeted files (1115 tests) green, the db, connector, dom and tournament ones
  among them. The full suite was not run a second time.

### Not verified

- The live database: this container cannot reach production. 0325 applies through `migrate.yml` on push;
  until it does, the panel says "Sharing is being updated on the site. Try again in a few minutes." in place
  of the controls (PGRST202 alone).
- A real signed-in round trip on ideabosco.com, and a real uploaded picture through `/api/avatar`.
- The connector entries through a live chat; `connector:build` regenerated the generated layer locally.

### What undoes it

The drop statement in 0325's header. Grants made through the new function are ordinary `ideacad_grants` rows
and stay.

### For a later lane

- The blade editor's classroom `SharePanel` (0205, item-bound, classmates only) still uses a typed address.
  It could mount the same picker over a directory scoped to the item's roster.
- The launch card still shows a shared model's owner as an address ("by ..."), from 0217's list. Showing the
  owner by name is a change to `ideacad_direct_documents` and its own disclosure decision.
