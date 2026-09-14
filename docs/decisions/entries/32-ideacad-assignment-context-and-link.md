# 32 How does a classroom assignment hand work to standalone IdeaCAD?

- Raised: 2026-09-14  By: ledger 0235
- Status: DECIDED 2026-09-14 by Mr. Pina. The current item-backed editor stores
  configuration on the assignment, but the automatic plain-link import flow is
  not built as this decision describes.
- Decision: Assignment context is **COPIED into the assignment at import, never
  live-linked to a template**. A later template edit must never change work a
  student has already opened.
- Decision: An assignment links to IdeaCAD as a plain embedded link a student
  clicks — **“nothing fancy”**. The link is attached automatically at import;
  nobody confirms it by hand.
- Decision: The link opens the standalone full-screen application. It does not
  embed the editor back into the assignment page; that approach is rejected in
  decision 31.
- Context: `docs/IDEACAD.md`;
  `supabase/migrations/0201_ideacad_blade_editor.sql`;
  `src/lib/ideacad/transports.ts`; `src/routes/ideacad/`.

## Open questions

- What is the import file or template format, and which exact fields constitute
  the copied IdeaCAD context?
- At which import operation is the plain link attached, and what visible text
  and URL does it use?
- What should happen if import receives an unknown workspace or unsupported
  context version?
- May an instructor deliberately refresh an assignment that no student has
  opened, and how is “has work” determined?
- How are already-existing schema-4 assignments brought to the plain-link model,
  if they are brought to it at all?

These are implementation questions. This entry does not choose answers for them.
