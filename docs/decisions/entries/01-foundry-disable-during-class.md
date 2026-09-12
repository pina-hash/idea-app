# 01 Foundry: disable during class
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: withdrawn 2026-09-12. ALREADY SHIPPED, closed as already-done rather than as decided.
- Decision: 2026-09-12, Mr. Pina: already shipped. He has a working switch and he
  likes it. This is not an answer he owed -- the capability exists and he has used
  it -- which is why it closes as already-done and not as decided.
- What shipped: measured 2026-09-12.
  `supabase/migrations/0173_foundry_section_gate_description_and_trust.sql` section 1
  gives `classroom_sections` a `foundry_closed_at` / `foundry_closed_by` /
  `foundry_closed_note` stamp (NULL is open, so no section needed a backfill), plus
  `foundry_section_access()`, `foundry_set_section_open(uuid, boolean, text)` and
  `foundry_manageable_sections()`. The client half is `src/lib/foundry/access.ts`
  (pure, `FOUNDRY_CLOSURE_BLOCKS`), `FoundryClassAccess.svelte` and
  `FoundryClosed.svelte`. Per section, checked on the server -- which is this
  entry's own stated default, so the default was right and the build did not wait
  for the answer.
- Tree check: 2026-09-12. The 2026-09-02 line below reads "nothing exists to
  extend". That was true when it was written and is false now, because 0173 landed
  afterwards. The old line stays; a Tree check is dated.
- Default this assistant would pick: A per-section toggle on the section record, set by any section manager and checked server-side on every Foundry serve route; global and scheduled variants are later.
- Why it is blocked on him: It changes what a student can open during class, which is a classroom-policy call and not a build call.
- What it unblocks: A Foundry lane for the toggle, its migration and its serve-route check.
- Context: `CLAUDE.md`, "THE ORIGIN SPLIT" and the two serving routes under `src/routes/b/` and `src/routes/a/`; `$lib/server/foundry-bundle-response.ts` is where a server-side check would go. Nothing exists to extend: a sweep of `src/lib/server/foundry-bundle*.ts` on 2026-09-02 found no disable, pause or class-hours concept.
- Tree check (2026-09-02): the claim that nothing exists holds; no toggle, flag or schedule is present on any Foundry serve path.
