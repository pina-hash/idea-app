# 31 What is IdeaCAD, and where does it run?

- Raised: 2026-09-14  By: ledger 0235
- Status: DECIDED 2026-09-14 by Mr. Pina. The standalone route is built; the
  general/blank workspace and multi-workspace chooser are not built.
- Decision: **“This is not a technical precision program. You are sketching
  things in 3D space to get your idea across. It should be quick to use,
  extremely quick to use. It's IdeaCAD, as in it's to develop ideas. It's not
  to make technical drawings.”** Speed and directness beat precision and rigor
  wherever they conflict.
- Decision: **Embedding the editor inside a classroom assignment page is
  REJECTED.** It was tried, shipped, and rejected on sight because the graphics
  area rendered about **373px wide**. IdeaCAD is a standalone full-screen app
  reached from the home page. This is not an approach to revisit or a responsive
  variant waiting for polish.
- Decision: There will be a **BLANK / general workspace** alongside Blade, and
  the blank workspace can **OPEN documents from other workspaces**. This is not
  built. Standalone IdeaCAD defaults to Blade while Blade is the only workspace;
  once two workspaces exist, it presents a chooser.
- Context: `docs/IDEACAD.md`; `docs/history/ideacad-fullscreen-0227.md`;
  `src/routes/ideacad/`; `src/lib/ideacad/workspaces.ts`.

## Open questions

- What tools and feature vocabulary belong in the blank/general workspace?
- When the blank workspace opens another workspace's document, is that a
  read-only interpretation, a new blank-workspace copy, or a choice presented
  to the person opening it?
- What exactly does the two-workspace chooser show, and may a user choose a
  non-Blade default afterward?
- Which precision aids are useful conveniences without turning IdeaCAD into the
  technical-drawing program Mr. Pina rejected?

No answer to those questions is implied by the current Blade implementation.
