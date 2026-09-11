/**
 * THE HAPPY-PATH DOCUMENT, IN A REAL BROWSER, THROUGH THE REAL `/hx/` ROUTE.
 *
 * WHY THIS EXISTS BESIDE `html-assignment.mjs` RATHER THAN INSIDE IT. That spec
 * drives the HOSTILE document: every row it asserts is a refusal, and its own
 * positive control is a synthetic message the PAGE constructs. Both are the
 * right measurements for a containment claim and neither of them is the claim a
 * ported worksheet actually rests on, which is that a perfectly ordinary
 * document -- one that attempts nothing, and is the shape a teacher uploads --
 * renders inside the frame and can talk to the parent.
 *
 * `?doc=worksheet` is that document: three block types, three real inputs, and
 * the same bridge client the probe uses. Nothing here is a copy of anything --
 * the same `/hx/` handler serves it, under the same CSP, into the same
 * `HtmlAssignmentFrame` with the same sandbox attribute.
 *
 * WHAT IT PROVES THAT NOTHING ELSE IN THE REPOSITORY CAN.
 *
 *   The document RENDERED. `height>0` is a number the document measured of its
 *   own body and posted up; a frame that 404'd, that was refused by the host
 *   gate, or whose script the CSP killed reports nothing and this row reads
 *   `height>0=false`. Every database test in this bundle would pass in all
 *   three of those states.
 *
 *   The bridge CARRIES, in both directions and on a document that is not the
 *   probe. `ready=3` is the schema handshake travelling frame to parent; the
 *   synthetic positive control is a well-formed `idea:change` naming this
 *   document's OWN first field (`teamName`, from the manifest the parent read),
 *   accepted while three forgeries are dropped.
 *
 *   The containment did not have to be relaxed to get any of that. `sandbox`
 *   is still `allow-scripts` alone and the document's origin is still opaque,
 *   which is what makes this a second reading of the boundary rather than a
 *   softer one.
 *
 * WHAT IT DELIBERATELY DOES NOT ASSERT: that typing into the document saves an
 * answer. Nothing on this page holds a Supabase client -- it is dev-only, with
 * no auth and no database -- and the write path is proven where it can be
 * proven, against a real Postgres with the real migration chain in
 * `tests/db/html-assignment-round-trip.test.ts`. A browser row claiming a save
 * here would be claiming coverage of a function this page cannot call.
 */
export default {
	path: '/dev/html-assignment?doc=worksheet',
	label: 'HTML assignment: the ordinary worksheet renders and the bridge carries',

	prepare: [
		/*
			WAIT ON THE HANDSHAKE, NOT ON A TIMER. This document posts no probes,
			so `readySchema` and the height it reports are the last things that
			arrive; a fixed delay would either measure an empty panel as a pass or
			cost seconds on every run.
		*/
		{
			waitFor: `() => (window.__hx?.readySchema ?? 0) === 3 && (window.__hx?.reportedHeight ?? 0) > 0`,
			attempts: 40,
			gapMs: 250
		},
		{
			click: '[data-drive="synthetic"]',
			until: `() => (window.__hx?.synthetic ?? []).length >= 5`,
			attempts: 12,
			gapMs: 250
		}
	],

	orderResult: [
		{
			label: 'the worksheet loaded from the real route, announced itself, and reported a height',
			evaluate: `() => {
				const hx = window.__hx ?? {};
				return [
					'ready=' + hx.readySchema,
					'height>0=' + (hx.reportedHeight > 0),
					'src=' + String(hx.src ?? '').replace(/^https?:\\/\\/[^/]+/, ''),
					'frames=' + document.querySelectorAll('iframe[data-hx-frame]').length,
					'listening=' + (document.querySelector('[data-hx-listening]')?.getAttribute('data-hx-listening') ?? 'absent')
				];
			}`,
			expected: [
				'ready=3',
				'height>0=true',
				/* THE ROUTE, NAMED. A harness that had quietly fallen back to a
				   `srcdoc` or to a different document would still report a height. */
				'src=/hx/worksheet',
				'frames=1',
				'listening=yes'
			]
		},
		{
			label: 'the containment is the same on an ordinary document as on the hostile one',
			evaluate: `() => {
				const hx = window.__hx ?? {};
				return [
					'sandbox=' + hx.sandboxFlags,
					'expectedOrigin=' + hx.expectedOrigin,
					'probesAttempted=' + (hx.probes ?? []).length,
					'reached=' + hx.reachedCount
				];
			}`,
			expected: [
				/* If a change ever adds `allow-same-origin`, this reddens on the
				   ordinary document too, not only on the probe. */
				'sandbox=allow-scripts allow-popups allow-popups-to-escape-sandbox',
				/* `"null"`: an opaque origin serializes to that string through
				   postMessage, which is what the parent compares against. */
				'expectedOrigin=null',
				/* AN HONEST ABSENCE, and it is only readable because the rows above
				   are positive: this document attempts nothing, so zero probes is
				   the correct answer rather than the answer a dead frame gives. */
				'probesAttempted=0',
				'reached=0'
			]
		},
		{
			label: 'a forged message is dropped and a well-formed one naming the worksheet field is not',
			/*
				THE SAME PROVENANCE ROW THE PROBE SPEC CARRIES, over a DIFFERENT
				field: `fireSynthetic` takes the first key of the field map the
				SERVER built from this document's manifest, which for the worksheet
				is `teamName`. So this is not a second copy of that measurement --
				it is the same rule put to the other document's vocabulary, and it
				would redden if the field map for a real worksheet ever came back
				empty (the accepted control would then name a field no block
				declares and be dropped as `field`).
			*/
			evaluate: `() => (window.__hx?.synthetic ?? [])`,
			expected: [
				'wrong origin, right source:DROPPED',
				'right origin, no source:DROPPED',
				'right origin, wrong source (this window):DROPPED',
				'POSITIVE CONTROL: right origin, right source:ACCEPTED',
				'net accepted by the four:1'
			]
		}
	],

	presence: [
		{ selector: 'iframe[data-hx-frame]', label: 'the sandboxed frame', expectPresent: 1, maxPresent: 1 },
		/* This document attempts no escapes, so the probe panel is EMPTY. Paired
		   with the accepted row below, which is what stops an empty page passing. */
		{ selector: '[data-probe-result]', label: 'probe rows (none: this document attempts nothing)', expectPresent: 0 },
		{ selector: '[data-testid="containment"]', label: 'the containment verdict, in words', expectPresent: 1, maxPresent: 1 }
	],

	textContains: [
		{
			selector: '[data-testid="sandbox"]',
			label: 'the sandbox attribute on screen',
			must: ['allow-scripts'],
			mustNot: ['allow-same-origin']
		},
		{
			selector: '[data-testid="src"]',
			label: 'the frame is pointed at the real /hx/ route',
			must: ['/hx/worksheet'],
			mustNot: ['srcdoc', 'data:']
		}
	],

	contrast: [
		{ selector: '[data-testid="containment"]', label: 'the containment verdict', min: 4.5 }
	],

	tapTargets: [
		{ selector: '.h-buttons .btn', label: 'the synthetic-message control', min: 44 }
	]
};
