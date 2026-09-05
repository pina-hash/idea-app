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
			/* Five buckets carry no `file_size_limit`, so their real ceiling is
			   the Supabase project-wide limit and this repository cannot read
			   it. The tag is what says so on screen; the count is what stops
			   the claim drifting. */
			selector: '[data-testid="upload-limits-tag"][data-tag="unstated"]',
			label: 'the five paths whose ceiling is NOT set in this repository, marked as such',
			expectPresent: 5,
			maxPresent: 5,
			expectVisible: 5
		},
		{
			selector: '[data-testid="upload-limits-tag"][data-tag="stated"]',
			label: 'the eight that are, as the positive control for that five',
			expectPresent: 8,
			maxPresent: 8,
			expectVisible: 8
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
			label: 'a hand-in names its size, its 200 MB limit, and what to do',
			must: ['201.0 MB', '200 MB', 'Split it, zip it, or link to it instead.']
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
			/* THE ROW THE BUNDLE EXISTS FOR. A ceiling this repository does not
			   set must not be reported as a number: naming one we do not have
			   is precisely what produced "file size limit at 25 mb". It says
			   the size, says the limit is not ours, and names who can change
			   it. `mustNot` is the load-bearing half.

			   SCOPED TO THE REFUSAL PARAGRAPH, NOT THE ROW, and the first run
			   of this spec is why: the row also carries a `statedBy`
			   provenance line reading "refuses at 75 MB in the browser", which
			   is a true statement about where the number lives and is exactly
			   the sentence a student never sees. Asserting `mustNot` over the
			   whole row reported a correct page as a failure. The claim is
			   about the SENTENCE, so the selector has to be. */
			selector: '[data-testid="upload-limits-row"][data-path="foundry-bundle"] [data-testid="upload-limits-refusal"]',
			label: 'a Foundry upload refused by a ceiling outside this repo invents no number',
			must: ['site-wide upload limit', 'site admin'],
			mustNot: ['75 MB', '110 MB']
		},
		{
			selector: '[data-testid="upload-limits-row"][data-path="tournament-thumb"]',
			label: 'and so does a tournament thumbnail, which has no check of any kind before it sends',
			must: ['site-wide upload limit']
		},
		{
			/* POSITIVE CONTROL FOR THE ONE ABOVE, on the same page: a file well
			   under its ceiling, refused for a reason that is not size, is not
			   told about size. A refusal that mentions a limit when the limit
			   was not the problem is how a student deletes work for nothing.

			   Scoped to the message for the same reason as the row above: the
			   harness's own `about` line says "a 40 MB file into a 200 MB
			   bucket", which is the fixture being described and not the
			   sentence under test. */
			selector: '[data-testid="upload-limits-other"][data-case="denied"] [data-testid="upload-limits-other-message"]',
			label: 'a 40 MB file refused by RLS is told about permission, never about size',
			must: ['row-level security'],
			mustNot: ['limit', '40.0 MB', '200 MB']
		},
		{
			selector: '[data-testid="upload-limits-other"][data-case="unanticipated"]',
			label: 'a message nobody wrote a branch for survives verbatim, with its status',
			must: ['Internal error while writing object', '500']
		},
		{
			selector: '[data-testid="upload-limits-project-note"]',
			label: 'the sentence for a ceiling nobody here can read, stated once',
			must: ['site-wide upload limit', 'site admin']
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
		}
	]
};
