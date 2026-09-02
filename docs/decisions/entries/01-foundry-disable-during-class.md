# 01 Foundry: disable during class
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: open
- Decision:
- Default this assistant would pick: A per-section toggle on the section record, set by any section manager and checked server-side on every Foundry serve route; global and scheduled variants are later.
- Why it is blocked on him: It changes what a student can open during class, which is a classroom-policy call and not a build call.
- What it unblocks: A Foundry lane for the toggle, its migration and its serve-route check.
- Context: `CLAUDE.md`, "THE ORIGIN SPLIT" and the two serving routes under `src/routes/b/` and `src/routes/a/`; `$lib/server/foundry-bundle-response.ts` is where a server-side check would go. Nothing exists to extend: a sweep of `src/lib/server/foundry-bundle*.ts` on 2026-09-02 found no disable, pause or class-hours concept.
- Tree check (2026-09-02): the claim that nothing exists holds; no toggle, flag or schedule is present on any Foundry serve path.
