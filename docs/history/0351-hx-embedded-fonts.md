---
title: "Ported assignments may carry the site's typefaces as embedded fonts"
date: 2026-09-29
branches: ["main"]
migrations: []
subsystems: ["classroom", "html-assignment"]
---

**What changed.** `hxDocumentCsp` gains `font-src data:`. A ported document that inlines its
typefaces as `@font-face` rules with `data:` URIs now renders them. Before this the policy had
no `font-src` at all, so every font fell to `default-src 'none'` and a document could only use
system stacks (spec section 6.3, measured by ledger 0128).

**Why `data:` and no host.** A `data:` font is bytes the document already holds; it fetches
nothing, so the containment argument (`connect-src 'none'`, no host on any fetching directive)
is unchanged. Admitting `fonts.gstatic.com` would put a remote host back on a document whose
whole containment argument is that it reaches nothing. The cost is size: Rajdhani 500/600/700
and Share Tech Mono 400 as woff2 are about 80 KB, against the 2 MB document cap.

**Measured.** `tests/html-assignment-bridge.test.ts`: the pinned policy string carries the new
directive, and a new test asserts `font-src` names `data:` and no scheme or host that fetches.
66 tests pass in that file; the full suite passed, 639 files and 12,070 tests. In the real frame
(`/dev/html-assignment` with a temporary fixture of the Hook 02 document, removed afterwards), with
the four faces embedded as `data:` URIs: a 48px test string measured 721px in Rajdhani against
1040.34px in the monospace fallback, and 936px in Share Tech Mono against 764.48px in the serif
fallback; `document.fonts` listed all four faces as loaded; no CSP violation was logged.

**Not verified.** Production: the directive ships with the route, so it is live on the next
deploy; nobody has loaded a worksheet on `ideabosco.com` with it yet.
