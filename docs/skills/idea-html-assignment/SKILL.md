---
name: idea-html-assignment
description: Design and build an IDEA HTML assignment for any course - learning brief first, then the build on the hx-kit starter, then the idea-html-test gates. Use for a new assignment, a new stage, or any rework of one.
---

# IDEA HTML assignment

Source of truth: `docs/skills/idea-html-assignment/SKILL.md` in pina-hash/idea-app. The rules are `docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md` (2.0 or later); the kit is `tools/hx-kit/`. Clone the repo and run `npm ci` before anything else; every step below uses it.

The goal is Mr. Pina's: an assignment a student completes alone, start to finish, and comes out with a real skill. A first draft that needs more than one round of changes means a step below was skipped.

## 1. Know what is true now

1. Read the standard's Parts A to F. They are short; read them every time.
2. Find what already exists: the live post first (`get_post` on the IDEA Website connector; `materials/` can be days behind and is never edited from), its source in `assignment-sources/<course>/`, the earlier assignment this one builds on, and his raw sources (his videos and their transcripts, the template part or slide, the rulebook, Library A and B in Drive). The owning source wins over any older document.
3. Run the deeper-not-bigger skill on the ask.

## 2. The learning brief, approved before any HTML

Write the one-screen brief from the standard's Part B (for a unit's first post, map every post of the unit, C3; for a build project, run the core calculation, B9): the skill, the proof and what high quality looks like, where students get stuck, what it builds on, the problem they solve themselves, the stretch, the shape (classes, phases, steps, post, points, sized by Part C), the facts to confirm, and the look (each color named with its anchor, and the header picture). Short bullets he can read on a phone.

Send it and stop for his approval. Ask only for facts you cannot check, one at a time. A revision of a live assignment skips the brief; a new stage does not. If he is away, do the source reading and the brief, and stop there.

## 3. Build on the kit

1. Copy `tools/hx-kit/starter.src.html` to `<COURSE>_<Day or unit>_<What>.src.html`. Paste the approved brief into its top comment.
2. Write the manifest first: semantic, permanent block ids; a `prompt` on every block; optional blocks marked; points adding up three ways (Part F2).
3. Pick the colors (standard D3). Each phase gets a `"color"` in `hx-plan-data`, and anything else that carries a color gets `data-color="name"`: names from `tools/hx-kit/kit/colors.json` (safety, materials, CAD, wiring, FIRST, brands, the linking set), or your own in an `hx-colors` block with an `anchor` taken from the real thing and `means`. Never type a hex in the page and never use one color for text, fill and edge: use `--hx-ink`, `--hx-fill` with `--hx-on`, `--hx-line`, `--hx-wash`, which the build solves for each theme. Never the site's green for a phase. Items with a real-world identity each get their own named color, never a step along a spectrum. Every color gets its anchor in the brief. Draw the header picture from the real subject, and fill `hx-plan-data` with the phases and their classes.
4. Use the kit's parts, never your own copies of them (standard D1a); a library of separate modules sets `data-post="library"` on `<html>`: one `idea-panel` per step, sections inside it, `.hx-tile` for side-by-side options, roles or parts, `.hx-list` and `.hx-table` for rows, `.hx-readout` for a computed number. No stripes, no boxes on the well face, no ruled rows.
5. Write each step with the anatomy in F4: the action as the title, numbered moves from his video in its order and button names, "You should see", "That is not what I see", the evidence panel with the graded inputs, a copy-proof example where one helps, a tap tip on the first use of each term. One step must fit one screen; split rather than scroll.
6. Put the problem the student must solve (A4) and the stretch (A8, `data-optional`, "IDEA Coins, not points") where the brief said.
7. Build: `node tools/hx-kit/build.mjs <file>.src.html`. Never edit the inlined kit blocks. A plumbing fix goes into `tools/hx-kit/kit/`, then rebuild.

## 4. Test it

Run the idea-html-test skill. Every gate, in order. Fix and rebuild until the automatic test has no FAIL and the fresh agents find nothing blocking.

## 5. Deliver

- The built file and its source, plus the posting details: title, points, category, due date, the post text. For an existing post, a re-upload over it, reading the replace screen first (nothing dropped).
- Commit the source (and its generator, if a script writes it) to `assignment-sources/<course>/` on main (standard Part I). A chat that cannot push puts the source in Library C and says so; the HTML standards chat commits it. Never hand Mr. Pina a file to upload.
- When the choice was taste (a palette, a header picture, a layout), show two to five rendered candidates from the test's screenshots and let him pick.

## 6. Leave the system better

Every fix made during the build goes into the standard in the same turn (the Part it belongs to, a changelog line, the `REGISTER.md` row), landed in the repo and project knowledge. A fix to plumbing goes into the kit. A gap in the site goes to site feedback (idea-gap-feedback skill).
