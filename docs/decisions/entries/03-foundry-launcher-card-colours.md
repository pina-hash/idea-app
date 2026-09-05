# 03 Foundry launcher card colours
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: open
- Decision:
- Default this assistant would pick: Change the card and rewrite the test's rationale in the same commit.
- Why it is blocked on him: The card carries the app's identity colour, and an identity colour is his call rather than a session's.
- What it unblocks: A one-file launcher change plus its test.
- Context: `src/lib/AppLauncher.svelte` (`.app-card[data-app='foundry']`) and `tests/home-order-and-accent.test.ts`, "gives Foundry the tokens of its own room, not a pair invented for the card". `CLAUDE.md`, "A CARD QUOTES ITS OWN ROOM OR IT DECLARES NOTHING".
- Tree check (2026-09-02): the test and the rule exist as described. Whether the test's written rationale is "now false" depends on what he wants the card to carry, which is the decision itself; the tree cannot settle it.
