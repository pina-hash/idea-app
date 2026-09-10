# 0134 Finish the HTML assignment system, and land it on `main`

- Issued: 2026-09-10
- By: an integration session. Four lanes (0126, 0127, 0128, 0129) built the
  pieces of the ported-HTML-assignment feature and none of them touch: the
  manifest contract, the rubric derivation, the serving route and the frame,
  and the store. Nothing renders and nothing saves. This bundle is the wiring,
  one security change, and the deploy.
- Owns:
  - `src/lib/classroom/html-assignment/**` (all of it)
  - `src/routes/hx/**`
  - the HTML-assignment regions of `ContentComposer.svelte`,
    `ItemDetail.svelte`, `ItemBody.svelte`, `GradingConsole.svelte` and
    `src/lib/classroom/transports.ts`
  - `src/routes/dev/html-assignment/**`
  - `tests/html-assignment*`, `tests/dom/html-assignment*`,
    `tests/db/html-assignment*`
  - `tools/browser-verify/routes/html-assignment*.mjs` and the generated
    regions of `tools/browser-verify/README.md`
  - `CLAUDE.md` (the HTML-assignment section it owes), `.env.example`
  - `docs/prompt-ledger/entries/0134-*`, and its own `docs/history/` entry
- Migration permitted: none.
- Claims: none.
- Lands on: `main`.
- Status: issued
- Branch: `claude/html-assignment-integration-a6ibch`, branched from
  `origin/integration` at `00623a40`.
- Notes:

  **DUPLICATE CHECK, CLEAN.** No `docs/prompt-ledger/entries/0134-*` existed on
  any ref before this entry (`git log --all --diff-filter=A` over that glob:
  zero hits; `origin/main` and `origin/integration` both top out at `0133`).
  Every remote `claude/**` branch was swept for a commit touching a `0134`
  path: zero hits.

  **NO MIGRATION, AND THAT IS THE DESIGN RATHER THAN AN OMISSION.** Answers
  land in `classroom_responses` through the EXISTING `classroom_save_response`,
  unchanged. Needing a migration would mean the design drifted, and the
  standing instruction for that is to stop and report rather than write one.
  `0193` through `0196` are all applied to production.

  **THE SECURITY CHANGE IS THE GATE ON EVERYTHING ELSE.** 0126 measured that
  the served document's CSP carries no `sandbox` directive, so a DIRECT
  navigation to `/hx/<docId>` is not placed in an opaque origin the way a
  framed one is -- only the iframe's own `sandbox` attribute does that. With
  `PUBLIC_HX_SANDBOX_ORIGIN` unset in production the route answers on
  `ideabosco.com`, the cookie-carrying host. This bundle adds
  `sandbox allow-scripts` to the served document's CSP and proves it by direct
  navigation in the container's real Chromium. If that proof does not pass,
  nothing lands and `/hx` stays off the trunk.
