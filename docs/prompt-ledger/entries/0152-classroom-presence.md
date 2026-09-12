# 0152 Who is actually working: presence on the grading console

- Issued: 2026-09-11
- By: a session issued directly by Mr. Pina, 2026-09-11, who approved the
  collection explicitly and set the constraint on it in the same breath ("just
  keep the data secure"). Downstream of ledger 0143, which deferred exactly this
  and said why: "Telemetry of any kind. No presence, no active time, no
  per-student status beyond the `state` column that has existed since 0086. It
  is a separate design with its own retention question about minors' data."
- Owns: `src/lib/classroom/presence/**` (new), the presence region of
  `GradingConsole.svelte` and the grade route, `src/lib/classroom/live.ts` (ONE
  new topic only), `supabase/migrations/0200_*.sql`,
  `tests/db/classroom-presence*`, `tests/dom/presence*`,
  `src/routes/dev/presence/**`, `tools/browser-verify/routes/presence*.mjs` and
  the generated regions of its README, `docs/prompt-ledger/entries/0152-*`, and
  its own `docs/history/` entry.
- Migration permitted: exactly one. Claims: 0200. Highest on origin/main at
  issue: 0198.
- Status: pushed
- Branch: `claude/inspiring-planck-gp601z`, branched from `origin/integration`
  at `7be051f6`.
- Notes:

  **Ledgers 0147 through 0151 run in parallel and none of their files are
  touched.** In particular the student's own item page
  (`src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte`) is NOT in this
  list and is not edited, which leaves exactly one wire unmade -- see the
  history entry, which names the file and the expression.

  **FOUR RULES, stated in the prompt as non-negotiable and each proved in
  `tests/db/`:** a student never sees a peer's presence (RLS, with an anonymous
  control and a signed-in peer control); only the item's teachers of record and
  site admins read a section's presence (a teacher of a different section
  refused); `anon` can neither read nor write; and presence rows are purged
  after 90 days.

  **The minimum is stored and nothing else.** `(item_id, student_email)` with
  last seen, last input, accumulated active seconds and the last reported
  visibility. No keystrokes, no content, no per-event log.
