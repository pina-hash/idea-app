# 0223 A teacher can turn the Blade editor on for an assignment

- Issued: 2026-09-13
- By: router chat
- Owns: `src/lib/classroom/ContentComposer.svelte`, the instructor arm of
  `src/lib/classroom/ItemDetail.svelte`, `src/lib/ideacad/transports.ts`,
  `src/routes/dev/ideacad-attach/**`, `tests/ideacad-attach-*`,
  `tests/db/ideacad-attach-*`, `tools/browser-verify/routes/ideacad-attach*.mjs`,
  the generated counts blocks in `tools/browser-verify/README.md`,
  `docs/prompt-ledger/entries/0223-*`, and its own `docs/history/` entry.
  **AMENDED MID-SESSION BY THE ROUTER CHAT, TWICE.** (1)
  `src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte`, prop lines on the
  `ItemDetail` invocation only -- the control is unreachable without it, and
  ledgers 0201 and 0217 both left exactly this wiring gap for somebody else.
  (2) `tools/browser-verify/measured/**`, for this lane's own `ideacad-attach-*`
  specs only, run through the SCOPED `npm run verify:readme -- --route
  /dev/ideacad-attach` and never the whole-tree form: the prompt said "this
  bundle changes no route spec" and in the same breath asked for a browser route
  spec at 375 and 1440, which contradict. The route-spec sentence was withdrawn;
  the browser spec stands.
- Migration permitted: no. **Claims: none.** `ideacad_set_editor` shipped in
  `0201` and is applied.
- Status: issued
- Branch: assigned by the harness, branched from `origin/integration`.
- Notes: IdeaCAD is fully built and UNREACHABLE. No surface outside
  `src/routes/dev/` calls `ideacad_set_editor`, and no published classroom item
  anywhere carries `assignment_schema_version` 4, so no teacher can create a
  Blade assignment and no student can open one. This is the lane that makes the
  subsystem exist for a user.
