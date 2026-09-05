export default {
	path: '/dev/foundry-admin/refusal',
	label: '0045: the refusal a closed student reads when they press Preview',
	/*
		THIS IS NOT A COMPONENT AND THAT IS THE WHOLE REASON IT HAS ITS OWN
		ROUTE. `/foundry/preview` is a `+server.ts`, so a closed student's
		refusal has no layout, no shell, no room class and nothing of the
		portal's type or colour around it -- `foundryClosedResponse` builds the
		entire document. Measuring the same sentences mounted inside
		`/dev/foundry-admin`'s shell would be measuring a page that does not
		exist; this route serves the REAL bytes the student receives.

		WHAT IS BEING PROVED HERE is that a refusal on a bare document is still
		legible and still reads at a phone width: the failure this replaces was
		a bodyless 404, which measured nothing because there was nothing on
		screen.

		THE PAGE CARRIES ITS OWN CSP (`default-src 'none'`), so nothing is
		fetched and no script runs. Every number below is therefore taken in the
		FALLBACK FONT STACK by construction rather than by the harness's proxy,
		which is worth saying because it is the state a real student sees too:
		the document names no webfont and never has.
	*/
	/*
		THE 403 IS THE MEASUREMENT, NOT A DEFECT, AND THE CONSOLE LINE IS THE
		BROWSER RESTATING IT.

		Chromium logs "Failed to load resource: the server responded with a
		status of 403" for the DOCUMENT's own navigation, so a route whose
		correct answer is 403 reports one console error per width no matter how
		well it works. The status is already measured, and printed, on this
		spec's own header line -- `HTTP 403` -- so the console row was a second,
		weaker reading of the same fact.

		THE PATTERN IS NARROW ON PURPOSE. It names the status AND this route's
		own path, so a genuine console error from anything else on the page
		still reddens; a bare `/403/` would have silenced any future 403 from a
		subresource, which on a document served under `default-src 'none'` is
		exactly the kind of thing worth hearing about.
	*/
	ignoreConsole: [/status of 403.*\/dev\/foundry-admin\/refusal/],
	presence: [
		{ selector: 'main h1', label: 'the refusal owns a heading', expectPresent: 1, maxPresent: 1 },
		{ selector: 'main p', label: 'the reason and what it leaves alone', expectPresent: 2, maxPresent: 2 },
		/* NOT A BLANK BODY, asserted as an exclusion with its own positive
		   control above: two paragraphs present, and no empty document. And
		   NOTHING INTERACTIVE -- there is no control to offer, because the
		   answer is "ask the class that closed it", so a button here would
		   have to lead somewhere and there is nowhere. */
		{ selector: 'button, input, form', label: 'no control it cannot honour', expectPresent: 0, maxPresent: 0 },
		{ selector: 'script', label: 'no script in a document served under default-src none', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{
			selector: 'main',
			label: 'it names both classes, in the words the panel uses',
			/* THE SAME SENTENCE FROM THE SAME SOURCE. `foundryClosedSentence`
			   builds the class list and `FOUNDRY_CLOSURE_LIMIT` says what a
			   close leaves alone; `/dev/foundry-admin` asserts both strings on
			   the component that renders them, so a change that told a student
			   one thing on the panel and another on this page reddens on one of
			   the two specs. */
			must: [
				'Engineering I Honors (Block 3)',
				'Engineering Design and Development (Block 6)',
				'their own apps',
				'publishing'
			],
			/* NO TEACHER ADDRESS: 0173 projects the course title and the label
			   and nothing else. AND NO WORKAROUND: the share-link limit is the
			   instructor's to read on a surface behind
			   `classroom_manages_section`, never the closed student's, so
			   naming it here would be handing them the way around it in our own
			   words. Both are exclusions with the four positive controls above
			   them on the same reading. */
			mustNot: ['@', 'share link', 'without signing in']
		}
	],
	contrast: [
		{ selector: 'main h1', label: 'refusal heading', min: 4.5 },
		{ selector: 'main p:not(.next)', label: 'the reason, naming the classes', min: 4.5 },
		/* THE SECOND PARAGRAPH IS DELIBERATELY QUIETER AND STILL HAS TO CLEAR
		   4.5. It is real muted copy, not decoration: it is the only thing on
		   the page telling a student their own work is still reachable. */
		{ selector: 'main p.next', label: 'what a close leaves alone', min: 4.5 }
	]
};
