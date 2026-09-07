# 06 Foundry: trusted publishers
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: open
- Decision:
- Default this assistant would pick: Reviewed after the fact, with the review queue showing a trusted publisher's update as already live.
- Why it is blocked on him: It decides which students' work reaches other students without a staff read first, which is a supervision call.
- What it unblocks: A Foundry lane modelled on the two existing allowlist tiers.
- Context: migrations `0155_gauntlet_authoring_tier.sql` (`gauntlet_authors`, `gauntlet_can_author()`) and `0167_frc_reviewer_tier.sql` (`frc_reviewers`) are the template; `CLAUDE.md`, "GAUNTLET AUTHOR TIER" for the allowlist shape. The open question is whether a trusted publisher's update is unreviewed or reviewed after the fact.
- Tree check (2026-09-02): both template migrations exist on `origin/main`; no publisher tier exists for Foundry.
- Tree check (2026-09-07): shipped by `0173_foundry_section_gate_description_and_trust.sql` section 3 (`foundry_trusted_publishers`, `foundry_is_trusted()`; a trusted student's `foundry_submit_version` publishes in the same transaction and the review queue lists it as live, not yet reviewed), and ledger 0015 records the answer. This entry's Status and Decision lines above were not updated by any bundle and are the owner's to flip; prompt 0098 left them as found.
