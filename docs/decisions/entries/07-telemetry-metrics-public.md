# 07 Foundry telemetry: make the two owner-only metrics public
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: open
- Decision:
- Default this assistant would pick: Not public; add them to the owner's own dashboard.
- Why it is blocked on him: Widening a public payload is a disclosure decision (`CLAUDE.md`, "Widening a public or preview payload is a DISCLOSURE DECISION"), and it is his.
- What it unblocks: Either nothing, or a small owner-dashboard lane.
- Context: migration `0139` (`foundry_app_play_stats`, which returns NULL for a non-owner, and `foundry_play_counts`, the gallery's counts); `CLAUDE.md`, "NO PER-PLAYER READ OF PLAY DATA EXISTS FOR ANYONE".
- Tree check (2026-09-02): `foundry_app_play_stats` is owner-scoped in 0139 as described; the two public counts already reach the gallery through `foundry_play_counts`.
