# Site UI audit, 2026-10-26

Kept so the build can start from it later. Mr. Pina filed it as site feedback (an idea, long term, 2026-10-27) to be built in the chat that ran it. Nothing here has been built.

How it was measured: 34 `/dev` routes mounting the real components, at 1440 and 375, in IDEA dark and Space White (138 screenshots), plus a DOM probe on 12 pages (text under 11px, contrast against the composited ground, tap targets, fonts and radii per page). Color math: `tools/hx-kit/color.mjs`; APCA 0.0.98G-4g, advisory. Harnesses hold no session, so the theme was forced on `<html>`; signed-in production pages were not checked. Names in the screenshots are dev fixtures. The full screenshot set was not kept; the twelve here are the worst offenders, downscaled. `measure.json` is the DOM probe. `color-research-report.md` is the research it rests on.

## Ranked fixes

1. **Space White status colors collapse.** Every semantic ink sits at OKLCH L 0.43 to 0.52; under simulated deuteranopia gold vs amber is ΔE00 3.5 and gold vs crimson 3.6. Space White gold #715d22 and amber #77491b are inside the muddy box. Fix: on light, gold and amber stop being text; each status chip gets its own fill spread in lightness, a dark ink and a glyph. (`src/lib/design-system/themes/space-white.css`)
2. **One status vocabulary.** `workStateTone` paints In progress amber (the warning hue, shared with Late and To mark) while the tokens say teal means in progress; `.tone-*` is redefined in ClassView, GradesPanel, StudentOverview and TodoPage; about 150 ad hoc `*-chip` classes. StudentOverview shows a 67.5% grade in crimson, which is reserved for live, recording and error. Fix: one StatusChip with a tone map. Teal and green are ΔE00 9.4 (dark) and 7.5 (light) in normal vision, so teal should not carry its own meaning.
3. **Dark-theme small labels are faint.** Status inks Lc 38 to 44, text-2 Lc 51 at 10 to 11px. Fix: the notebook's own `--nb-cell-*` inks (#86bf7e, #db9d60, #e69494) and text-2 about #b4bdb7.
4. **Text under 11px and small taps.** Home 38 nodes under 11px, admin 155 at 10.6px or less, coin labels 10.6px; coin sub-nav links 57 to 76 by 15px, breadcrumbs 18px, student-page checkboxes 18 by 18. The classroom is clean because the Plate's 11px floor applies there.
5. **Five page-title treatments** (classroom hatched bar, certifications and notebook left bar, cert desk short bar, coin plain H1, Foundry and Maps none). Fix: one PageHeader.
6. **Width.** Class page at 1440: list 735px wide, three right edges (895, 1007, 1168). Item page and notebook prose about 1350px wide, a student-page paragraph 1326px (about 150 characters a line). Fix: 72ch for prose, lists at the header width.
7. Primary actions unmarked ("Open" on class cards changes hue by theme; Turn in looks like Save draft).
8. Calendar's seven layers too close (Bosco Tech vs No school ΔE00 4.4 on Space White); filters take 190px on a phone.
9. Space White measured failures: coin market ratings 3.38:1, coin home well labels 4.33:1.
10. The Send feedback pill covers content at 375 (a decision for Mr. Pina: it conflicts with every control carrying a word).
11. The public landing opens with a full-page dimming tour.

## Strong, keep

The Plate grammar across apps, Space White geometry identical to dark, the boundary and hairline split, chips that always carry a word, the classroom stream's unit-tinted masonry, the student conference page, the pinned-fill rule.
