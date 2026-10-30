# 73 Every launcher card is a miniature of its own app

- Raised: 2026-10-29  By: Mr. Pina, in the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List", after ledger 0467 grouped the launcher into six colour families.
- Status: DECIDED 2026-10-29 by Mr. Pina. REVERSES ledger 0467's launcher families. REAFFIRMS and widens decision 62 (every app its own colour) to every theme and to geometry, not colour alone.
- His words (2026-10-29): "The apps on the home screen are terrible right now ... It's very off-brand. I would like for the apps to reflect the content. If the app is green inside, it should be green. The app should be, the app banners should be designed geometrically to reflect the look of the content inside each app. I don't want it to be like some palette. It has to be representative, perfectly representative of what is inside that page visually. Please, I've asked for this at least 3 times in the past, and it's never happened properly. It has to be done right." And: "Each app should be unique visually, completely, like real apps on a computer."
- Earlier asks of the same thing: 2026-07-13 ("each of the cards to reflect the design of their content ... the IDEA Vanguard game card ... should follow the design of the IDEA vanguard game page"), 2026-08-26 (the Foundry banner should carry the Forge), decision 62 (2026-10-14, "Distinct colour per app").
- Decision:
  - Each launcher card is that app's own icon and banner, built from what the app's page actually looks like: its real colours (read from the room's own stylesheet and from a screenshot of the page, never from a shared palette), its signature shapes and texture, its type, its mark. A student who has used the app recognises the card without reading its title.
  - No two cards share a look. There is no family grouping, no shared palette and no hue budget on the launcher. The "at most 5 to 7 hues on one screen" rule (ledger 0467) does not apply to the launcher grid; it still applies to the calendar, unit tints and class colours.
  - A card follows its room, not the site theme: where the room keeps its look on Space White, the card keeps it too. Where the room itself is neon (the Coin Ledger, VANGUARD), the card may be neon.
  - Readability still binds: the title and call to action clear 4.5:1 on the card, controls stay 44px, the FRC mark is never animated or altered, and motion is gated behind prefers-reduced-motion.
- Context: `src/lib/AppLauncher.svelte`, `src/lib/portal-apps.ts`, `docs/subsystems/themes.md` (the launcher section), ledger 0472.

## Amended 2026-10-30 by Mr. Pina, after seeing ledger 0472 on his phone

His words: "The idea, green line, and foundry title cards are fine, but all the other ones are way too busy. When I pulled this up on my phone for the first time this morning, it was extremely confusing ... There's too much stuff on each banner. There's like all these little words. It's ridiculous. I said to do it like it would be on a computer, like you have like an icon for the app and a title. And since it's a banner format, you'd have icon, title, you know, I think green line and idea green line and idea foundry are well made. All the other ones, they're way too busy."

- A card is an app icon and its title on a banner, like an app on a computer. The banner carries the app's own colours and ONE bold motif from its page (a texture, a light, a shape), never a miniature screen.
- No words on a card except the title, plus the description and key in the comfortable view. No placeholder text, no tiny labels, no mini interface.
- The reference cards are IDEA · GREENLINE (night field, floodlight cones, the green streak) and IDEA · FOUNDRY (iron black, the molten seam, a quiet tile mosaic) as shipped in ledger 0472. Every other card matches their density.
- Everything else in this decision stands: colours from the app's own room, unique per app, readable, the FRC mark untouched.

## Amended 2026-10-30 (second time): the cinematic light direction, chosen from four samples

Mr. Pina rejected ledger 0474's icon-plus-motif cards ("looks like Play-Doh", "kiddie"; "it's dark and deep and cool and high tech ... the future of education") and asked for samples to choose from. Four directions were built from research (`/home/claude/reports/Premium app banner tile design.md` in that session): A cinematic light, B dark glass, C machined, D deep field. His choice, his words: "Gotta go with a cinematic light. But now green line and foundry look weird because they weren't adjusted in the same way. So adjust green line and foundry in the same way and go for that. Live on the website as soon as it's ready."

- Every card, GREENLINE and FOUNDRY included, is a dark film still lit by one light source in the app's hue, with haze and one object: the filled app icon and the title at the left over an eased scrim, the focal light about two-thirds across, a vignette and faint grain, no words in the art.
- The hue per app is the one in the chosen sample. Where it departs from the room (Market violet, Armory steel blue, the Coin Ledger and VANGUARD greens toned off neon), the sample he chose governs.
- This replaces the "reference cards" bullet of the first amendment: GREENLINE and FOUNDRY are no longer kept as they were; they are redrawn in the same grammar as the rest.
