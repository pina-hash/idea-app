# 0034 Unblock the pipeline: the deadlock, the burned number, and three conflicted branches
- Issued: 2026-09-03
- By: router chat for IDEA portal work
- Owns: `.github/workflows/integrate.yml`, `.github/workflows/README.md`, `supabase/migrations/0177_*.sql` (a tombstone), `tests/workflows.test.ts`, the generated regions of `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0034-*`, its own `docs/history/` entry, and the merge of three branches.
- Migration permitted: exactly one, 0177, a tombstone changing no schema. Highest on origin/main at issue: 0178
- Status: pushed
- Branch: assigned by the harness. BRANCHED FROM `origin/integration`.
- Notes: THE DEADLOCK. `integrate.yml` merges `origin/main` into the target
  at line 416, then pushes only `if [ ${#merged[@]} -gt 0 ]` at line 494. So
  when every outstanding branch conflicts, the main-merge is computed and
  thrown away, every run. Meanwhile `deploy.yml`'s guard refuses while the
  target is behind `main`. Migrations commit straight to `main` by design, so
  every migration re-opens that gap, and branches conflict routinely while
  lanes run. Pressing Integrate then Deploy in that state cannot terminate;
  it was pressed three times on 2026-09-03 and a person had to merge `main`
  into `integration` by pull request to break out.

  THE BURNED NUMBER. 0177 was reserved for prompt 0031 by the router chat.
  0031 audited correctly, found that edit, delete and their guards already
  existed, and wrote no migration. 0032 then took 0178. `supabase/migrations/`
  now has ONE gap across 178 files, and it has been contiguous for the whole
  history of this repo. The apply path is "paste each file in numeric order"
  and `tests/db/` replays the real chain, so a future 0177 would sort before
  an 0178 already applied to production, in an order nothing has tested.

  THREE BRANCHES CONFLICT and the sweep reports them every run:
  `attachment-picker-paste-image-gptgo3`,
  `item-images-thumbnails-l3bhxp`, and
  `notebook-check-in-management-y5z4b4`.

  Deliberately excluded: any feature change; any fix to a defect a merge
  reveals; and the reservation scheme itself, which is the router chat's to
  change, not a session's.
