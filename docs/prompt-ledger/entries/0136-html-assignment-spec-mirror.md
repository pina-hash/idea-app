# 0136 Mirror the HTML-assignment contract as a standards file, corrected from the tree

- Issued: 2026-09-10
- By: Mr. Pina. The HTML-assignment subsystem was specified in a chat document
  that was never mirrored, so `docs/standards/` had no entry for a subsystem
  carrying five merged lanes (0126, 0127, 0128, 0129, 0134) and two applied
  migrations (0195, 0196) -- and three claims in that document were measured
  WRONG by the lanes building against it.
- Owns: `docs/standards/IDEA_HTML_ASSIGNMENT_SPEC.md` (NEW), this lane's row in
  `docs/standards/REGISTER.md`, `docs/prompt-ledger/entries/0136-*`, and its own
  `docs/history/` entry.
- Does NOT own: any file under `src/`, any migration, `CLAUDE.md`, `.env.example`.
  Two other lanes were running concurrently and their files were READ and never
  written -- ledger 0138 owns `src/lib/classroom/html-assignment/**`,
  `src/routes/hx/**` and migration 0197; ledger 0137 owns
  `src/lib/legacy/assignments/_TEMPLATE.html` and
  `docs/standards/IDEA_HTML_ASSIGNMENT_TEMPLATE.md`.
- Migration permitted: no. Claims: none.
- Lands on: `integration` only. Not `main`.
- Status: pushed
- Branch: `claude/html-assignment-spec-hw6fp9`, from `origin/integration` at
  `b2581959`.
- Notes:

  **DUPLICATE CHECK, CLEAN.** No `docs/prompt-ledger/entries/0136-*` existed on
  any ref: `git log --all --diff-filter=A` over that glob returned zero, and a
  `git ls-tree` sweep of every `refs/remotes/origin` and `refs/heads` ref for a
  path matching `/0136-` under the ledger directory returned zero. The eight
  commits whose messages contain "0136" are all about MIGRATION
  `0136_foundry_delete.sql` and none touches a ledger path. `--unshallow`
  succeeded (2009 commits, no `.git/shallow`); `user.name = Claude`,
  `user.email = noreply@anthropic.com`.

  **WRITTEN FROM THE TREE, NOT FROM THE PROMPT.** Every claim in the document was
  confirmed against the source: `manifest.ts`, `bridge.ts`, `store.ts`,
  `mount.ts`, `rubric.ts`, `answers.ts`, `HtmlAssignmentFrame.svelte`,
  `src/routes/hx/**`, `src/lib/server/html-assignment-document.ts`, migrations
  0086, 0095, 0128, 0195, 0196, and the five lanes' own ledger and history
  entries. Every backticked name in the document was swept against the tree
  before commit.

  **THREE PLACES THE PROMPT WAS WRONG AND THE TREE WON**, all recorded in the
  document and in the history entry:

  1. **The font correction is ledger 0128's, not 0126's.** The measurement lives
     in `docs/history/html-assignment-manifest-contract-8xazmp.md`, which is the
     port-fixture lane. 0126's entry mentions fonts only as a browser-harness
     limitation.
  2. **The sandbox-directive correction is 0126 AND 0134**, not 0134 alone. 0126
     measured the absence and reported it without patching it (its own ledger
     lists it as contract deviation 2, "Not added; reported for the contract
     owner"); 0134 added the directive and proved it. The document credits both.
  3. **"Nothing in the database refuses the shape the standard forbids" is true
     of one path and false of the other.** `classroom_set_rubric` /
     `_classroom_check_levels` (0095) accepts a level worth 0.5 -- that is what
     0129 measured. But `_classroom_check_html_manifest` (0195) REFUSES it, on
     every level, with `(...)::numeric <> floor((...)::numeric)`, and 0195's own
     apply-time self-check asserts the companion `top >= levels - 1` rule
     deliberately. So the no-half-points rule IS in SQL on the manifest path and
     is absent only on the rubric-store path. Section 12.3 states it that way.

  **THE WRITE GATE IS DESCRIBED AS IT STANDS.** Migration 0197 is NOT on this
  tree: `supabase/migrations/` tops out at 0196. `classroom_save_response`
  (0086, last replaced 0128) is still the only function writing
  `classroom_responses`, it still requires a `classroom_assignment_specs` row,
  still resolves the block id inside that spec, and still gates on
  `v_type not in ('textField', 'table', 'checklist')` against manifest types
  whose only overlap is `table`. Section 9 says so, names the tree state it was
  read at, and says a concurrent lane may supersede it.

  **THE 1-POINT CRITERION CONFLICT IS RECORDED AND NOT RESOLVED.** Section 12.2
  states it plainly, names all three candidate resolutions with their costs, and
  points at `docs/decisions/entries/22-*`. It takes no position. It also corrects
  a citation habit: decision 22 and ledger 0128 both cite the rubric standard as
  "1.3" and "1.2", which are VERSION numbers -- that document's sections are
  named, not numbered -- so this document cites it as
  `Criterion Structure > Rules`.

  **REGISTER ROW ADDED LAST**, after everything else was committed, with the file
  re-read immediately before the edit. Ledger 0137 also adds a row; the
  re-read found no 0137 row present, so no conflict arose and nothing was
  merged or dropped.

  **NOT VERIFIED.** No source file, migration, harness or browser pass -- this
  lane writes documentation only. Nothing was run against the live Supabase
  project. `npm run verify:readme` was deliberately NOT run (no route spec was
  added, and a fifteen-minute pass while two lanes are moving is the collision
  this repo has paid for repeatedly). `svelte-check` has no baseline claim here:
  no file under `src/` was touched.
