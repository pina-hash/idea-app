# 0144 Two agents, one repository: the guards learn a second branch prefix

- Issued: 2026-09-10
- By: Mr. Pina's decision of 2026-09-10 to run GPT-6 Astra in this repo as Codex cloud
  tasks beside Claude Code. On that date integrate.yml (lines 566, 721, 1475),
  tools/idea-status.py (line 174) and tools/migration-claims.mjs (line 437) enumerated
  `claude/**` alone, so a Codex branch holding a migration number was invisible to the
  collision check and was never swept; there was no AGENTS.md.
- Owns: AGENTS.md (new); docs/CODEX_ENVIRONMENT.md (new);
  tools/codex-setup.sh and tools/codex-maintenance.sh (new);
  .github/workflows/integrate.yml and .github/workflows/README.md, only the lines that
  enumerate branch prefixes and the prose that describes them; tools/idea-status.py and
  tools/migration-claims.mjs, only the ref and holder filters and the headings that name
  them; docs/prompt-ledger/README.md, the Branch line and step 4 of the check;
  tools/browser-verify/_shared.mjs (or wherever `launch()` lives), only Chromium
  resolution, and its README's prose if that changes; tests/workflows.test.ts,
  tests/idea-status*.test.ts and tests/migration-claims*.test.ts if they exist, plus new
  tests for the two prefixes; docs/standards/IDEA_instructions.md,
  docs/standards/IDEA_REPO_WORKFLOW_STANDARD.md and docs/standards/REGISTER.md, exactly
  the edits in PART 3, verbatim; CLAUDE.md, one new paragraph (PART 3);
  docs/prompt-ledger/entries/0144-*; and this bundle's own docs/history/ entry.
- Migration permitted: none.
- Claims: none.
- Lands on: NOT `main`. A pull request against `integration`, merged by Mr. Pina.
- Status: pushed
- Branch: `codex/two-agents-one-repository`, prefix `codex/`, from origin/integration at
  `ce87155315f3ad9fbec98db4709e13f235c2d28a`. The container-local branch is `work`.
- Notes:

  **DUPLICATE CHECK.** The supplied clone result, measured 2026-09-11 05:20 UTC,
  found main and integration identical at `ce87155315f3ad9fbec98db4709e13f235c2d28a`,
  no 0144 entry, no `AGENTS.md`, no `docs/CODEX_ENVIRONMENT.md`, and no remote
  `codex/**` branch. The available local controls agreed: the last 40 subjects did not
  describe this bundle and `git ls-files` found neither environment file before build.

  **A1, COMPLETE CLASSIFICATION OF THE ORIGINAL HITS.** Class (a), executable guards or
  their headings: `.github/workflows/integrate.yml` lines 7, 82, 90, 148, 435-436,
  488, 566, 679, 683, 699, 721, and 1475; `tools/idea-status.py` lines 26-27, 174,
  589, and 601; `tools/migration-claims.mjs` lines 25, 400-401, 411, 437, 712, and
  714; and `docs/prompt-ledger/README.md` lines 144 and 199. The three workflow case
  filters, the status ref filter, and the migration holder filter matched the prompt's
  claims exactly. Class (b), prose or examples specifically about Claude Code that stay
  true: `tools/apply-migration.mjs` lines 272 and 427; `CLAUDE.md` lines 4130, 4133,
  4152, 4163, 4174, 4295, and 4323-4324; `docs/standards/IDEA_instructions.md` lines
  235, 237-238, 332, 527, 940, 993, 1015, 1131, 1137-1139, 1182, 1525, 2521,
  3149, 3202, 3526, and 3558; `docs/standards/IDEA_REPO_WORKFLOW_STANDARD.md` lines
  23, 69, 153, 192, and 194; and tests' historical examples at
  `tests/derived-numbers.test.ts` line 66, `tests/gauntlet-practice-meter.test.ts` line
  646, `tests/idea-status.test.ts` lines 168, 179, 188, 192, 281, and 291, and all
  hits in `tests/migration-claims.test.ts` at lines 25, 212, 219, 229, 245, 262,
  276, 293-294, 300-301, 312, 336, 356-357, 361, 369-370, 382, 399-400, 420,
  453, 456, 469, and 472. Class (c), neither a current guard nor still-complete prose:
  `docs/standards/IDEA_instructions.md` lines 1441 and 1529 and
  `docs/standards/IDEA_REPO_WORKFLOW_STANDARD.md` line 125 enumerated Claude branches
  alone. The prescribed PART 3 replacement fixes line 125; the other two were outside
  the verbatim standards-edit authority and remain reported rather than silently edited.

  **FOUND AND BUILT.** There was no root `AGENTS.md`, Codex environment document, or
  setup script. The browser resolver already tried Playwright's managed path first, then
  `CHROMIUM_PATH`, the pinned and unversioned `/opt/pw-browsers` locations,
  `/usr/bin/chromium`, and `/usr/bin/google-chrome`, so its code did not change. The
  canonical list is now `AGENT_BRANCH_PREFIXES` in `integrate.yml`; every workflow site
  reads it, the two tools mirror it by name, and tests pin the mirrors. Both prefixes now
  feed status refs, standing counts, migration holders, ledger conventions, merge
  eligibility, and contained-ref deletion. The requested standards text, pointer,
  environment documentation, scripts, tests, and history record were added.

  **MEASUREMENTS, 2026-09-11.** Ubuntu 24.04.4 initially selected Node 20.20.2; NVM
  also contained Node 24.15.0. `npm ls --depth=0` found the complete dependency tree.
  The selected database test failed before Postgres on Node 20, then passed 6 tests in
  1.35 seconds on Node 24 with no fetch; its binary came from installed
  `@embedded-postgres/linux-x64`. Setup selected Node 24 and `npm ci` installed 333
  packages in 7 seconds, including the platform package postinstall, then the
  network-disabled agent phase received HTTP 403 fetching `playwright@1.56.1` for the
  Chromium installer. Chromium therefore did not launch. The focused branch-prefix and
  standards suite passed 123 tests across 4 files in 4.57 seconds. The workflow mutation
  produced 1 failed and 58 passed tests and both copied-file SHA-256 restorations matched.
  The status positive control showed 0144 from the codex ref and one standing codex
  branch; removing codex from the status registry reduced that standing count from 1 to
  0. `migration-claims.mjs` reported no codex holder for this migration-free bundle, and
  its fixture proves a codex holder of 0186 is held. The full serialized suite completed
  7,386 tests in 301.96 seconds: 7,383 passed, 6 skipped, and 3 failed in two files whose
  end-to-end migration controls require a loopback proxy that this Codex container refused
  with HTTP 403. All 373 other files passed; the bundle's focused tests were clean.
