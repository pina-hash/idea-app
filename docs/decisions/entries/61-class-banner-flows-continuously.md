# 61 The class banner's pattern flows continuously, with an off switch

- Raised: 2026-10-07  By: Mr. Pina, report 4c614121 ("the class banner animations are buggy and dont really work"), and again on 2026-10-14 in the building session: "still glitching and pausing. they should be smoothly continuous looping animations."
- Status: DECIDED 2026-10-14 (ledger 0381). REPLACES ledger 0360's rule (report R21) that the pattern drifted for 4.2 seconds on arrival and looped only under a hovering pointer.
- Decision: The pattern moves at a steady pace for as long as the page is open, with no pause, no turn-around and no seam, and every open copy of a class page shows the same frame at the same moment.
- Decision, the off switch: "Class banner motion" in Display settings (Moving or Still, per device), asked for in the session as "A Display setting". The device's own reduce-motion setting stops it whatever the setting says. This is the WCAG 2.2.2 way to stop motion that runs longer than five seconds.
- Context: CLAUDE.md "THE CLASS PATTERN FLOWS CONTINUOUSLY"; decision 45 (class-themes-voted-by-the-class) for the catalogue.
