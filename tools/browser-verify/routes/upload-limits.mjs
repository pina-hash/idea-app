export default {
	path: '/dev/upload-limits',
	label: 'Every upload ceiling in the portal, and the sentence each one produces when it is hit',
	/* WHAT THIS SPEC IS FOR. Two students reported an upload that did not work
	   and could describe it only as "failed upload" and "file size limit at
	   25 mb" -- a number this repository does not contain. The bundle's answer
	   is that a refusal names three things (what was wrong, the limit, what to
	   do) and that the ceilings are stated once rather than discovered. Both
	   halves are TEXT, so the checks below are mostly `textContains`: the
	   sentence a student reads IS the deliverable, and a presence row would
	   pass on a row that rendered an empty string.

	   THE THIRTEEN ROWS ARE COUNTED, not sampled. A registry that quietly
	   stopped rendering a path would leave every other assertion here green.

	   0072 MOVED WHAT THIS PAGE CLAIMS. Five of the thirteen used to render a
	   "not ours" tag, because five buckets carried no `file_size_limit` and
	   their real ceiling was a Supabase dashboard setting. `0185` gave every
	   bucket a number under the 50 MB Free-plan global, so that count is zero
	   now and every sentence on the page names a figure. The zero is asserted
	   BESIDE the thirteen, because a zero on its own is also what a broken
	   page looks like.

	   375 IS NOT AN AFTERTHOUGHT HERE. These sentences are long -- three
	   clauses each, by design -- and a long unbroken string is exactly what
	   pushes a grid child past the viewport. The no-horizontal-scroll check
	   the harness runs at both widths is doing real work on this page. */
	/* HYDRATION IS PROVEN, NOT WAITED FOR. `waitForApp` returns on DOM
	   stability, which server-rendered markup satisfies before a single
	   handler is attached (CLAUDE.md: "PAINT IS NOT INTERACTIVITY, AND NO
	   WINDOW MARKER SEPARATES THEM"). This page has no press to make -- every
	   value is a pure function rendered on the server -- so nothing below
	   depends on a live handler; the probe is here anyway, reporting its
	   attempt count, because a spec that never establishes interactivity
	   cannot tell "correct at rest" from "never became live", and the next
	   session to add an `orderResult` here would inherit that blindness. */
	prepare: [
		{
			evaluate: `async () => {
				for (let attempt = 1; attempt <= 60; attempt += 1) {
					if (window.__sveltekit_hydrated || document.querySelector('[data-testid="upload-limits-root"]')) {
						const rows = document.querySelectorAll('[data-testid="upload-limits-row"]').length;
						return 'rendered ' + rows + ' ceiling row(s) after ' + attempt + ' attempt(s)';
					}
					await new Promise((r) => setTimeout(r, 100));
				}
				return 'THE HARNESS NEVER RENDERED in 60 attempts';
			}`,
			label: 'the ceiling table is on screen (retries against its own markup, reports attempts)'
		}
	],
	presence: [
		{
			selector: '[data-testid="upload-limits-root"]',
			label: 'the harness root',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			/* THE COUNT IS THE ASSERTION. Thirteen upload paths were found by
			   the audit; `tests/upload-limits.test.ts` pins the same thirteen
			   ids in order. A row silently dropping out of the registry is the
			   regression this catches on the rendered side. */
			selector: '[data-testid="upload-limits-row"]',
			label: 'all thirteen ceilings rendered, none collapsed away',
			expectPresent: 13,
			maxPresent: 13,
			expectVisible: 13
		},
		{
			selector: '[data-testid="upload-limits-refusal"]',
			label: 'and every one of them carries a refusal sentence',
			expectPresent: 13,
			maxPresent: 13,
			expectVisible: 13
		},
		{
			/* THIS COUNT USED TO BE FIVE AND IS NOW ZERO, WHICH IS THE WHOLE
			   OUTCOME OF 0072. Five buckets carried no `file_size_limit`, so
			   their real ceiling was the Supabase project-wide limit and this
			   repository could not read it. `0185` gave every bucket a number.

			   A ZERO ROW IS ONLY MEANINGFUL BESIDE THE THIRTEEN BELOW. On its
			   own "no unstated tags" is also what a page that stopped rendering
			   tags looks like, so the two rows are a pair and neither is
			   removable. */
			selector: '[data-testid="upload-limits-tag"][data-tag="unstated"]',
			label: 'no path is left claiming a ceiling this repository cannot read',
			expectPresent: 0,
			maxPresent: 0
		},
		{
			selector: '[data-testid="upload-limits-tag"][data-tag="stated"]',
			label: 'all thirteen state one, as the positive control for that zero',
			expectPresent: 13,
			maxPresent: 13,
			expectVisible: 13
		},
		{
			selector: '[data-testid="upload-limits-globals"] > div',
			label: 'the global, the portal ceiling and the unstated count, on screen as numbers',
			expectPresent: 3,
			maxPresent: 3,
			expectVisible: 3
		},
		{
			selector: '[data-testid="upload-limits-other"]',
			label: 'the five non-size failure cases, so the discrimination is readable',
			expectPresent: 5,
			maxPresent: 5,
			expectVisible: 5
		}
	],
	textContains: [
		{
			selector: '[data-testid="upload-limits-row"][data-path="classroom-submission"]',
			label: 'a hand-in names its size, its 45 MB limit, and what to do',
			must: ['46.0 MB', '45 MB', 'Split it, zip it, or link to it instead.']
		},
		{
			selector: '[data-testid="upload-limits-row"][data-path="notebook-photo"]',
			label: 'a notebook photo names 4 MB and points at the camera button, not at nothing',
			must: ['4 MB', 'camera button']
		},
		{
			selector: '[data-testid="upload-limits-row"][data-path="greenline-decal"]',
			label: 'a decal names 1 MB, which is a different number in the same sentence shape',
			must: ['1 MB', 'smaller canvas']
		},
		{
			/* THE ROW THE BUNDLE EXISTS FOR, AND ITS CLAIM IS NOW THE OPPOSITE
			   ONE. It used to read: a ceiling this repository does not set must
			   not be reported as a number, because naming one we do not have is
			   precisely what produced "file size limit at 25 mb". True, and the
			   honest answer to a dishonest situation -- the browser refused at
			   75 MiB against a bucket with no ceiling at all, so a 60 MB app
			   transferred whole and was refused by something nobody could name.
			   0185 gave the bucket the number and the preflight was dropped to
			   match, so the sentence now NAMES it and the deferral to an admin
			   is what must not appear.

			   SCOPED TO THE REFUSAL PARAGRAPH, NOT THE ROW, and the first run of
			   this spec is why: the row also carries a `statedBy` provenance
			   line, which is a true statement about where the number lives and
			   is exactly the sentence a student never sees. Asserting `mustNot`
			   over the whole row reported a correct page as a failure. The
			   claim is about the SENTENCE, so the selector has to be. */
			selector: '[data-testid="upload-limits-row"][data-path="foundry-bundle"] [data-testid="upload-limits-refusal"]',
			label: 'a Foundry upload names the 45 MB ceiling it is actually refused by',
			must: ['45 MB', 'Remove the largest files'],
			mustNot: ['75 MB', '110 MB', 'site admin']
		},
		{
			selector: '[data-testid="upload-limits-row"][data-path="tournament-thumb"] [data-testid="upload-limits-refusal"]',
			label: 'and so does a tournament thumbnail, which has no check of any kind before it sends',
			must: ['45 MB'],
			mustNot: ['site admin']
		},
		{
			/* THE TWO NUMBERS, RENDERED FROM THE CONSTANTS. A panel that went on
			   saying 50 MB after somebody moved the plan is the same class of
			   defect as a bucket that went on saying 200 MB. */
			selector: '[data-testid="upload-limits-global"]',
			label: 'the Supabase project limit, as a number and as the reason it is fixed',
			must: ['50,000,000', 'Free plan']
		},
		{
			selector: '[data-testid="upload-limits-portal"]',
			label: 'the portal ceiling and the margin under the global',
			must: ['47,185,920', '45 MB', '2,814,080']
		},
		{
			selector: '[data-testid="upload-limits-unstated"]',
			label: 'and the count of paths still stating nothing, which is zero',
			must: ['0 of 13', 'tripwire']
		},
		{
			/* POSITIVE CONTROL FOR THE ONE ABOVE, on the same page: a file well
			   under its ceiling, refused for a reason that is not size, is not
			   told about size. A refusal that mentions a limit when the limit
			   was not the problem is how a student deletes work for nothing.

			   Scoped to the message for the same reason as the row above: the
			   harness's own `about` line says "a 40 MB file into a 45 MB
			   bucket", which is the fixture being described and not the
			   sentence under test. */
			selector: '[data-testid="upload-limits-other"][data-case="denied"] [data-testid="upload-limits-other-message"]',
			label: 'a 40 MB file refused by RLS is told about permission, never about size',
			must: ['row-level security'],
			mustNot: ['limit', '40.0 MB', '45 MB']
		},
		{
			selector: '[data-testid="upload-limits-other"][data-case="unanticipated"]',
			label: 'a message nobody wrote a branch for survives verbatim, with its status',
			must: ['Internal error while writing object', '500']
		},
		{
			/* KEPT AS A TRIPWIRE, NOT AS A LIVE STATE. No row can reach this
			   sentence any more; it is what a bucket added tomorrow with no
			   `file_size_limit` should say, and the harness renders it beside a
			   count that says how many rows are in that state (zero). */
			selector: '[data-testid="upload-limits-project-note"]',
			label: 'the sentence kept for a ceiling nobody here can read, naming no number',
			must: ['site-wide upload limit', 'site admin'],
			mustNot: ['45 MB', '50 MB']
		},
		{
			/* CLAUDE.md: no em dashes in user-facing copy. Swept over the whole
			   surface rather than per row, since every sentence on it is copy a
			   student reads. */
			selector: '[data-testid="upload-limits-root"]',
			label: 'no em dashes anywhere in the copy',
			mustNot: ['—']
		}
	],
	contrast: [
		{
			selector: '[data-testid="upload-limits-refusal"]',
			label: 'the refusal sentences, which are the whole deliverable',
			min: 4.5
		},
		{
			selector: '[data-testid="upload-limits-project-note"]',
			label: 'the note about the ceiling that is not ours',
			min: 4.5
		},
		{
			selector: '[data-testid="upload-limits-tag"]',
			label: 'the stated/not-ours tags (a word inside them, so the hue is never the only signal)',
			min: 3
		},
		{
			selector: '[data-testid="upload-limits-globals"] dd',
			label: 'the global and portal figures, which are the numbers a reader comes here for',
			min: 4.5
		}
	]
};
