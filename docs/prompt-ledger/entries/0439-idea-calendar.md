# 0439 The IDEA calendar

- Issued: 2026-10-26
- By: Mr. Pina, through the IDEA & FRC chat (docs/feedback/2026-10-26/QUEUE-0439.md)
- Owns: new calendar routes and modules (src/lib/calendar/**, src/routes/calendar/**, a per-class calendar route under src/routes/classroom/[sectionId]/), the smallest edits elsewhere in src/ to place the calendar and its "this week" strip, src/lib/connector/** and its generated files, the HTML manifest validator and docs/standards/IDEA_HTML_ASSIGNMENT_SPEC.md (a new section), src/routes/dev/** (new harness routes only), supabase/migrations/ (new files only), tests/**, tools/browser-verify/ (route specs only), classroom-updates.json, docs/subsystems/environment.md, a new docs/subsystems/calendar.md and its row in CLAUDE.md, one new docs/decisions/entries/ file at the next free number, docs/prompt-ledger/entries/0439-*, docs/feedback/2026-10-26/RESULTS-0439.md, your own docs/history/ entry. Shared with 0438 (rebase, never merge generated files by hand): classroom-updates.json, generated connector files, HtmlAssignmentFrame.svelte.
- Migration permitted: yes, as many as needed, each at the next free number at landing. Claims: 0308, 0309
- Status: pushed
- Mode: solo (beside 0438)
- Branch: main (solo)
- Notes: main 3dfff740 (pacing as a manifest display key), 58203049 (0308, 0309), fa397554 (apply-migration: a ledger number two entries share resolves to the one claiming the migration; Migrate had refused 0308 on 0439-authoring-2-4-subject-palette.md beside this entry), then 52cd7fcd (the calendar client) and a2857988 (this entry, docs/history/work-0439.md, RESULTS-0439.md) in one push. 0308 and 0309 applied (records 1b8f9951, 6575c9d4). Outside Owns, named in RESULTS: tools/apply-migration.mjs, tools/hx-kit kit.js/kit.css/starter.html.
