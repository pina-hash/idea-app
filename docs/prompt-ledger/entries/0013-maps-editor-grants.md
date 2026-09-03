# 0013 IDEA Maps: granted editors, draft-only, publish stays admin
- Issued: 2026-09-02
- By: router chat for IDEA portal work (Lane 1, Maps)
- Owns: `supabase/migrations/0172_maps_editor_grants.sql`, `src/lib/maps/grants.ts`, `src/lib/maps/GrantAdmin.svelte`, `src/lib/maps/transports.ts`, `src/routes/maps/edit/**`, `src/routes/dev/maps-grants/**`, `tests/maps-grants*`, `tests/db/maps-grants*`, `tools/browser-verify/routes/maps-grants*.mjs`, the generated counts block in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0013-*`, and its own `docs/history/` entry.
- Migration permitted: exactly one, 0172. 0171 is RESERVED for prompt 0011. Highest on origin/main at issue: 0170
- Status: pushed
- Branch: `claude/maps-editor-grants-2ktnt3`
- Notes: `IDEA_MAPS_SPEC.md` section 7 puts granted student editors in P2.
  Mr. Pina moved them to P1 on 2026-09-02, because he is currently the only
  person who can catalog anything and a map nobody can help fill is a map
  that stays half empty. The spec goes to 1.2 separately; this bundle does
  not edit it.

  The contract, from section 7 and unchanged: a grant is a (`user`, `node`)
  row meaning subtree edit rights, DRAFT ONLY. Publish stays admin. A grantee
  can create, edit and delete draft objects anywhere under a node they hold,
  and can do nothing at all outside it.

  Prior art is `0169_notebook_section_reviewer_tier.sql`, which is the same
  shape one level down: a roster table, grant and revoke RPCs, and a
  predicate the policies call. Every maps write policy today is
  `public.is_admin()` from `0067`; this bundle widens them and must not
  loosen them.

  Deliberately excluded: the public viewer at `/maps`, which is a separate
  Lane 1 bundle; revision-history surfacing, still P2; and any change to who
  may publish.

  Landed: migration 0172 committed straight to `main` at `07a8ff2` with its
  db test in the same commit, which is the only thing this bundle put on
  `main`. Everything else is on the branch. 0171 turned out NOT to be
  reserved -- prompt 0011 had already taken it and merged
  (`0171_classroom_extra_credit.sql`, commit `0fd0cec`), so the highest on
  `origin/main` at the time of issue was 0171, not 0170.
