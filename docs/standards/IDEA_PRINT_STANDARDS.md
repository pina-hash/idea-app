# IDEA Print Standards
**Version 1.0 - 2026-08-10**
Rendering rules for all print-first materials: interim assignment printouts (specs rendered to paper until the engine is live), lab worksheets, and reference sheets. These are functional documents produced for handwriting, benches, and binders. Ink-friendly and legible beat flashy.

Print renderings are generated from spec files as print-styled HTML delivered as PDF, US Letter.

---

## Page Rules

- US Letter, portrait default. Landscape permitted for wide data tables only.
- Margins: 0.75 in minimum on all sides. Never squeeze margins or line spacing to force a page-count target. Two clean pages beat one compressed page.
- Light background (white), dark text. No dark themes, no glows, no scanlines, no canvas effects in print.
- Grayscale-safe: every meaning conveyed by color must also be conveyed by text or structure. Assume the copier is black and white, because it is.
- Page numbers as `Page X of Y` in the footer when the document exceeds one page.
- Duplex-safe: nothing critical bleeds across a sheet boundary mid-table or mid-response-area where practical.

## Typography

- Headers and module titles: Orbitron, weight 700, black.
- Body, prompts, table content: Rajdhani, 11-12 pt equivalent. Rajdhani prints cleanly and keeps the pathway's visual identity on paper.
- Metadata, IDs, version tags: Share Tech Mono, small.
- No font below 9 pt equivalent anywhere.

## Color in Print

One accent color per document, used sparingly: header rule, module number chips, section dividers. Accent derives from the spec's theme mapped to a print-safe value (IDEA Green theme → a dark green, not `#00FF41`, which is illegible on white). Semantic screen colors (amber warnings, teal in-progress) have no print role; print state is conveyed by checkboxes and blanks.

## Document Structure (in order)

1. **Header band:** assignment title, course ID, unit. Fields per spec `headerFields`: Name line, Date line, Due date (printed fixed, visually distinct), Section if specified. Total points displayed.
2. **Completion checklist:** derived from spec constraints. Checkbox list of everything required for "done." Zero ambiguity.
3. **Modules in spec order.** Each module: number chip, title, points, AI-level badge as a small labeled box (`AI LEVEL 1 - COACH`) when present.
4. **Approval gate position (if present):** instructor initials + date line, clearly boxed.
5. **Academic integrity declaration:** standard text, student signature line, date line.
6. **Rubric table:** full rubric printed at the end - criterion, points, descriptor, blank earned column. Print materials show the rubric; there is nothing to toggle.
7. **Footer:** assignment ID, course ID, school name, total points, build version in Share Tech Mono.

## Block Rendering Rules

- **textField:** prompt in bold, then ruled response lines. Line count: `minSentences × linesPerSentence` (default 2 lines per required sentence), minimum 3 lines. Sentence requirement printed inline with the prompt: `(3-5 sentences)`.
- **table:** printed grid with `printRows` blank rows (default `minRows + 2`). Column headers bold; a one-line units/purpose note under the table replaces hover tooltips. Row height minimum 0.3 in for handwriting.
- **imageZone:** per `printAs` - sketch box (minimum 3 in tall, caption line beneath), attach zone (dashed border, "Attach printed photo here" label), or notebook reference line (`Engineering Notebook page: ____`).
- **checklist:** checkbox squares, one item per line.
- **calc:** rendered per its declared `printAs` fallback. A calc block with no fallback is a spec error, not a rendering decision.

## What Print Renderings Never Include

- Toolbars, save indicators, export buttons, or any interactive chrome
- Placeholder text meant for typing
- Any implication of deadline flexibility
- QR codes or links as the sole path to required content (links may supplement, never gate)

## Verification Before Delivery

- Point totals: module sum = total, rubric sum = module points
- Every calc block has a print fallback
- Render check: view the output, confirm no orphaned headers, no response area split awkwardly across pages, margins intact
- Grayscale check: nothing depends on color alone
