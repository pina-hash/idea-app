---
name: idea-design
description: Make anything visual for IDEA or FRC Team 5669 - a deck, doc, web page, HTML assignment's look, flyer, trifold, poster, icon, logo use, email design or app screen - in the current look of ideabosco.com.
---

# IDEA design

Source of truth: `docs/skills/idea-design/SKILL.md` in pina-hash/idea-app. The design system itself is the **IDEA Design System** artifact (https://claude.ai/artifact/Gb9XpTcK43gZMGSkqy22xs), built from the live site's Plate (`src/lib/classroom/plate.css`) and its themes. FRC Team 5669 work uses the **FRC 5669 Techmen Design System** (https://claude.ai/artifact/QVWGHpRjP7z7hfMfXZb4A7) and `docs/standards/FRC_CLAUDE_DESIGN_STANDARDS.md` instead.

## 1. Load the current look, every time

1. Read the design system's `project/README.md` and `project/tokens.json` (Artifact `read` with `path`). Use its tokens by name; never type a hex from memory or an older document.
2. If the site may have moved since the system's `lastChange`, look at the live page the work should match (ideabosco.com, or the classroom in a screenshot he provides) and compare. Where they differ, the live site wins and the design system gets updated in the same turn.
3. Pick the theme by where it will be seen: **idea** (dark graphite) on screens and in the app; **space-white** on a projector in a lit room and for anything printed or read on paper.

## 2. The look in one screen

- **Plate grammar.** Raised means pressable, inset means read-only. Keys are raised graphite with mono caps labels; status chips are recessed with a small lamp; panels are soft graphite plates; titles are spaced mono caps on a groove between hazard ends.
- **Rounded plus chamfered, gray gradients, a little glow.** Premium, never kiddy, never bare minimum. It should look like it belongs on the site, not like a template.
- **Green is rationed.** It marks the primary action, the active item, done, progress. Not the fill, not every heading. Other colors only when they make something clearer, each with a meaning.
- **Type is the site's.** Rajdhani for text (about 17px, weight 500 on screens), Share Tech Mono for labels and numbers, Orbitron only in the wordmark.
- **Never**: neon greens or cyans (#00FF41, #C8FF00, #00F0FF), the // motif, grid or blueprint backgrounds outside a real chart, scanlines, matrix rain, Chakra Petch, flat machined-green slabs, orange, yellow-brown or pink accents, stark white image rectangles, emoji as decoration.
- **Space.** Dead space is a defect (check at 960, 1440 and a phone). Say less: one line per idea, detail behind a disclosure.
- **Images** composited into the page: rounded, shadowed or on a plate; relevant; transparent icons with no square behind them.
- **Logo**: the full mark with the gear on print and covers; the light variants on space-white. Files are in the design system's Logos group. Never redraw it.

## 3. By output

- **Deck**: the Slides artifact type with the IDEA Design System (or the FRC one). 16:9. Every slide carries one idea. Run the humor pass (deck-humor skill) for student decks.
- **Document**: the Docs artifact type.
- **Visual design, flyer, poster, trifold, screens, icon options**: the Design artifact type.
- **HTML page or HTML assignment**: a hand-built page using the system's tokens and component CSS (`project/components/bundle.css`), plus the idea-course-material skill for assignments.
- **Print**: space-white, grayscale-safe, nothing under 9 pt.

## 4. Taste calls get candidates

When the choice is taste (direction, layout, icon, palette use), build two to five real candidates side by side, rendered, and let him pick on his phone. Then five variations of the winner. Never ask him to choose from descriptions.

## 5. Check before delivering

- Render it (Chromium screenshot, or the artifact preview) and look at it next to a screenshot of the live site. Name one way it matches and fix anything that reads as another brand.
- Contrast 4.5:1 for text in the theme used. Both themes if both ship.
- No retired element from the Never list above.
- He judges "boring" or "underwhelming" by the first screen. If the first screen could be any school's, it is not done.
