# Site-wide color and geometry pass: ledgers 0465 to 0469

Issued 2026-10-28 13:22 PT by Mr. Pina in the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List". It is in none of today's lanes 0455 to 0458. Scope: every page of ideabosco.com, every app, IDEA (dark), Space White and Matrix themes, at 375, 1152 and 1440 px.

Feedback items (all filed 2026-10-28, horizon now), plus the long-term umbrella 22604e47 (site-wide UI elevation from the 2026-10-26 audit):
- abb2c080 color tokens per theme, held by a unit test
- de294f40 one StatusChip, one tone map (includes 2c3cacb2: drafts get their own tone and icon, not a warning sign)
- 8a928045 11px text floor, label contrast, 44px controls
- 38516c68 one PageHeader, one app sub-nav, the plate parts everywhere
- dd897391 72ch prose, one right edge, @container layouts, the 1152 width
- ac7d7b60 identity and calendar colors from one library, no neon
- c27b2be7 one green primary key per card, first-impression fixes (landing tour, Live panel space, notebook capture box, unit headers in the stream, the Send feedback pill at 375)

The evidence is already on main. Read it; do not re-audit:
- docs/design/site-ui-audit-2026-10-26/ (README, measure.json, color-research-report.md, 12 screenshots)
- tools/hx-kit/color.mjs: solve(anchor, theme) gives ink, fill, on, line and wash per theme, refuses muddy colors and checks contrast on the shipped hex. Use it as is; never write a second solver.
- tools/hx-kit/kit/colors.json: the named identity library (safety, materials, CAD, wiring, FIRST, brands, linking set)
- tools/hx-kit/kit/kit.css: HTML assignments already draw the classroom's plate parts this way. The site and the kit share ONE source of the plate recipes (src/lib/classroom/plate.css, src/lib/shell/site-plate.css, tools/hx-kit/kit/plate.css), never a third copy.
- tools/hx-kit/test.mjs: the squeeze check (line boxes, text under 9em at three or more lines). Port it into npm run verify:browser.

Rules for every lane:
- No two lanes edit the same file. Each lane's Owns is in its ledger entry; anything outside it is left alone and named in the report.
- Lane 0465 (tokens) lands first; the others build on its tokens.
- Each lane measures before and after at 375, 1152 and 1440 in IDEA and Space White (and Matrix where the page has it) and reports the numbers.
- Each adds a classroom-updates.json entry where students will see a change, and marks its feedback ids resolved when it lands (the chat that started it does the marking through the connector).
- The frozen IDEA Coin Ledger page (docs/subsystems/legacy-content.md, the freeze) is Mr. Pina's call: ask through the chat before touching it.
- Questions about the HTML assignment kit go to the HTML standards chat, https://claude.ai/code/session_01AhbdScnRCcFy5idt3AfdXy. tools/hx-kit/ is that chat's; only lane 0468 may edit tools/hx-kit/kit/plate.css, for the shared plate source, and it reruns `node tools/hx-kit/test.mjs tools/hx-kit/starter.html` to 0 FAIL after.
- These lanes start only after the feature lanes that own the same UI files have landed (0455 tournaments and copy, 0456 team units, 0457 grading, 0458 HTML program, 0463 Armory). Lane 0465 touches only token files and may start first.

## Lane 0465: tokens (abb2c080)
Re-derive src/lib/design-system/colors.css, themes/space-white.css and themes/matrix.css through solve(). Space White's warm colors become bright fills with dark text, never brown text. Teal stops being its own meaning. A test in npm test (so CI runs it) holds every token pair to WCAG 4.5:1 text and 3:1 non-text in IDEA, Space White and Matrix, no muddy fill, and dE00 of at least 8 between status tones under simulated deuteranopia and protanopia. Token names stay; values move. No component edits.

## Lane 0466: StatusChip (de294f40, 2c3cacb2)
One component and one tone map (ink, fill, on, glyph, words; words always). Retire every .tone-* copy (ClassView, GradesPanel, StudentOverview, TodoPage and the rest) and the roughly 150 *-chip status classes. No grade ever shows in crimson (reserved for live, recording and error). In progress is not the warning hue. Drafts get their own tone and icon.

## Lane 0467: identity colors (ac7d7b60)
Launcher apps, calendar layers, unit tints and class colors (and Foundry and Armory marks) all come from colors.json through solve(), per theme. At most 5 to 7 hues a reader must tell apart on one screen, each with a word or glyph beside it. Green only for act and done. No neon (#00ff41, #c8ff00 today). Calendar filters: selected state not drawn in green; collapse behind one control on a phone.

## Lane 0468: geometry (38516c68, c27b2be7)
One PageHeader (cyan eyebrow, the plate title bar, meta line) and one app sub-nav made of the plate's pads with LEDs, on every app: coin home, market, stocks, coin desk, Foundry, Maps, Armory, certifications, admin, calendar, notebook. Every card on the plate panel recipe, every list in the list well with etched rows, every field the well, every readout the display, every pick a key; no stripes, washes or boxes in boxes. One shared plate source with the kit. One green raised primary key per card or page, the rest plain keys. The c27b2be7 first-impression fixes: the public landing uses the classroom's inline "Show me around" banner instead of the dimming tour, the Live class right panel loses its empty space, the notebook capture box loads without a half-cut placeholder or a grayed toolbar, the stream shows unit headers where a unit continues into the next column, and the Send feedback pill collapses to an icon key after scroll at 375 (his call against "every control carries a word").

## Lane 0469: type, taps and width (8a928045, dd897391)
The 11px floor (--plate-label-size on every .site-plate page), the --fs-* scale (lib/classroom's 50 font-size literals onto it), 44px controls (24px absolute floor for inline links), dark-theme status inks and text-2 lifted to the notebook's --nb-cell-* inks, 72ch prose, one right edge per page, lists and cards sized to the header, @container layouts so 125% zoom never squeezes a card into a one-word column. npm run verify:browser adds 1152 to its widths and fails text under 11px, controls under the floor, and squeezed text (the tools/hx-kit/test.mjs check, ported).
