# 40 Space White: green hover, no brown gold, a light emblem, redrawn marks, and its own shape language

- Raised: 2026-09-25  By: feedback reports R16, R17, R19, R26 of the 2026-09-25 archive.
- Status: DECIDED 2026-09-25 by Mr. Pina (all four options chosen).
- Build: BUILT. Items 1 to 3 (color, emblem, marks) are in round 1 (ledger 0298). Item 4, the shape
  language, is BUILT by ledgers 0341 and 0344 (the approved mockups on `/dev/themes-shape`) and
  0345 (live on every IDEA Classroom page, in all three themes, 2026-09-28:
  `src/lib/classroom/plate.css`, switched on by `CLASSROOM_PLATE` in `src/lib/classroom/plate.ts`).
- Amended 2026-09-27 by Mr. Pina: "They should share the same sci-fi geometry with different
  color schemes." The shape language is one geometry for IDEA, Matrix and Space White, with only
  colour and material changing between them. That SUPERSEDES item 4's closing clause below
  ("the dark themes are unaffected unless he later asks"): he asked. Scope is IDEA Classroom
  only; every other app keeps its look.
- Amended 2026-09-28 (report R13, Mr. Pina: "the colors are off and it looks weird"): item 2's pastel-plate, dark-lettered lockup is retired, because dark lettering turns IDEA's letters inside out and the pastel plate stands 1.35:1 off the header; Space White now ships the `SLATE` variant from `tools/idea_logo_vector.py` (flat, a slate gear with a lit green rim behind a deep green plate, white lettering at 7.59:1), chosen from six candidates on `docs/feedback/2026-09-28/round1/logo-candidates-*.png`.

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
