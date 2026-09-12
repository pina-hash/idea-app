# 0178 IdeaCAD: wire the store through ItemDetail, and remove the prediction gate

- Issued: 2026-09-12
- By: router chat (IdeaCAD lane, after 0170's store and 0171's managers)
- Owns: the IdeaCAD region of `src/lib/classroom/ItemDetail.svelte`, the IdeaCAD region of
  `src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte`,
  `src/lib/ideacad/BladeEditor.svelte`, `src/lib/ideacad/mount.ts`,
  `tests/dom/ideacad-mount*`, `tools/browser-verify/routes/ideacad*.mjs` and its measured
  store entries, `docs/decisions/entries/26-*`,
  `docs/prompt-ledger/entries/0178-*`, and its own `docs/history/` entry. NO MIGRATION.
- Migration permitted: no. Claims: none. Highest landed at issue: 0203; next free 0204,
  claimed by ledger 0177 and not touched here.
- Status: pushed
- Branch: `claude/wizardly-dirac-i1ix59`, branched from `origin/integration` at `8241494f`
- Runs in parallel with: ledgers 0175 (`claude/serene-noether-d9iapn`) and 0177
  (`claude/busy-newton-trto6y`), both Foundry, both `issued` at branch time. Neither
  surface is touched here.
- Notes: TWO HALVES. **(1) THE EDITOR WRITES NOWHERE IN PRODUCTION.**
  `+page.svelte` line 43 calls `createIdeacadTransports(data.supabase)` and never passes
  the result anywhere; the only route to `BladeEditor` is `ItemDetail.svelte`, which
  ledger 0171 did not own, so everything 0167/0170/0171 built is mounted and unwired.
  Pass the transports through, build the store with `createIdeacadStore`, hand it to the
  editor, and prove a round trip end to end through the 750ms autosave in `store.ts`.
  Do not reimplement the debounce, the serialized writes or the terminal `conflict`
  state, and do not add a second throttle.

  **(2) THE PREDICTION GATE COMES OUT, ON MR. PINA'S DECISION OF 2026-09-12.** Physics
  is always visible: inertia and radius of gyration render from the first frame beside
  the rules, nothing hidden and no prediction required. His reasoning: IDEA100 is a
  rotation class, there is no time to teach the mathematics behind rotational inertia,
  and visible numbers help students build maximally competitive designs. **This reverses
  work from two bundles and that is decided rather than lost**: 0160 fixed a
  one-keystroke leak in the gate and 0171 fixed it opening on the press rather than on
  the write and a recorded prediction not unlocking. Both were correct against their
  prompts; the prompts predated his answer.

  **THE PREDICTION ITSELF STAYS.** `ideacad_set_prediction` is applied, the stored
  rationale stays, and students still say which concept they think spins longest and
  why. What goes is the LOCK on the numbers.

  Decision 26 closes with his answer, and its recorded defect is CORRECTED: the Rules
  rail dropping the fifth rule (`engagement`) is deliberate, not a bug -- he is not
  enforcing engagement this rotation.
