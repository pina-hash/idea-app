# 0122 Reconciling the forked notebook overhaul: bringing 0119's losing branch across by content

- Issued: 2026-09-10
- By: Mr. Pina, after `IDEA_MATERIALS_PROCESS.md`'s fork condition was met by
  ledger 0119 being issued once and run twice.
- Owns: `src/lib/notebook/**`, `src/routes/notebook/**`,
  `src/routes/dev/notebook*/**`, `tests/notebook*`, `tests/dom/notebook*`,
  `tools/browser-verify/routes/notebook*.mjs` and
  `classroom-view-as-notebook.mjs`, the generated regions of
  `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0122-*`, and its
  own `docs/history/` entry.
- Migration permitted: no. Claims: none.
- Lands on: `integration`.
- Status: pushed
- Branch: `claude/notebook-theme-reconcile-wo0u8a`, branched from
  `origin/integration` at `21b0801d`.
- Notes: THE SITUATION WAS A FORK. Ledger 0119 was issued once and run twice.
  Two sessions branched from `b03a9410` and rewrote `NotebookView.svelte` and
  the notebook theme system in different directions; both were green and both
  were fully measured, and neither contained a line of the other's work.
  `claude/notebook-ui-theme-overhaul-t3dc3a` WON by arriving first, is merged
  into `integration`, and is not reverted.
  `claude/notebook-ui-theme-overhaul-0gnx0f` is still standing and `merge-tree`
  refuses it; its diff against `b03a9410` is the only copy of its work.

  FOUR THINGS WERE BROUGHT ACROSS BY CONTENT, NOT BY MERGE -- no git merge of
  the losing branch was attempted, because it conflicts and any resolution is a
  coin toss. Each was read, judged against the landed base, and rebuilt there:
  per-pane scroll above 1024px keyed on a prop rather than on the identity of a
  mount; a pinned pane head over a scrolling body; the compose actions pinned to
  the pane's foot with every explanatory sentence moved above them; and the
  plate picker reading `<html data-theme>` rather than the preference store.

  THE THREE LOAD-BEARING PIECES OF THE LANDED WORK ARE UNTOUCHED and were
  re-measured after every change: the collapsed phone row at 88px with the
  controls on the open entry only, the Next check-in chip, and the `auto-fit`
  columns when nothing is open.

  Decision 08 (`docs/decisions/entries/08-notebook-spreadsheet.md`) is OPEN and
  is not prejudged: no table or spreadsheet node is built, designed around, or
  closed.

  The bundle's own `docs/history/` entry records that ledger 0119 forked, which
  branch won, what was brought across and what was deliberately left. That entry
  is the loser's only record.

  Harness Vite boot is 180 to 187s cold against a 180s window: Vite was started
  separately on 5199 and reused. No `pkill -f`. No migration. Push, never
  force-push.
