# 0042 One closed section should not close the Foundry everywhere
- Issued: 2026-09-04
- By: router chat for IDEA portal work
- Owns: the Foundry section gate wherever the audit finds it, `src/routes/foundry/**`, one migration (conditional, number taken at commit time), `src/routes/dev/foundry-admin/**`, `tests/foundry-section-gate*`, `tests/db/foundry-section-gate*`, `tools/browser-verify/routes/foundry-*.mjs`, the generated regions in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0042-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, number taken at commit time. Highest on origin/main at issue: 0180
- Status: issued
- Branch: assigned by the harness
- Notes: Prompt 0015 built decision 01 as Mr. Pina answered it: a per-section
  toggle, checked on the server, so an instructor can close the Foundry during
  their own class. It then flagged the consequence in its own report:
  ANY closed section closes the Foundry for that student EVERYWHERE. A
  student in six classes is locked out of every one of them because one
  teacher closed theirs, including at lunch and at home.

  0015 said that was the only reading available with no bell-schedule
  awareness, and it was right at the time. It is still wrong for the student.

  The question this bundle answers is what "during my class" can mean without
  building a scheduler. A section is closed by a person and reopened by a
  person; what is missing is not a clock, it is a scope: the closure should
  bind the student while they are in THAT class, not while they exist.

  Deliberately excluded: a scheduled or bell-aware close, which is decision
  01's deferred half and Mr. Pina's to ask for; `FOUNDRY_LIMITS`; and the
  trusted-publisher roster.
