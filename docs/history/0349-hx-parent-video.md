---
title: A ported assignment can play a video, and the parent is what plays it
date: 2026-09-29
branches: [main]
migrations: []
subsystems: [classroom, html-assignment, security]
---

Mr. Pina asked for the SolidWorks Day post's 16 how-to videos to play inside the post, with
thumbnails, replacing the step drawing while one plays.

**Measured first: a player cannot run inside the document.** In the container's Chromium, a
`youtube-nocookie.com/embed/<id>` frame served from an ordinary page drew its player (title,
channel, Watch on); the same frame one level inside a document under `HX_SANDBOX_FLAGS`, with
`frame-src` opened for the test, drew an empty black box and no `<video>` element. A nested
frame inherits the sandbox and the opaque origin, and the only document-side repair is
`allow-same-origin`, which is forbidden. Opening `frame-src` in `hxDocumentCsp` was therefore
not the fix and was not done.

**What was built.** `idea:video` (frame to parent): a YouTube id and a rectangle in the
document's own pixels, plus `clipTop` for a floating header covering the top of the box; a
null id closes. `hxReceive` admits only `^[A-Za-z0-9_-]{11}$` and a rectangle inside the
document, `hxVideoEmbedUrl` builds the youtube-nocookie URL from the id alone, and
`HtmlAssignmentFrame` draws the player absolutely over the frame inside `.hx-frame-box`, keyed
on the id so a moved rectangle never reloads it. `idea:video-state` answers each open and
close. A `video` dev fixture drives it.

**What it admits, stated.** Any public YouTube video over the document's own area. Less than
the popup flags (decision of 2026-09-11) already grant, and import is admin-only.

**Measured.** On `/dev/html-assignment?doc=video` at 375 and 1440: drawn rectangle equals the
asked one to the pixel, still equal after a page scroll, a hit test at the box centre lands on
the player, Close removes it, and a non-id and an oversize rectangle are both dropped (0
overlays, 2 drops listed). The real SolidWorks Day post served temporarily through the real
route (not committed): delta 0 on every surface (step, answer, step-by-step toggle, the
Point-stop-click card, a drill hint), the clip applied when the header floats (152 to 159 px),
and the player gone on a step change, another answer, a tab switch and a closed hints panel.
Mutation: loosening `HX_VIDEO_ID` to `/^.+$/` reddens 2 tests; restored md5-identical.

**Not verified.** Playback itself: YouTube answers "Video unavailable" to this container even
unsandboxed, so the control and the test look the same past the player chrome. oEmbed answers
200 for the videos, so embedding is allowed on them. Nothing was run on a real Classroom page,
a phone or Safari.
