# 0362 HTML authoring standard 1.14: folding moves and the classroom look

- Issued: 2026-10-05
- By: IDEA100 R2 chat, directly, Mode: solo
- Repo: `pina-hash/idea-app`
- Owns: `docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md` 1.14, its `REGISTER.md` row.
- Migration permitted: no.
- Status: done.
- Notes: standing instruction (Mr. Pina, 2026-09-30) that the authoring standard updates
  whenever an HTML assignment is built. Hook 03 rebuilt with folding moves and the plate
  look for the 2026-10-06 class, after Mr. Pina asked for less scrolling and clean
  collapsing.

## Findings for the next website round (Mr. Pina, 2026-10-05, not fixed here)

None of these can be fixed from inside an HTML document; each needs a website change.

1. **A student's pictures do not stay inside a ported worksheet.** On upload the document
   draws the picture from its own bytes. After a reload `idea:state` carries only a portal
   proxy URL, which the document CSP (`img-src data: blob:`) refuses, so the document shows
   "Saved: <name>". `CLAUDE.md` makes this deliberate ("bytes go frame-to-parent only,
   never back"). Showing restored pictures in place needs a decision from Mr. Pina: either
   the parent sends a downscaled thumbnail back in `idea:state` (display only, never
   stored as a value), or the parent draws restored pictures in parent chrome beside the
   block they belong to.
2. **On the grading page a ported worksheet's pictures are listed as separate files at
   the bottom**, not beside the question they answer. `HtmlGradingWork` / the grading
   console could place each `classroom_submission_files` row under its `block_id` in
   `HtmlAnswerList`, the way the student sees it.
3. **A file's Download control on the grading page does nothing.** Not reproduced: it
   needs a signed-in production session. On paper `/api/classroom/submission-file/<id>`
   302s to a Supabase signed URL with `download=`. Suspects to check first: the
   `Lightbox` `<a download>` pointing at a same-origin URL that redirects cross-origin,
   inside a modal `<dialog>`; and `downloadFilename` for `.SLDPRT` names. A browser pass
   with `/dev/login` against a local stack can drive it.
