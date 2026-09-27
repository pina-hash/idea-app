# IDEA Print Standards
**Version 1.1 - 2026-09-04**
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

## Delivered Filenames for Print Jobs

Print PDFs are carried on a flash drive to the school print room and run on a shared machine. The person standing at that machine has no other document open, so the filename is the entire print instruction. It leads with what has to be typed into the printer.

**Format, in this order:**

```
[QQ]x_[N]pg_[SIDED]_[What-It-Is].pdf
```

- `[QQ]x` - the number of copies, two digits, zero-padded so a directory sorts predictably. `60x`, `03x`, `01x`.
- `[N]pg` - the page count of the document, verified by opening the rendered PDF and counting, never by intending a page count.
- `[SIDED]` - `SINGLE` or `DUPLEX`. A one-page document is always `SINGLE`. A document of two or more pages is `DUPLEX` unless something about the artifact forbids it.
- `[What-It-Is]` - hyphenated, no spaces, short enough to read at a glance.

**Suffixes, appended to the descriptive part when they apply:**

- `-HOLD` - printed in the same job but not distributed with the rest. Retake forms, answer keys, anything a student must not see on the day. The suffix exists so a stack does not get handed out whole by accident.
- `-[INITIALS]` - a copy belonging to one instructor rather than the class, where two sections receive different documents. `-PINA`, `-COSSO`.

**Worked example, one day of one unit:**

```
60x_1pg_SINGLE_Answer-Sheet.pdf
25x_2pg_DUPLEX_Questions-FormA.pdf
20x_2pg_DUPLEX_Questions-FormB-HOLD.pdf
03x_1pg_SINGLE_Grading-Strips.pdf
02x_2pg_DUPLEX_Answer-Key.pdf
02x_2pg_DUPLEX_Topic-Sheet.pdf
01x_1pg_SINGLE_Run-Sheet-PINA.pdf
01x_1pg_SINGLE_Reference-COSSO.pdf
```

**Quantities are derived, never estimated.** Every count is computed from live enrollment and stated with its reasoning in the delivery, not chosen because it sounds like enough. Three classes of document, three different rules:

- **Consumable, one per student per attempt.** Total enrollment across every section, plus a margin for retakes and marking errors. A perfect-score gate produces retakes, so the margin on a gate instrument is larger than on a normal handout.
- **Reusable, collected and kept.** The largest single section, plus a small margin. It is reused across sections on the same day and does not scale with total enrollment.
- **Instructor copies.** One per instructor who teaches the material, plus a spare on anything that is cut, laminated, or handled repeatedly.

**Total sheets of paper is stated in the delivery**, computed as quantity times pages, halved and rounded up for anything `DUPLEX`. The print room charges and plans by sheet, not by document.

**This convention overrides the course-and-day filename rule in `IDEA_instructions.md` for print PDFs only.** Everything else keeps the `IDEA209H_Day08_...` form. Print PDFs sort by what has to be typed into the printer, because the folder is read once, standing up, under time pressure.

---

## Verification Before Delivery

- Point totals: module sum = total, rubric sum = module points
- Every calc block has a print fallback
- Render check: view the output, confirm no orphaned headers, no response area split awkwardly across pages, margins intact
- Grayscale check: nothing depends on color alone
- Filename check: quantity, page count, and sided spec in the filename all match the rendered file. The page count is read from the PDF, not assumed
- Quantity check: every count traces to enrollment or to instructor headcount, and the total sheet count is stated

---

## Changelog

- **1.1 (2026-09-04)** - Added Delivered Filenames for Print Jobs: the `[QQ]x_[N]pg_[SIDED]_[Name].pdf` convention, the `-HOLD` and `-INITIALS` suffixes, the three quantity-derivation rules, and the requirement to state total sheets. Written after a Unit 2 Day 1 print job where the filename had to carry the whole instruction to a shared print room. Added filename and quantity checks to Verification Before Delivery.
- **1.0 (2026-08-10)** - Created.
