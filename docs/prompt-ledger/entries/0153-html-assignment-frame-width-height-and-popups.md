# 0153 HTML assignment frame: the reading column, the 2px border, and the popup widening

- Issued: 2026-09-11
- By: router chat
- Owns: `src/lib/classroom/html-assignment/bridge.ts` (the flags constant only),
  `src/lib/classroom/html-assignment/HtmlAssignmentFrame.svelte`,
  `src/routes/hx/_headers.ts`, `tests/html-assignment-bridge*`,
  `tests/html-assignment-frame*`, `tools/browser-verify/routes/html-assignment*.mjs` and
  the generated regions of its README,
  `docs/standards/IDEA_HTML_ASSIGNMENT_SPEC.md` (the security-boundary section only),
  `docs/prompt-ledger/entries/0153-*`, and its own `docs/history/` entry.
  Plus `src/lib/classroom/ItemDetail.svelte` FOR THE WIDTH RULE ONLY.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0198
- Status: pushed
- Branch: claude/intelligent-carson-1m1t7e
- Notes: Three fixes to the surface a ported document is shown on, in the order the width
  one forces (the document reflows, so the height is measured after it). ONE, a schema-3
  item escapes the reading measure and takes the page's full available width -- scoped on
  `htmlAssignmentMount`, every other item kind untouched at 736px, measured at five
  widths. TWO, the frame's 1px border moved to a wrapper: under the global
  `box-sizing: border-box` it made the applied height an OUTER height, leaving the content
  box 2px short of the height the document had just reported. THREE, a DELIBERATE WIDENING
  of the security boundary on Mr. Pina's decision of 2026-09-11 -- `HX_SANDBOX_FLAGS`
  gains `allow-popups allow-popups-to-escape-sandbox` so a document can open a link in a
  new tab, which without them it cannot do at all. One constant, both readers: the iframe
  attribute and the served CSP `sandbox` directive both confirmed moved in a browser.
  Ledger 0134's proof re-run IN FULL against the new set, by direct navigation and framed,
  with a planted cookie as the positive control: 0 of 5 reached in both halves,
  `window.origin` still `"null"`. What the popup can actually do is measured rather than
  reasoned about and written into the standard's new section 5.6, including what the
  widening costs. `allow-same-origin` is not added and never will be. Ledgers 0147 through
  0152 run in parallel; `ItemDetail.svelte` is shared with 0147 and 0149 and only the
  width rule and its branch are touched there.
