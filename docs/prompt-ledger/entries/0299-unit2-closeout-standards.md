# 0299 Unit 2 closeout: mirror HTML authoring 1.1, push print standards 1.1, register

- Issued: 2026-09-25
- By: IDEA209H Unit 2 chat (closeout), for one Claude Code session (Sonnet 5)
- Owns: `docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md` (new), `docs/standards/IDEA_PRINT_STANDARDS.md`, `docs/standards/REGISTER.md` (the PRINT row and the new AUTHORING row only), `docs/prompt-ledger/entries/0299-*`, and its own `docs/history/` entry.
- Does not touch: `src/**`, `supabase/**`, `materials/**`, `.github/**`, `CLAUDE.md`, any other standards file.
- Migration permitted: no. Claims: none.
- Status: superseded by 0333
- Notes: Three files attached to the session by Mr. Pina. Sweep on 2026-09-25 at main 0725e49 reported PRINT 1.1 AHEAD of mirrored 1.0 and AUTHORING UNMIRRORED.

  Superseded by 0333, which merged the two 1.1 texts by content as 1.2.

  **BLOCKED at the audit step.** The prompt's step 4 claim ("IDEA_HTML_ASSIGNMENT_AUTHORING.md
  does not exist" on origin/main, REGISTER has no AUTHORING row) is false as of this session's
  start: origin/main already carries `docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md` at
  version 1.1 (commit `f5a4b033`, "Land IDEA_HTML_ASSIGNMENT_AUTHORING.md 1.1 in
  docs/standards/"), and `REGISTER.md` already carries an AUTHORING row for it at 1.1 /
  2026-09-25. So the "unmirrored" premise this prompt's own Notes line describes no longer
  holds - a separate session (ledger unknown to this one) landed a first mirror in the
  meantime.

  Worse: that already-landed 1.1 and this session's attached 1.1 are NOT the same document.
  Both carry the identical header "Version 1.1 - 2026-09-25", but the changelog entries name
  different source material and the bodies genuinely differ (diffed section by section):
  main's 1.1 was "written from the IDEA100 Rotation Survey (2026-09-22) and the IDEA100
  Dogtag (2026-09-24)" and adds a probe-clipping rule, a follow-the-reader element, a
  ResizeObserver caution, section 9b (handing in a non-picture file) and a grading-export
  note; the attached 1.1 was "written from the IDEA209H Unit 2 and FRC5669 Shop Trophy
  documents built 2026-09-15 to 2026-09-25" and adds a different rule (the parent's
  `idea:state` echo landing late and overwriting mid-word typing), a different harness step,
  probe-array/probe-overflow content, and a section 12 on the 2MB media cap. Neither is a
  superset of the other. This is two chats independently minting the same version number
  and date for genuinely different content, not a mirror gap.

  Per the prompt's own step 4 ("If any differs, STOP and report what you found. Do not merge
  by guessing"), the BUILD step (copying the three attached files over origin/main's current
  ones) was not performed. This entry, the audit findings above, and the mismatch are the
  only things this branch changes. PRINT_STANDARDS was NOT re-verified past its header once
  the AUTHORING conflict was found, since the prompt gates the whole build on step 4 passing
  as a unit. Reconciling the two 1.1 texts (a diff-and-merge, or asking which chat's version
  should stand) needs a human decision and is not something this session should guess at.
