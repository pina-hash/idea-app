# Queue 0472: every launcher card is a miniature of its own app

Issued 2026-10-29 by Mr. Pina. Decision 73 (`docs/decisions/entries/73-launcher-cards-are-their-apps.md`) holds his words in full; read it first. He has asked for this at least four times since July and it has never landed. Treat fidelity to each app as the only measure of done.

## The ask

Each of the 14 launcher apps (classroom, notebook, ideacad, armory, maps, coins, market, gauntlet, frc, greenline, vanguard, foundry, tournaments, dashboard, plus any other `PORTAL_APPS` entry) gets a card that is unmistakably that app, the way real app icons on a computer are: its own colours, its own geometry, its own texture and mark, taken from what its page actually looks like. No families, no shared palette.

## Method (this is what failed before: cards were styled from a palette, not from the apps)

1. For every app, open its real page (a /dev harness where one exists, otherwise the route itself with the fixtures the browser-verify routes use) at 1440 and 375, in each theme the page has. Screenshot it. Read its room stylesheet (`src/lib/foundry/forge.css`, the GREENLINE, GAUNTLET, VANGUARD, tournaments, coin, Armory, Maps, IdeaCAD, classroom and notebook styles, the frozen Coin Ledger page under `static/`) and write down, per app: the 2 to 4 colours that dominate the page by area, the accent, the type faces, and the 1 to 3 shapes or textures a person remembers it by. Put that inventory in the history entry.
2. Design each card from its inventory, as a small banner and mark that quotes the page. Use the room's own tokens where it has them; read colours off the screenshot where it does not; never invent a colour the room does not use.
3. Keep the launcher readable and accessible: title and call to action at 4.5:1 or better on the card, 44px controls, words always on the card, motion only under prefers-reduced-motion: no-preference, the FRC mark never animated or altered.
4. Space White: a card shows what its room shows on Space White. If the room does not change, the card does not change.

## Proof before landing

- Build a comparison sheet: for each app, its card beside a screenshot of its page, at 1440 and 375, in each theme. Save the images and one HTML page laying them out in the scratchpad folder, and give the path in your report.
- Measure: title and call-to-action contrast per card per theme, control sizes, and the smallest CIEDE2000 distance between any two cards' dominant colours (no two cards should read as the same).
- STOP after committing locally. Do NOT push. Report the sheet path and the numbers. The chat that started this lane runs an independent review of the sheet and then tells you to land or what to fix.
