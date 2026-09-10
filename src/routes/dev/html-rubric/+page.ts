import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for `manifestToRubric`: an HTML assignment's manifest
 * becoming the rubric the classroom already grades. Mounts the REAL
 * `RubricView` and the REAL `GradingConsole` -- not a copy of either's markup
 * -- against an in-memory fixture. No auth, no Supabase, no network. 404s in
 * production.
 *
 * WHY THIS NEEDS A BROWSER AT ALL, AND WHY A UNIT TEST IS NOT ENOUGH. The
 * defect class this whole lane replaces is a rubric that STORED FINE AND
 * DISPLAYED WRONG: on 2026-09-08 an instructor rewrote rubric descriptors on
 * IDEA209H Unit 1 and saw nothing change, because `levelShort` renders `short`
 * first and nothing in the product could edit it. Every layer above the screen
 * was correct. So `tests/html-assignment-rubric.test.ts` compares two objects
 * and `tests/html-assignment-rubric-db.test.ts` compares what the column keeps,
 * and neither can see a level whose one-line form never reached a button.
 *
 * THE COMPARISON IS ON THE PAGE, NOT ACROSS TWO RUNS. The same assignment is
 * written twice in the fixture -- once as a MANIFEST and once, by hand, as a
 * SPEC -- and both rubrics are rendered side by side through the same real
 * component, so "identical" is a scrape of two rendered regions rather than a
 * deep-equal of two objects. A route spec measures one URL, so a claim about
 * two renderings has to be answerable inside one page load.
 *
 * THE THREE STATES:
 *
 *   (default)      Both `RubricView`s side by side, and both grading consoles
 *                  below them -- the manifest one handed `spec = null`, which
 *                  is the real HTML-assignment configuration, and the spec one
 *                  handed its spec. This is the comparison.
 *
 *   ?state=single  ONLY the manifest console, which is the page shape the real
 *                  app has. See the caveat below: this is where anything about
 *                  focus or the keyboard is assertable and the default state is
 *                  not.
 *
 *   ?state=graded  The default comparison with scores already returned, so the
 *                  picked level, the running total and the student-facing
 *                  breakdown are all on screen.
 *
 * THE ONE THING THE DEFAULT STATE CANNOT STAND IN FOR, said plainly rather than
 * discovered later: TWO GRADING CONSOLES ON ONE DOCUMENT SHARE A KEYBOARD.
 * `GradingConsole` binds `<svelte:window onkeydown>` and resolves a level with
 * a document-wide `document.querySelector('[data-grade-level=...]')`, so with
 * two mounted, a digit press fires in both and focus lands in the first. That
 * is a property of this harness, not of the component, and it touches only the
 * keyboard path -- the render, the level text, the totals and the override
 * control are unaffected, which is what this route measures. Keyboard grading
 * is measured on `/dev/grading-rubric` and `/dev/grading-change`, which mount
 * one console each, and on `?state=single` here.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
