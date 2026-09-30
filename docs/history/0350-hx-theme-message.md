---
title: "Ported assignments: the parent tells the document whether the site is light or dark"
date: 2026-09-29
branches: ["main"]
migrations: []
subsystems: ["classroom", "html-assignment"]
---

**What changed.** `HtmlAssignmentFrame` now sends `idea:theme` with `light` or `dark` after the
first `idea:state` and whenever the portal's `<html data-theme>` changes (a `MutationObserver`,
since the theme picker changes the attribute without a reload). `hxThemeOf` in `bridge.ts` is
the one mapping: Space White is `light`, IDEA, Matrix and no attribute are `dark`.
`IDEA_HTML_ASSIGNMENT_SPEC.md` is 1.3.

**Why.** Mr. Pina asked for assignment documents to follow the site's dark and light themes.
A sandboxed document cannot read the parent's attribute and has no storage, so on its own it
can only follow the device setting, which on school machines is usually light while the site
is dark. Two words instead of theme names, so a new site theme needs no document change. The
message is advisory: a document that ignores it is unaffected, and one with its own toggle
lets the student's choice win for the visit.

**Measured.** In the real frame at `/dev/html-assignment` with a temporary fixture pointing at
`IDEA100_D05_Hook-02-V1-Print-and-Pull.html` (not committed; `_documents.ts` restored by
md5): the document opened dark with no attribute, went light when the parent's attribute was
set to `space-white`, and dark again when it was removed, at 1440 and 375. Video overlay
alignment in the same document read a delta of 0,0,0,0 for two videos at both widths.
`svelte-check` 0 errors, 37 warnings, 20 files. Bridge tests 65 pass.

**Not verified.** A signed-in production page; the theme picker itself driving the change (the
test set the attribute directly, which is what the picker writes).
