# 04 Foundry gallery: default to most played
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: open
- Decision:
- Default this assistant would pick: Keep the current default (Recent), and expose the sort in the URL so a shared link can carry it.
- Why it is blocked on him: The default sort decides whose work gets seen first by every student, which is a stated refusal in the code and a values call rather than a build call.
- What it unblocks: A small gallery lane, or nothing if the default stands.
- Context: `src/lib/foundry/FoundryGallery.svelte` (the `sort` state, `FOUNDRY_GALLERY_SORTS`), `src/lib/foundry/telemetry.ts` (`sortGallery`), migration 0139 for the counts.
- Tree check (2026-09-02): the sort exists and is offered (`recent`, plus the play-count orders), so the first half of the claim holds. The second half of the default is contradicted by the tree: `FoundryGallery.svelte`'s own header says the order is a view control that stays local, "deliberately NOT in the URL", because a sort in the query string would put a second parameter on every link a student pastes and make two people opening the same app disagree about what page they are on. Choosing the URL half of this default means reversing that written rule, not merely adding a parameter.
