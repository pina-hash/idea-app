# IDEA Claude Design Standards
**Version 2.0 - 2026-08-25**

The single hand-maintained design standard for the IDEA pathway. It owns two
things that used to sit in separate documents: the pathway's visual identity
(color, typography, effects, voice) and the scoping and prompting of every
artifact authored in Claude Design against it. Presentations are the primary
case. One-pagers, posters, and interface mocks follow the same scoping protocol
with the artifact-specific rules in the last section.

This document is the Claude Design counterpart to the Claude Code prompting rules in `IDEA_instructions.md`. Chat scopes and specifies. Design lays out. The handoff between them is a prompt, and this standard governs what that prompt must contain.

---

## Why This Exists

The IDEA209H Unit 1.1 deck was built from a 582-line content spec that was well written and produced an output using one design system component across 29 slides, zero of the four slide transitions, zero of the eleven element entrances, zero image reveals, and zero stagger delays. In their place it hand-rolled thirteen custom motion classes used roughly 140 times, reimplementing what `tokens/deck-motion.css` already ships.

Colors and typography were clean. Every token used was legitimate. The design system was consumed as a palette and nothing else.

The cause was traceable to the spec, not the tool. The spec defined a competing motion vocabulary and instructed that it be built as named classes. It never named a component, never named the starting template, and asked for an aspect ratio the system silently overrode. Claude Design followed it exactly.

**The single highest-leverage rule in this document: a prompt that does not name components per slide will get hand-rolled slides.** Everything below exists to make that impossible to skip.

---

## Session Prerequisites

`IDEA_DS_DIGEST.md` must be in context before scoping begins. It carries the brand guide, the complete token layer, and every component's usage note and prop signature. Scoping without it means naming components from memory, which is how a slide inventory ends up specifying a component that does not exist or missing one that does.

The digest is a generated extract of the Claude Design bundle, not a hand-maintained document. It lives in project knowledge and is regenerated whenever Claude Design adds or changes a component. See Live Evolution.

**Staleness check.** The digest header states a component count. Chat states that count at the start of a scoping session. If Claude Design has gained components since the digest was generated, the count is wrong and the digest is regenerated before scoping continues.

**The count is the manifest's exported registry, not a count of source files.** One file exports several components (`SpecTable` and `SpecRow`, `StepCard` and `Step`, `BarChart` and `Bar`), so a file count and the number Claude Design reports are different numbers, and only one of them moves when a batch adds child components to existing files. The 2026-08-21 copy-slot batch added seven components and zero files. `build_ds_digest.py` reads the registry for exactly this reason; a digest whose header disagrees with Claude Design is a generator that is counting the wrong thing, not a stale bundle.

---

## Document Map

This document is the only hand-maintained IDEA design standard. It absorbed
`IDEA_Design_System.md`, which is retired as a name and must not be referenced
again. Three documents were carrying overlapping visual-identity rules and one of
them could not be read at all. That is resolved here.

| File | Status | Owns |
|---|---|---|
| `IDEA_CLAUDE_DESIGN_STANDARDS.md` (this file) | Active, hand-maintained | Visual identity, and the scoping and prompting of every authored artifact |
| `IDEA_DS_DIGEST.md` | Active, generated, **not a standard** | Component and token reference. Descriptive. Never cite it as authority for a rule |
| `IDEA_Design_System.md` | **Retired 2026-08-25** | Nothing. The name resolves to this file |
| `IDEA_INTERFACE_STANDARDS.md` | Active, separate on purpose | Shipped app surfaces in `idea-app`: layout, role parity, viewport. Different audience, different failure mode |

**The digest is evidence, not authority.** It is regenerated wholesale from a
Claude Design bundle export, so anything written into it is overwritten on the
next pass. It answers what exists. This file answers what is allowed. When the
two disagree about a rule, this file governs; when they disagree about whether a
component or token exists, the digest governs and this file is corrected.

**Why this is two files and not one.** The digest is machine-written by
`build_ds_digest.py` and no human edits it. Folding it into a hand-maintained
standard would mean either the generator overwrites the rules or the merged copy
drifts from the bundle, which is the two-sources-of-truth failure this document
warns about elsewhere. Two files is the floor, and only one of them is a standard.

---

## Visual Identity

Absorbed from `IDEA_Design_System.md` 2.0 at retirement. Normative. Everything
below is a rule, not a description of what a bundle happens to contain.

### Where tokens actually live

The token source of truth is `src/lib/design-system/colors.css` and
`effects.css` in `pina-hash/idea-app`. **Never `src/app.css`.** Any document,
digest, or bundle description that names `src/app.css` as the source is stating a
retired fact and is corrected rather than followed. A value read from a stale
export is not a token.

### Color

- **Ground.** Three deep desaturated-green surfaces, machined metal rather than
  black: `--bg0 #131A13` page, `--bg1 #1B241B` cards, `--bg2 #242F23` inputs and
  header bars, plus `--plate #2E3D2E` for raised hero panels.
- **Primary.** Mint rim-light `#8FE08A` for key type, active states, success, glow.
- **Accent set, tight and muted.** Brass `#D3C68E` special callouts, patina
  `#93D6C8` metadata and dimension lines, copper `#D99A55` warning, teal
  in-progress, violet rare.
- **Text.** Body is bone `#EAE6D8`, never pure white. Secondary is gear sage
  `--dim #87947C`. `--gear #75846F` is structural metal, `--edge #0D120C` linework.
- **No color is invented.** A hex that is not already a token value is a defect,
  including one that looks correct.

### The accent cascade

Components do not hardcode green. Every accent-bearing `color` or `tone` prop
defaults to `'acc'`, resolving `var(--acc)`. A deck sets its hue **once** on the
root, either `--acc: var(--steel)` or a `.ds-acc-*` class, and a section may
override locally. `--acc-line` and `--acc-glow` re-derive automatically.

Course accents: IDEA100 green, IDEA209H steel `#6F8FAE`, IDEA210H amber, IDEA305
violet, IDEA306 rust `#C07A5E`, IDEA404 gold. `--slate #8A93A0` serves
near-monochrome work. Cyan and teal remain per-component options but are retired
from course-accent duty, because they are not distinguishable from green at
projection distance. FRC and FLL artifacts carry their own brands and are never
recolored into the course sequence.

### Green is reserved

Green is the pathway's color and is scarce on purpose. `AnimatedLogo`,
`GearMark`, `Wordmark`, `DeckFooter` chrome, the `JumpGrid` hub, and both deck
bookends stay green under any accent. Every deck opens green, closes green, and
carries green chrome. The course accent lives in the content layer between the
bookends. `identity={false}` is the only way out and is a declared exception.

### Grounds and the alias rule

Three grounds ship: the green ramp, a true-neutral dark ramp
(`.ds-surface-neutral`, value steps matching green exactly), and
`.ds-surface-paper`, a light drawing sheet that pins `--acc` to sheet ink and
flattens `--acc-glow` because halos read as mud on paper.

**Alias rule, load-bearing.** Custom-property substitution resolves where a
property is declared, so every surface scope must redeclare the **complete**
semantic-alias set as literal values for its ground. A `var()` reference or a
missing alias falls back to the dark value **silently**. This has failed twice:
once at token level, and once as a hardcoded `#161e15` inside `ImageFrame`'s
backplate, which no ground could retint. A literal color inside a component is
the same bug wearing a different hat.

### Typography

Three families, all genuine Google Fonts. **The token names invert what a reader
assumes, and this is intentional.**

- `--font-hero` is **Chakra Petch** and is the DISPLAY face: hero type, wordmarks,
  `PlateTitle`, `DefinitionPlate` terms, `FormulaPlate` expressions, big numerals.
  Never used for paragraphs.
- `--font-display` is **Rajdhani** and is the BODY face, carrying both headings
  and running text. It is condensed enough to do both jobs, which is why there is
  no separate body token.
- Mono is **Share Tech Mono** for all chrome, labels, metadata, codes, inline code.

When a spec says "display face" it means `--font-hero`. A spec that says
`--font-display` expecting Chakra Petch is a defect.

### Effects

- **Bevel and rim-light are the signature moves.** Cards carry
  `var(--bevel-raised)`, wells and inputs `var(--bevel-inset)`. Buttons physically
  depress on press: bevel flips raised to inset, 1px down.
- **Glow is rationed.** `var(--glow-green|gold|cyan)` on hero type and hero
  numerals, active and selected states, links on hover. Never body copy, never
  every heading. Soft halo, 6px core and 18px bloom, never neon-hot.
- **Hairlines separate, bevels give depth.** Sage `--line` at rest, mint
  `--line-strong` for active and emphasis. 1px normally, 2px on framed drawings.
  A soft grey drop shadow is never used alone.
- **Radii are small and chamfer-minded.** 2px chips, badges, pills. 3px buttons
  and inputs. 4px cards and panels. Hero panels may take an octagonal `clip-path`
  chamfer of 10 to 16px. Nothing is pill-round except the circular
  challenge-state token.
- **A hairline token never paints a glyph.** Found twice in two rooms in two days
  at 1.18 and 1.48 weight. A glyph takes `--boundary` or a text token. A token
  whose job is rule weight is not a color.
- **Deck chrome never shows neutral white.** Canvas, letterbox, and thumbnail
  frames follow `--bg0` and `--edge` so transitions never flash.

### Reserved colors

Pathway identity colors (IDEA, ACE, BMET, CSEE, MSET, MAT) are identity only and
are never used for status. Status crimson `#D95F5F` is LIVE, REC, and error only,
and is never used for identity. These two rules are absolute and are check items
in the pre-delivery audit.

### Content voice

Terminal-operator meets coach: confident, terse, technical, addressing the student
directly. Two casing registers, and they do not mix: mono labels, eyebrows,
badges, buttons, and metadata are UPPERCASE with wide tracking; display headings
and body are sentence case. The `//` motif is house punctuation for section
headings and product lockups, never inside prose. Products are written
`IDEA // NAME`. Numerals are hero material. CTAs are imperative, one or two words.
**No emoji anywhere**; iconography is Lucide line-art on `currentColor`, plus
geometric unicode glyphs. Status is spoken in words on colored pills.

### Open item, owed from the repo

The Console Register token table, the green budget, the effects scope, the
typography weights, and the engineered-not-hacked test are normative and are
**not reproduced here**, because their current values exist only in
`src/lib/design-system/` and this document has never been able to read them. They
are read out by Claude Code from `colors.css` and `effects.css` at HEAD and
written into this section, not transcribed from any document's description of
them. Locked decision 15 of `IDEA_CLASSROOM_REBUILD_PLAN.md` changed them again
by retiring the standalone dark plate and moving the default onto the console
register, and that change is owed here. **Until that readout lands, this section
is complete for authored artifacts and incomplete for classroom surfaces.**

---

## Scope and Routing

Claude Design is the tool when layout is the product and logic is thin. Decks, one-pagers, posters, interface mocks. Never stateful tools, never anything that persists data, never anything that belongs in a repo.

| Artifact | Tool | Why |
|---|---|---|
| Lecture deck, review deck | Claude Design | Layout is the product |
| One-pager, poster, handout for screen | Claude Design | Same |
| Interface mock, concept screen | Claude Design | Throwaway, not production |
| Print handout for a bench or binder | Print pipeline per `IDEA_PRINT_STANDARDS.md` | Ink and paper rules differ entirely |
| Assignment, worksheet, reference doc | Assignment spec for engine import | Not a layout problem |
| Anything in `idea-app`, `frc-app`, or the portal | Claude Code | Lives in a repo |

---

## The Scoping Protocol

No prompt is written until every step below is answered. Steps are ordered because later steps depend on earlier ones. Where a reasonable default exists, chat proposes it with a one-line rationale rather than asking. Genuine forks are asked as tappable multiple-choice, one question per fork, three questions maximum per turn.

Answered decisions are restated in compact form before authoring begins so the record is unambiguous.

### Step 1. Purpose and room

- What the artifact does, in one sentence.
- Where it runs: projected, handed off as PDF, viewed on a laptop.
- Who operates it. If anyone other than Alejandro may run it, the Cosso constraint applies: nothing may depend on undocumented knowledge of how the artifact behaves.
- Whether it must survive being printed or exported. This decides whether hidden-by-default content is legal at all. It usually is not.

### Step 2. Content spine

- Parts or sections, named, with slide ranges.
- Whether the artifact can be entered mid-stream. If yes, a hub and persistent orientation chrome are required.
- Whether pacing is predictable. If not, every part boundary must be a legal stopping point.
- Speaker notes: which slides carry them. Notes go in `data-speaker-notes` on the section.
- Which blocks of copy are expected to change after the build. Everything on that list gets a canvas-editable home. See Copy Placement and Editability.

### Step 3. Slide inventory

**This is the step that prevents the Unit 1.1 outcome.** Every slide gets a row before anything is built. A slide with no component named in column three is a slide that will be hand-rolled.

| # | Purpose | DS component(s) | Transition | Entrances | Image slots | Build states | Interrogable |
|---|---|---|---|---|---|---|---|

The Interrogable column marks slides carrying click targets. It matters operationally: your clicker cannot drive them, so those are the slides you walk to the screen for. Knowing which ones before you are standing in front of the room is the point of tracking it.

Chat proposes the full table. Alejandro edits it. The approved table goes into the prompt verbatim as the per-slide spec.

Before proposing, chat reads the relevant Component Reference entries in `IDEA_DS_DIGEST.md` rather than working from memory of component names. Naming a component that does not exist, or hand-specifying one that does, both trace back to skipping this.

### Step 4. Motion plan

- One slide transition per non-build slide, chosen from the four that exist. No slide goes untransitioned except build states.
- Entrance budget per slide, default maximum six elements carrying `ds-in-*`.
- Ambient texture: maximum one per slide, and not on every slide. The reference template reserves grid plus bloom for the title and closing bookends only.
- Stagger via `ds-d1` through `ds-d8` only.

### Step 5. Reveal and interaction plan

Two separate decisions, both made here rather than left to the builder.

- **Pacing.** Which slides need stepped delivery, and how many build states each gets.
- **Interrogation.** Which slides carry click targets, what each one emphasizes, and what the base state shows.

See Reveals and Interaction below for mechanisms and budgets.

### Step 6. Image plan

Every slot listed with id, subject, source, treatment class, frame variant, and placeholder text.

Slides carrying **no** visual aid are listed here too, each with a one-line reason. The density floor is a scoping decision, and a text-only slide that nobody decided on is how a deck ends up 40 percent bare without anyone noticing. See Image Slots below.

### Step 7. Aesthetic direction

**Accent is determined, not chosen.** Two axes that control different properties, so they cannot collide.

- **Course sets the hue.** IDEA100 green, IDEA209H steel, IDEA210H amber, IDEA305 violet, IDEA306 rust, IDEA404 gold. Set once with a single class on the deck root: `.ds-acc-green`, `.ds-acc-steel`, `.ds-acc-amber`, `.ds-acc-violet`, `.ds-acc-rust`, `.ds-acc-gold`. Every content component inherits it, and a section can override it on the section. FRC and FLL decks are outside this table and carry their own brands.
- **Type sets the ground, accent density, and light-sheet rhythm.** Green ramp is the default. `.ds-surface-neutral` for lab brief and showcase, `.ds-surface-paper` for light sheets. Type never sets hue.

Accent classes re-resolve against whatever ground is active, so `.ds-acc-green` inside `.ds-surface-paper` picks the paper ink green rather than the dark-ground mint. Unset, `--acc` is green, which is why every pre-cascade artifact still renders identically.

**Green is reserved for the pathway, not for a course.** `AnimatedLogo`, `Wordmark`, `GearMark`, `DeckFooter`, hub `JumpGrid`, and the title and closing accents render green in every deck regardless of `--acc`. Every deck opens green, closes green, and carries green chrome throughout. The course accent lives in the content layer between the bookends.

Remaining decisions at this step:

- Which sheets use `.ds-surface-paper`. Value contrast breaks monotony harder than hue rotation and is chronically under-used: the Unit 1.1 deck used it zero times across 29 slides against the reference template's two in fifteen.
- Which ambient textures appear and where.
- Anything that should look deliberately different from the last deck, and why.

Chat states an opinion here. Suggestions and constructive criticism are expected at this step, not withheld.

### Step 8. Confirm and lock

Chat restates every decision in a compact block. Alejandro confirms. Only then is the prompt written.

---

## The Prompt Skeleton

Every Claude Design prompt contains these six sections in this order. Sections one, two, and six are near-verbatim boilerplate. Sections three, four, and five carry the artifact.

### 1. Routing header

```
Start from templates/deck/Deck.dc.html in the IDEA Design System.
Aspect: 4:3, 1920 x 1440.
Output: a single .dc.html deck.
Do not start from a blank slide.
```

### 2. Inheritance block

Paste this verbatim. It is the fix for the Unit 1.1 failure and it does not get paraphrased.

```
INHERITANCE, NON-NEGOTIABLE

Use the design system's own components and motion library. Do not
reimplement anything the system already ships.

Components: use the components named per slide below. Read the matching
components/<group>/<Name>.prompt.md before using one. If a named component
does not fit, stop and say so rather than substituting a hand-built
equivalent.

Motion: use only classes defined in tokens/deck-motion.css. The Token Layer
section of IDEA_DS_DIGEST.md is authoritative; the list below is a snapshot and
the library grows.
  Slide transitions: ds-slide-machine | ds-slide-hud | ds-slide-shear |
    ds-slide-fade
  Element entrances: ds-in-rise | drop | left | right | fade | blur |
    tracking | stamp | zoom | glitch | flicker | strike
  Image reveals: ds-img-wipe | wipe-down | iris | chamfer | zoom | kenburns
  Ambient textures, static layers from tokens/surfaces.css, stacked as
    <div class="ds-ambient ds-ambient-NAME">: grid | scan | bloom | glow |
    cad | contour | floor | hatch | iso | particles | radar
  Ambient loops, animation from tokens/deck-motion.css: ds-bg-gridpan |
    scanlines | pulse | drift | shimmer | spin
  Stagger: ds-d1 through ds-d8

The two ambient systems are separate and are not interchangeable. The static
texture layers are what a slide's atmosphere is built from; the loops animate
a layer that is already there.

Do not define custom animation classes. Do not define custom keyframes.
Do not create a parallel motion vocabulary under any prefix.

Colors: tokens only. Never invent a color, never hardcode a hex that is
not already a token value.

Images: every image-slot carries exactly one of the three treatments named
per slot below, ImageFrame, ImageFrame with bleed, or Cutout. Never hand-roll
a filter, tint, gradient, mask, or scanline composite over an image slot. QR
codes are the one exemption and are named as such in the slot plan.

Copy: running copy goes in element children or a component's child slot.
Do not move copy into a component prop or into the data-props script block
unless that block is listed as locked copy in Declared Exceptions.
```

### 3. Global chrome spec

Persistent footer content, slide numbering scheme, hub behavior, progress rail, speaker notes policy, and which sheets are light.

### 4. Per-slide spec

The approved Step 3 table, one row per slide, plus body copy per slide.

### 5. Declared exceptions

Every deviation from the inheritance block, named in advance with a one-line reason. See Exception Protocol.

### 6. Prohibitions

```
Do not add slides not in the spec.
Do not add motion not in the spec.
Do not substitute a hand-built element for a named component.
Do not change the aspect ratio.
Do not use crimson except for LIVE, REC, or error states.
```

---

## Inheritance Rules

**Strong default with declared exceptions.** Hand-building something the system already ships is a defect when it was not declared in advance, and acceptable when it was.

The failure mode this addresses is not "the component did not fit." It is "the component was never considered." Requiring the exception to be written into the prompt before building forces the consideration to happen at scoping time, where it belongs.

Chrome discipline, inherited from the reference template:

- `HudFrame` on data and telemetry sheets only, never as general decoration.
- Glow reserved for hero type and hero numerals. Not applied to body copy, not applied to every heading.
- Stats sit under a hairline rule, not inside bevelled boxes.
- One ambient texture per sheet maximum.
- Radii stay small: 2px chips and badges, 3px buttons and inputs, 4px cards and panels.
- Deck chrome never shows a neutral white. Canvas, letterbox, and thumbnail frames follow `--bg0` and `--edge` so transitions never flash white.

---

## Motion Standard

Base styles are the visible end state. Nothing animates until the element is inside `[data-deck-active]` or a `.ds-run` container, which is what keeps print, PDF, and reduced-motion output complete. Any pattern that inverts this, making content exist only after an interaction, violates the system and is prohibited outside the narrow reveal exception below.

Every animation is already gated behind `prefers-reduced-motion: no-preference` inside the library. Do not add a second gate and do not remove the first.

Transition assignment by slide role:

| Slide role | Transition |
|---|---|
| Content, general | `ds-slide-machine` |
| Data, telemetry, charts | `ds-slide-hud` |
| Section divider, statement, quote | `ds-slide-shear` |
| Quiet beat, deliberate stillness | `ds-slide-fade` |
| Build state | none |

Generic push, zoom, straight wipe, and iris transitions were deliberately removed from the library. They read as presentation-software defaults at 1920px. Do not reintroduce them by hand.

---

## Reveals and Interaction

`deck-stage.js` has no fragment or step system. Arrow keys, space, PageDown, and taps all advance a full slide. Two mechanisms cover everything, and which one applies is decided by **who controls the order**.

| | Build slides | Click targets |
|---|---|---|
| For | Predetermined sequence | Non-linear interrogation |
| Driven by | Clicker, from anywhere in the room | Wireless mouse, standing at the screen |
| Example | A three-step derivation | A comparison table the room asks about out of order |
| May hide content | No | No |

### The governing constraint

**Click targets may change emphasis. They may never reveal content.**

Base state shows everything. Interaction highlights, isolates, or annotates what is already on screen. Clicking a table row dims its siblings and lights that one. Clicking a diagram hotspot raises a callout that was already rendered at low opacity.

This is not a style preference. `deck-motion.css` guarantees that base styles are the visible end state so print, PDF, and reduced-motion always show content. Hide-until-clicked breaks that guarantee, loses material on export, and hands Mr. Cosso a deck whose content depends on knowing an unmarked region is clickable. Emphasis-only interaction costs nothing: the PDF is complete, and a presenter who never clicks still gets a working deck.

A hidden answer that should appear on cue is a build slide, not a click target. The order is predetermined, so it belongs to the mechanism built for predetermined order.

### Build slides: the mechanism

Duplicate the section and add the newly revealed element. Then:

1. The build sections carry **no** `ds-slide-*` class. Transitions fire only via `[data-deck-active].ds-slide-*`, so with no class the slide cuts instantly and carried-over content sits perfectly still.
2. Carried-over elements have their entrance classes **stripped**. Entrances replay whenever `data-deck-active` is set, so leaving them on causes the whole slide to re-animate.
3. Only the newly revealed element carries an entrance class and a stagger delay.

Result: existing content does not flicker, new content rises in, and it advances with the same key as every other slide.

**Budget.** Maximum four slides per deck carry build states, maximum three states per chain.

**Numbering.** The footer numbers the **logical** slide. A slide with three build states reads the same number on all three, so hub ranges and part chrome stay accurate. Build states clutter the thumbnail rail. That cost is accepted rather than mitigated, which is a further reason to keep the budget tight.

### Click targets: the mechanism

`_onTap` skips advancing when a click lands on `INTERACTIVE_SEL`, which includes `button`, `[role="button"]`, `[onclick]`, and `[tabindex]:not([tabindex^="-"])`. Any element carrying one of those is a safe click target and will not advance the deck.

Keyboard cannot be substituted. Space with a button focused fires both the button and the slide advance, because `_onKey` only ignores `INPUT`, `TEXTAREA`, `SELECT`, and contenteditable. Click targets are mouse-only by construction.

Rules:

- Targets are visibly affordant. A row or panel that responds to clicking looks like it does, at projection distance, from the back of a shop bay.
- State is resettable. Leaving the slide and returning restores the base state, so a slide never carries stale emphasis into a later pass.
- Every interrogable slide is marked in the scoping inventory.
- Maximum one interaction pattern per slide. A slide with clickable rows does not also have clickable hotspots.

## Image Slots

Uploaded images are expected in nearly every IDEA artifact and must never look pasted on. Two things make that true: enough of them, and a treatment that seats each one in the sheet.

### Density

**Floor: two thirds of slides carry a visual aid.** A slide without one is a decision recorded in the Step 6 plan with its reason, not a slide the plan forgot about.

Reasons that hold: a statement or quote sheet where the type is the visual, a hub, a bookend, a slide whose chart or annotated drawing already is the image. Reasons that do not: the copy felt sufficient, no photograph was on hand, the layout was tight.

A visual aid is not only a photograph. A design-generated vector, a `CalloutDrawing`, a `BarChart`, a `PathwayMap`, or a `SpecTable` all count against the floor. Where no photograph exists, the answer is usually a drawing rather than a bare slide.

BTSN 2026 ran 8 of 19 sections with nothing visual, and every one of the eight had an obvious candidate. Text-only slides accumulate quietly because nothing was counting them.

### The three treatments

Every slot gets exactly one, chosen by what the image **is**, not by where it sits on the slide.

| Content | Treatment | Component |
|---|---|---|
| Photograph, screenshot, CAD render, drawing, anything opaque edge to edge | Framed | `ImageFrame` |
| Photograph that should dissolve into the sheet rather than stop at a line | Bleed | `ImageFrame` with `bleed` |
| Transparent PNG: an isolated part, tool, product, coin, mark, or emblem | Cutout | `Cutout` |

Hand-rolled filter, gradient, mask, and scanline stacks are prohibited in all three cases. They drift slot to slot and they are not the house treatment.

**Framed** is the CAD-viewport treatment: blueprint backplate with mint bloom and 24px grid behind an empty slot, then the soft-light tint, scanline, inner rim-light ring, and bottom vignette over the content. Variants:

| Content | Variant |
|---|---|
| Equipment, benches, CAD renders, drawings | `brackets` |
| Portraits and round marks | `shape="round"` |
| Screenshots and interface captures | plain rect |

**Bleed** is Framed with the frame edge feathered into the ground on the named side, so a photograph reads as part of the sheet instead of an inset panel. `bleed="left"` or `"right"` when copy sits beside the image, feathering the side that faces the copy. `bleed="bottom"` under a full-width band. `bleed="all"` for an atmospheric plate sitting behind content.

**Never bleed a screenshot.** A feathered interface capture reads as a rendering fault, and the hard edge is what tells the room it is looking at a screen.

**Cutout** is for anything carrying an alpha channel. It draws no backplate, no grid, no rectangular overlay, and no corner brackets, because a cutout has no rectangle to draw. Grading is a filter chain on the subject itself, so every layer follows the silhouette: a slight desaturation and contrast lift toward the palette, an accent rim from the upper left matching the standing photography direction, a tight contact shadow, an ambient shadow, and an accent bloom hugging the edge.

`ground` decides how the subject sits:

| `ground` | Reads as | Use for |
|---|---|---|
| `shadow` (default) | A part resting on the sheet | Tools, equipment, samples, struck coins, products |
| `shelf` | A part on a datum line | Spec-sheet and parts-list slides |
| `none` | A floating mark | Logos, emblems, badges, team marks |

### Transparent images

Three rules. Each one was a live defect in the BTSN 2026 deck.

1. **A transparent PNG never goes in `ImageFrame`.** The frame fills the transparent region with its backplate and grades it with a rectangular tint, which is precisely the discolored box around the subject. Use `Cutout`.
2. **The slot's own backplate is suppressed by the design system, never by the page and never by hand.** `image-slot.js` paints `rgba(127,127,127,.08)` behind every upload, wrapped or bare, which is a neutral grey the deck chrome rule already forbids. It is a copied platform starter that a re-copy overwrites, so the suppression lives in a design-system stylesheet as an `image-slot::part(frame)` override. Never patch `image-slot.js` inside a deck folder.
3. **`fit="contain"` on every cutout slot.** `cover` crops the silhouette against the slot edge, which is the one reliable way to make an alpha image look framed again.

### Source assets for cutouts

A cutout is only as good as its alpha. Background removal run on a vendor listing photo routinely leaves the product's own backdrop plate and the seller's marketing lockup sitting inside the opaque region, and no treatment recovers that. The respirator on BTSN 2026 slide 14 shipped carrying a light-blue shield plate and a "1 RESPIRATOR / NIOSH" overlay baked in.

Accept a cutout only when:

- The alpha boundary follows the object, not a rounded rectangle around it.
- No text, badge, watermark, price, or seller lockup survives in the opaque region.
- No leftover backdrop gradient, cast shadow, or reflection from the original photo.
- It was checked against a mid-value ground rather than against white, since white hides a white fringe.

If a clean cutout is not available, the opaque original in `ImageFrame` is the better output. A bad cutout looks worse than an honest photograph.

### QR codes

The one exemption from all three treatments. A QR renders bare on a light plate at full contrast: no tint, no grade, no bleed, no scanline, no brackets. The soft-light tint costs scan margin and the code has to resolve from a phone at the back of a shop bay. Every QR slot is named as an exemption in the Step 6 plan so the audit does not read it as a missing wrapper.

### Rules for every slot

- Size the frame on the frame. Make the child fill it with `position:absolute; inset:0`.
- Any drawing-block badge sits at `z-index:4` so it clears the overlays.
- Slot ids follow `s{slide}-{subject}`, for example `s18-matweb`.
- Placeholder text is **photography direction**, not a label. "Calipers, dark background, single light upper left, straight on, tool isolated" beats "caliper photo."
- Every slot gets an image reveal from `ds-img-*` unless the scoping plan says otherwise.

### Standing photography direction

Applies to every equipment and sample photograph unless overridden. Dark or neutral background. Single light source from the upper left. Shot straight on rather than angled. Subject isolated with nothing else in frame. Consistent framing across a set so the deck does not look assembled from a phone roll.

### Sourcing

| Source | Use for |
|---|---|
| Design-generated vector | Diagrams, sequences, comparison plots, formula plates |
| Photographs Alejandro takes | The actual tools and samples students will handle |
| Annotated screenshots | Interface and navigation only, never the vendor's data tables |
| Vendor product images | A required purchase only, so a parent can recognize the item in a store listing. The cutout quality gate applies |
| Stock or search imagery | Not used |

### Capability status

All of it is live as of 2026-08-21, at **56 components**. `Cutout` ships in `surfaces/` with its three grounds and the `tone="none"` opt-out; `ImageFrame` carries `bleed` and takes its backplate from `--surface-viewport` / `--viewport-bloom` / `--viewport-ink`, which every surface scope now redeclares as literals; and `tokens/image-slot.css` carries the `::part(frame)` suppression. No cutout needs a declared exception any more, and one that carries a hand-rolled filter chain is a defect.

Verified against the exported bundle rather than the build report: cutouts on the dark ramp, `.ds-surface-neutral`, and `.ds-surface-paper` show no rectangle; `ImageFrame` on paper renders a light sheet-grey backplate; `bleed` drops the rim ring and the corner brackets automatically; and an empty slot stays legible on both grounds after the grey wash is gone.

---

## Copy Placement and Editability

A deck gets edited after it is built, usually the morning it runs, usually by one line. Every edit that requires opening the file and hunting through a JavaScript array is a cost the build handed to the presenter, and it is avoidable at authoring time for nothing.

**Copy lives in element children by default.** Text in an element's children is editable directly on the Claude Design canvas. Text passed as a component prop is not. Text in the `data-props` script block is not, and is the worst case, because reaching it means scrolling past the entire deck to an array at the bottom of the file.

BTSN 2026 put 407 words in component props and 277 in `data-props`, against 612 in children. Fifty-three percent of the deck's copy was unreachable from the canvas, including both grading breakdowns, the three classroom rules, and the course sequence. The reference deck template does the opposite: copy in children throughout, `data-props` carrying three values.

### Where copy is allowed to live

| Home | Canvas-editable | Allowed for |
|---|---|---|
| Element children, component child slots | Yes | All running copy. This is the default |
| Component prop | No | Short fixed chrome only: a deck name, a figure number, a unit label, an eyebrow |
| `data-props` script | No | Structural data only: dimensions, graph edges, weights, highlight sets |

**Anything in the second or third row is declared in the prompt as locked copy,** with its reason. An undeclared prop-carried sentence is a defect on the same footing as an undeclared hand-rolled component, and for the same reason: the decision was never made, it just happened.

### Child slots are the authoring default

Seven containers gained child components on 2026-08-21, so the array path is no longer the only way in:

| Container | Child |
|---|---|
| `StepCard` | `Step` |
| `ProcessPipeline` | `PipelineStep` |
| `CompareSplit` | `CompareRow` |
| `FocusTable` | `FocusRow` |
| `JumpGrid` | `JumpCard` |
| `SampleGrid` | `Sample` |
| `LeaderboardTable` | `LeaderRow` |

`Callout` takes children as its body, with `sub` kept as the fallback. `SpecTable` and `SpecRow` were already the pattern the rest now follow.

**Authoring form:** the unslotted child is the primary string, and any further string is named with a plain `slot` attribute. Both paths render through the same child component and are pixel-identical, so the array form is compatibility only. Use children.

```jsx
<Step><span slot="title">Zero the caliper</span>Close the jaws, confirm the display reads 0.00.</Step>
```

The array prop still works on every one of them, unchanged. It is the right choice in exactly one case: content generated from data rather than written by hand.

### When a component still accepts copy only as a prop

That is a component gap, not a licence to move the copy. Log it as a promotion candidate under Loop A and declare the copy locked until the slot exists.

`PathwayMap` and `DecisionMatrix` are deliberately not on the list above and will not be. Their arrays are structure rather than copy: an edge list is a graph and a weight set feeds a computation, and splitting a graph into children moves the endpoints further apart, not closer to the canvas. Node titles and criterion labels inside them stay locked copy and are declared as such. Both prompt files state that the omission is a decision, so a future pass does not read it as unfinished work.

### Structural data is not copy

A `PathwayMap`'s edge list, a `DecisionMatrix`'s weights, and a chart's series are data. They belong in `data-props` and stay there. The test is whether a human would read the string out loud in the room. Node titles and row labels are copy. Edge endpoints and weights are not.

---

## Deck Format and Chrome

- **4:3, 1920 x 1440, by default.** This is the design system convention and it silently overrides a 16:9 request in a spec. 16:9 at 1920 x 1080 is available as an opt-in tweak and must be stated in the routing header if wanted. Note that 4:3 gives less horizontal room, so two-column comparisons need tighter copy.
- Body copy no smaller than 18pt equivalent for anything projected into a shop bay.
- Persistent chrome on every slide except the hub: part name bottom left in Share Tech Mono at reduced opacity, logical slide number bottom right, and a per-part progress rail along the bottom edge so a room entered mid-stream knows where it is.
- `data-label` and `data-screen-label` on every section for the thumbnail rail.
- No day numbers in slide titles anywhere. Parts are numbered, days are not, because days go stale the moment the calendar moves.

---

## Exception Protocol

An exception is legal when it is declared in the prompt before building, in the Declared Exceptions section, in this form:

```
EXCEPTION: Slide H hub cards.
No DS component covers a five-across clickable navigation row.
Hand-built on Card fill, hairline border, 4px radius, bevel-raised.
```

The declaration names what is being skipped, why, and what the hand-built element inherits instead. Undeclared hand-rolling is a defect and goes back for rebuild.

---

## Pre-Delivery Audit

Run against every Claude Design output before it is called finished. Automated counts first, then a screenshot review, since visual problems surface from real use that a count will not catch.

**Counts**

1. `ds-slide-*` occurrences equal the number of non-build slides.
2. `ds-in-*` present, within the per-slide entrance budget.
3. `ds-img-*` present on every image slot the plan called for.
4. `ds-d1` through `ds-d8` present wherever the plan called for stagger.
5. Every `image-slot` carries its planned treatment. `ImageFrame` plus `Cutout` wrappers plus declared QR exemptions equals `image-slot` count.
6. Ambient layer count does not exceed one per slide, and ambient is not on every slide.
7. Zero custom animation classes. Zero custom `@keyframes`. Grep for any repeated non-`ds-` class prefix. Check motion class names against the digest's Token Layer rather than against this document, since the library grows.
8. Every `var(--token)` resolves against `tokens/`. No hardcoded hex outside token values.
9. Crimson appears only on LIVE, REC, error states, or an expired `Timer`.
10. A single `.ds-acc-*` class on the deck root matches the course. No component passes an explicit `color` that should have been inherited.
11. `Wordmark`, `DeckFooter`, and `JumpGrid` render green. They default to identity and only join the cascade via `identity={false}`.
12. Ground class matches the deck type: default green ramp, `.ds-surface-neutral`, or `.ds-surface-paper`.
12b. Status colors are untouched by the accent. `Badge`, `ResultBanner`, and `Timer` warn and expired states sit outside the cascade by design.

**Structure**

13. Aspect ratio matches the routing header.
14. Slide count matches the spec. No slides added.
15. Footer numbers logical slides, not physical ones.
16. Build slides carry no transition class and no stale entrance classes on carried-over elements.
17. Component usage matches the Step 3 table, and every deviation appears in Declared Exceptions.

**Visual**

18. Screenshot review of every slide, not a sample.
19. No neutral white anywhere in deck chrome.
20. Text fits at 4:3 without overflow or forced shrinking.

**Interaction**

21. No element is hidden in its base state. Click targets change emphasis only.
22. Every interrogable slide appears in the scoping inventory's Interrogable column.
23. Click targets are visibly affordant at projection scale, verified in the screenshot review.
24. Slide state resets on re-entry.

**Output**

25. Print or PDF export shows all content, including every build state.
26. Digest component count matched the live bundle at scoping time.

**Images**

27. No slot holding an alpha-carrying image sits inside `ImageFrame`. Every cutout uses `Cutout` with `fit="contain"`, and no cutout carries a hand-rolled filter chain.
28. Visual aid density meets the two-thirds floor, and every text-only slide appears in the Step 6 plan with its stated reason.
29. No `bleed` on a screenshot slot.
30. QR slots render bare at full contrast and appear in the plan as exemptions.
31. Rendered against both grounds the deck actually uses. A slot verified only on the dark ramp is not verified, since the defects this catches are ground-dependent.

**Copy**

32. No running copy sits in a component prop or in `data-props` unless it appears in Declared Exceptions as locked copy.

**Facts**

33. Every approval status, credit total, date, dollar figure, part number, room number, and proper name is checked against a source document in project knowledge before delivery. Any projected figure is labeled as projected on the slide itself, not only in the notes.

### Who runs the audit

**The audit is a separate chat pass against the exported bundle.** The session that built the artifact does not audit it. Self-verification cannot catch the class of error the audit exists to find, because the same reading that produced the mistake produces the check. The BTSN 2026 build passed its own review and a separate pass then found three presentation-visible defects: stale full-slide entrance classes on build states, a dropped `SampleGrid` with all three images already uploaded, and ambient layers running on 15 of 19 sections against a spec of four.

---

## Live Evolution

The design system and this project's standards both learn from every artifact produced. Two loops, deliberately different, because they fail in different ways.

### Loop A: Component promotion

The design system lives in Claude Design and is edited by Claude Design. Promotion is a task given to Claude Design, not a repo operation.

**Trigger.** Every declared exception in a shipped prompt is logged as a promotion candidate. An exception is a written admission that the system lacked something.

**Criterion.** Promote on the second use, or on the first if the element is obviously generic. One-off elements genuinely specific to a single artifact stay hand-built. Promoting them inflates the library with things nobody reaches for, which makes the library harder to search, which causes hand-building. The failure mode is symmetric with under-promotion.

**Process.**

1. Chat writes a component promotion spec: name, group, what and when, props table, example usage, motion behavior, tokens consumed.
2. Alejandro gives the spec to Claude Design as a design system task.
3. Claude Design authors the `.jsx`, `.d.ts`, and `.prompt.md`, updates the group demo card and the manifest.
4. Alejandro exports the bundle and hands it to chat with `build_ds_digest.py`.
5. Chat regenerates `IDEA_DS_DIGEST.md`. Alejandro replaces it in project knowledge.
6. The retired exception is removed from the prompt template and from any deck spec that carried it.

Step 6 is what closes the loop. A promoted component that prompts keep declaring an exception against was not actually promoted.

**Motion note.** Several candidates arrive disguised as motion. `settle` is a measured-value readout, not an animation. `spec-in` is a definition plate. When a spec invents a motion name that describes what a thing *is* rather than how it *moves*, that is a missing component, and it gets promoted as one.

### Loop B: Standards correction

**Trigger.** Any output that misses. Wrong component, wrong motion, wrong structure, wrong assumption.

**Classify before editing.** Four cases, three fixes.

| Case | Fix |
|---|---|
| Rule was missing | Add it |
| Rule was ambiguous | Sharpen it, keep it in one place |
| Rule was wrong | Correct it, note the reversal in the changelog |
| Rule existed and was not followed | **Change nothing in the doc.** Add a check to the audit |

The fourth row carries the weight. Restating an existing rule louder does not make it more likely to be followed, and doing it repeatedly turns a standard into something too long to read, which produces exactly the failure it was written to prevent. A compliance failure is an audit gap, not a documentation gap.

**Timing.** The correction ships in the same turn as the miss is identified, as a complete updated file. Never a patch list, never deferred to later.

**Scope.** The correction lands in the one document that owns the rule. A rule about tokens belongs in the design system, a rule about prompting belongs here, a rule about routing belongs in the process doc. Duplicating a rule across documents guarantees they drift.

---

## Artifact Types Beyond Decks

The scoping protocol and inheritance rules apply unchanged. What differs:

| Artifact | Starting point | Motion activation | Notes |
|---|---|---|---|
| Deck | `templates/deck/Deck.dc.html` | `[data-deck-active]` | Full transition set |
| Technical review deck | `templates/review/Review.dc.html` | `[data-deck-active]` | Drawing-office plain, tighter chrome |
| One-pager, poster | Static HTML | `.ds-run` container | No slide transitions. Entrances and ambient only |
| Interface mock | `templates/portal/` or `templates/gauntlet/` | `.ds-run` container | Throwaway. Never becomes production code |

For any non-deck artifact, motion runs inside a `.ds-run` container instead of `[data-deck-active]`, and the four slide transitions do not apply. Element entrances, image reveals, ambient loops, and stagger all work identically.

---

## Changelog

- **2.0 (2026-08-25)** - Consolidation. Three documents were carrying IDEA design
  rules and the routing map named all three as authoritative. `IDEA_Design_System.md`
  was the declared owner of color, typography, and effects, was routed to as normative
  by six documents, and **was not present in project knowledge or in either Drive
  library.** `IDEA_instructions.md` affirmatively vouched for it at version 2.0 with a
  cleared stale-copy warning, so every reader was told a readable authority existed and
  then silently substituted memory for it. Its territory is absorbed into the new Visual
  Identity section here and the name is retired; all six routing sites repoint to this
  file. `IDEA_DS_DIGEST.md` was carrying a second full visual-identity document as its
  Brand Guide section, generated from a different upstream than the one the repo
  declares authoritative, and asserting `src/app.css` as the token source of truth,
  which is a retired fact. The digest is demoted in writing to a generated reference
  that is evidence and not authority, `build_ds_digest.py` now stamps that on every
  regeneration, and the correct source is stated as a rule. `IDEA_INTERFACE_STANDARDS.md`
  is deliberately kept separate: it governs shipped app surfaces for Claude Code, not
  authored artifacts for Claude Design, and merging it would make this a grab bag. Its
  dangling reference to `IDEA_VERIFICATION_STANDARDS.md`, a second file that does not
  exist under that name, is corrected to `IDEA_VERIFICATION_ADDENDA.md`. The Console
  Register token values are named as owed from the repo rather than transcribed, because
  they have never been readable from any document.

- **1.6 (2026-08-21)** - Both promotion prompts landed; the library is at 56 components. Retires the pending gate in Capability status, since `Cutout`, `ImageFrame`'s `bleed`, the `--surface-viewport` alias set, and `tokens/image-slot.css` are all shipped, and a hand-rolled cutout filter chain is now a defect rather than a declared exception. Copy Placement rewritten around the seven container-and-child pairs that shipped, with the slot-attribute authoring form and the note that both paths render identically, so children are the default and the array is compatibility. Corrects the staleness check: the digest fingerprint was a count of `.jsx` files while Claude Design reports the manifest's exported registry, which is a different number and, worse, one that cannot see a batch adding child components to existing files. The copy-slot batch added seven components and zero files, so the old fingerprint would have held steady through the entire change. `build_ds_digest.py` now reads the registry, and derives its token-file list from `styles.css`'s import order rather than a hardcoded list, after `tokens/image-slot.css` shipped and would otherwise have been invisible to the digest along with the `::part` override it carries.
- **1.5 (2026-08-21)** - Image and copy revision, written from a teardown of the shipped BTSN 2026 bundle. Three stacked causes were found behind transparent uploads showing a discolored box, and all three are now named: `image-slot.js` paints its own `rgba(127,127,127,.08)` neutral grey behind every upload whether wrapped or bare; `ImageFrame` draws six rectangle-shaped layers that have nothing to land on when 45 percent of the slot is alpha; and `ImageFrame`'s backplate is a hardcoded `#161e15`, so `.ds-surface-paper` cannot retint it and a light sheet keeps a dark box. That last one is the alias-layer failure batch 4 repaired at token level, reappearing as a literal inside a component. Image Slots rewritten around three named treatments (Framed, Bleed, Cutout) chosen by what the image is, with a two-thirds density floor, cutout source-asset gates, and the QR exemption that audit check 5 had been reading as a missing wrapper. New Copy Placement and Editability section after measuring that 53 percent of the BTSN deck's copy sat in props or `data-props` and could not be edited from the canvas; children are now the declared default and prop-carried copy is a declared exception. Inheritance block corrected on the ambient systems, which are two libraries (static `.ds-ambient-*` layers in `surfaces.css`, animated `.ds-bg-*` loops in `deck-motion.css`) and were documented as one. Audit expanded from 26 checks to 33, adding the Images and Copy groups and landing the factual-verification check queued from the BTSN session as check 33. Added the rule that the audit runs as a separate chat pass, since the building session cannot catch what the audit is for. `Cutout`, `bleed`, `--surface-viewport`, and the `::part(frame)` suppression are pending the promotion prompt issued with this revision; the digest fingerprint of 43 components is the gate.
- **1.4 (2026-08-20)** - Final pass after all four batches landed. Library is at 43 components. Replaces the proposed token names in Step 7 and audit checks 10 to 12 with the real ones: `.ds-acc-*` accent classes, `.ds-surface-neutral`, and `--acc` defaulting to green so pre-cascade artifacts render unchanged. Adds check 12b, since status colors were deliberately kept outside the cascade. Batch 4 also repaired the semantic alias layer, which had never themed: aliases declared once in `:root` freeze their `var()` substitution there, so `.ds-surface-paper` was carrying dark-ground values onto a light sheet. `--acc-line` and `--acc-glow` are declared on `*, *::before, *::after` for the same reason.
- **1.3 (2026-08-20)** - Corrects the inheritance block, which enumerated eleven element entrances as a closed set. Batch 1 added a twelfth, `ds-in-strike`, correctly gated and documented, and the enumeration went stale the moment it landed. The list is now marked as a snapshot with the digest's Token Layer named authoritative, and audit check 7 compares against the digest rather than against this file. The underlying error was hardcoding a growing list into a document that does not regenerate, which is the same two-sources-of-truth failure this standard warns about elsewhere.
- **1.2 (2026-08-20)** - Added the accent system to scoping Step 7 after the design system was found to be green in its neutrals, not only its accents. Course sets hue, type sets ground and accent density, and green is reserved for pathway identity chrome so it stays primary without being the default for everything. Audit expanded to 26 checks. Token names confirm once batch 4 lands.
- **1.1 (2026-08-20)** - Click targets admitted as a second reveal mechanism, governed by the emphasis-never-reveal constraint, after confirmation that a wireless mouse at the screen is available alongside the clicker. Build slides remain the default for predetermined sequence. Added Session Prerequisites requiring `IDEA_DS_DIGEST.md` with a staleness check. Added Live Evolution with the component promotion loop and the standards correction loop, including the rule that a compliance failure is an audit gap rather than a documentation gap. Slide inventory gained an Interrogable column. Audit expanded from 18 checks to 23.
- **1.0 (2026-08-20)** - Initial standard. Written after the IDEA209H Unit 1.1 deck shipped with one design system component across 29 slides and a hand-rolled parallel motion vocabulary. Establishes the slide inventory as a required scoping step, the verbatim inheritance block, build slides as the presenter-control mechanism, ImageFrame as mandatory for every image slot, 4:3 as the confirmed default, and the pre-delivery audit.
