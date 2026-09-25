# 40 Space White: green hover, no brown gold, a light emblem, redrawn marks, and its own shape language

- Raised: 2026-09-25  By: feedback reports R16, R17, R19, R26 of the 2026-09-25 archive.
- Status: DECIDED 2026-09-25 by Mr. Pina (all four options chosen).
- Build: OPEN. The color, emblem and mark items are in round 1 (ledger 0298). The shape
  language is a separate design session (`docs/feedback/2026-09-25/QUEUE.md`), because it
  wants before/after mockups he approves, not a sweep.

## What was decided

1. **Green hovers, no brown gold, on Space White.** A role token (e.g. `--hover-ink`) that
   is `--gold` on the dark themes (unchanged) and `--green` on Space White, swept across
   the hover rules. Gold stops being the default launcher ink and hover ink on Space White,
   because "lightness only" applied to a yellow hue on white always lands on brown or olive
   (measured in triage). Gold stays for true special-callout chips. The dark IDEA theme is
   unchanged.
2. **A light-theme emblem.** Generated from `tools/idea_logo_vector.py` (the only place logo
   geometry is edited) with the green identity kept and the ivory lettering re-inked dark,
   served as a `srcset` like the current copies. This replaces the dark display window on
   Space White. It amends the 0297 choice to keep the window.
3. **Redrawn marks.** Start with the weakest launcher marks (IdeaCAD, GREENLINE, Admin),
   measured at 34px on both themes, following the once-only `IdeaCadMark` animation
   standard. Avatar preset ids stay append-only.
4. **Space White gets its own shape language**: more futuristic, highly functional control
   geometry (chamfers, not just rectangles), with a glass-like material explored. It is
   gated on a `/dev/themes` before/after he approves. Readability comes first: every
   contrast floor and the projector model still hold. It reads shape tokens, so the dark
   themes are unaffected unless he later asks.

## Default taken on a side question

The profile menu's name is no longer tinted by pathway (it read neon green on white); it
takes `--text-1`, and the pathway chip beside it carries the color.
