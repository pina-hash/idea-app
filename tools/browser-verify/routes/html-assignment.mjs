/**
 * THE HTML-ASSIGNMENT BOUNDARY, MEASURED IN A REAL BROWSER, WHICH IS THE ONLY
 * PLACE IT CAN BE MEASURED AT ALL.
 *
 * WHAT IS BEING PROVEN. A ported HTML assignment runs inside
 * `<iframe sandbox="allow-scripts">` -- no `allow-same-origin` -- which puts it
 * in a unique opaque origin. That claim is about a BROWSER: there is no
 * sandbox, no opaque origin and no `SecurityError` anywhere else in this
 * repository's verification, so a unit test asserting "the frame cannot read
 * the parent" would be asserting something no code under test enforces. The
 * only honest instrument is a hostile document, served by the real route,
 * inside the real frame, attacking the real boundary -- and that is what
 * `/dev/html-assignment` mounts.
 *
 * THE DOCUMENT ATTACKS FIVE WAYS and reports each outcome back up the ORDINARY
 * bridge, as an `idea:change` on a field its manifest declares. So a probe
 * result arriving at all is itself evidence the bridge works, and the outcome
 * words are the measurement:
 *
 *   hx-probe.parent    window.parent.document.title
 *   hx-probe.cookie    document.cookie
 *   hx-probe.storage   localStorage.getItem('hx-parent-sentinel')
 *   hx-probe.topnav    window.top.location.href = 'https://example.com/'
 *   hx-probe.fetch     fetch('/hx-exfiltration-target', {method:'POST'})
 *
 * plus two rows that report a fact rather than attempt an escape:
 *   hx-probe.origin    the document's own origin -- OPAQUE is the answer that
 *                      means the sandbox held
 *   hx-probe.csp       which CSP directive actually fired
 *
 * THE STORAGE PROBE IS THE SHARPEST OF THEM, and deliberately so. The harness
 * writes `hx-parent-sentinel = 'PARENT-SECRET'` into the PORTAL ORIGIN's
 * `localStorage` before the frame is mounted, so a leak does not read "storage
 * was available in there" -- it reads `REACHED: read PARENT-SECRET`, in words,
 * on the page. That is what makes the weakening demonstration unambiguous
 * rather than inferential.
 *
 * MEASURED, AND THEN MEASURED AGAIN WITH THE BOUNDARY BROKEN. Every row below
 * was put to a weakened tree and reddens:
 *
 *   allow-same-origin added to the sandbox flags
 *     parent   REFUSED: SecurityError  ->  REACHED: HTML assignment boundary harness
 *     cookie   REFUSED: SecurityError  ->  REACHED: cookie=
 *     storage  REFUSED: SecurityError  ->  REACHED: read PARENT-SECRET
 *     origin   OPAQUE: origin is null  ->  NAMED: http://127.0.0.1:5199
 *     verdict  0 reached               ->  3 reached
 *
 *   connect-src 'none' opened to connect-src *
 *     csp      ENFORCED: connect-src   ->  NOT ENFORCED: no violation fired
 *     fetch    unchanged, and that is the finding -- see the note on the csp row
 *
 *   the field-to-block map bypassed
 *     dropped reasons lose both `field` entries and a forged write appears
 *
 * The full numbers, and the restore-to-md5-identical, are in this lane's
 * history entry.
 *
 * WHY THE ROWS ARE `orderResult` RATHER THAN `textContent` READS. Every claim
 * here is about a value the PAGE computed from messages that arrived, not about
 * what painted -- and several of them ("nothing reached out", "these five
 * refusals happened in this order") are absence claims a DOM read cannot settle.
 * `window.__hx` is a plain snapshot of exactly what the panels render, so the
 * probe is not a second idea of the state.
 */
export default {
	path: '/dev/html-assignment',
	label: 'HTML assignment boundary: a hostile document, contained',

	/*
		WAIT ON THE PROBES LANDING, NOT ON A TIMER. The frame is fetched over
		HTTP, runs, and posts seven messages; a fixed delay would either be too
		short (and measure an empty panel as a pass) or needlessly long. The
		predicate names the LAST thing to arrive -- the fetch probe answers
		asynchronously, and the CSP row is written from its violation event -- so
		it cannot hold before every earlier probe has.
	*/
	prepare: [
		{
			waitFor: `() => (window.__hx?.probes ?? []).length >= 7`,
			attempts: 40,
			gapMs: 250
		},
		/*
			THE SYNTHETIC MESSAGES. A real frame cannot post from an origin it is
			not on, so the origin half of the provenance rule needs an event the
			page constructs. Four cases, and the fourth is the POSITIVE CONTROL --
			without it, three refusals would pass just as well on a parent that had
			stopped listening entirely.
		*/
		{
			click: '[data-drive="synthetic"]',
			until: `() => (window.__hx?.synthetic ?? []).length >= 5`,
			attempts: 12,
			gapMs: 250
		}
	],

	orderResult: [
		{
			label: 'the five escape attempts, each refused, and the origin opaque',
			evaluate: `() => {
				const hx = window.__hx ?? {};
				const at = (id) => {
					const row = (hx.probes ?? []).find((p) => p.startsWith(id + '='));
					return row ? id + '=' + row.slice(id.length + 1).split(':')[0] : id + '=MISSING';
				};
				return [
					at('hx-probe.parent'),
					at('hx-probe.cookie'),
					at('hx-probe.storage'),
					at('hx-probe.topnav'),
					at('hx-probe.fetch'),
					at('hx-probe.origin'),
					at('hx-probe.csp'),
					'reached=' + hx.reachedCount
				];
			}`,
			expected: [
				'hx-probe.parent=REFUSED',
				'hx-probe.cookie=REFUSED',
				'hx-probe.storage=REFUSED',
				/*
					MEASURED: Chrome THROWS on this one. The document ALSO records an
					ATTEMPTED branch for an engine that blocks without raising --
					Chrome logs "Unsafe attempt to initiate navigation", which is what
					that looks like -- and the harness settles that case from outside,
					by asserting it is still on its own URL. Here the throw is what
					happens, so this row pins the throw.
				*/
				'hx-probe.topnav=REFUSED',
				/*
					REFUSED TWICE OVER, which is why the row beside it exists. The
					fetch is blocked by `connect-src 'none'` AND, independently, by the
					opaque origin making every request cross-origin with no CORS header
					on the response. Measured: opening `connect-src` to `*` did not
					move this row at all. An outcome that cannot move is not a control
					for that directive, and claiming it as one would have reported
					coverage of `connect-src` that nothing had.
				*/
				'hx-probe.fetch=REFUSED',
				/*
					OPAQUE, NOT REACHED. Reading your own origin is not an escape; an
					earlier draft ran this through the same REACHED/REFUSED helper as
					the four that are, and the row read "REACHED: origin=null" -- the
					strongest evidence of containment there is, filed under the word
					for its opposite.
				*/
				'hx-probe.origin=OPAQUE',
				/*
					THE CONTROL THAT IS SENSITIVE TO THE CSP LEVER. The document
					listens for its own `securitypolicyviolation` events and reports
					which `effectiveDirective` fired, so the policy doing the refusing
					is distinguishable from the origin doing it. Measured: opening
					`connect-src` moves this row to "NOT ENFORCED: no violation fired".
				*/
				'hx-probe.csp=ENFORCED',
				'reached=0'
			]
		},
		{
			label: 'the document announced itself, was heard, and reported a height',
			/*
				THE POSITIVE CONTROL FOR THE WHOLE LANE. Every row above is an
				absence claim, and a frame that never loaded would satisfy all of
				them. This is what separates "contained" from "nothing happened":
				the bridge completed a full round trip through the real route.

				`ready=3` is the schema handshake. `height>0` is a value the document
				measured and the parent applied. `stateApplied` is the PARENT->FRAME
				direction, read off the frame's own DOM -- which is legible from out
				here only because the document is same-origin with the harness in
				dev, and is therefore the one row that would need rewriting if this
				harness ever ran against a real split origin.
			*/
			evaluate: `() => {
				const hx = window.__hx ?? {};
				return [
					'ready=' + hx.readySchema,
					'height>0=' + (hx.reportedHeight > 0),
					'sandbox=' + hx.sandboxFlags,
					'expectedOrigin=' + hx.expectedOrigin,
					'listening=' + (document.querySelector('[data-hx-listening]')?.getAttribute('data-hx-listening') ?? 'absent'),
					'frames=' + document.querySelectorAll('iframe[data-hx-frame]').length
				];
			}`,
			expected: [
				'ready=3',
				'height>0=true',
				/*
					THE ONE STRING THIS WHOLE LANE RESTS ON. If a change ever adds
					`allow-same-origin` here, this row reddens before any containment
					probe does -- and it reddens with the reason written out.

					THE TWO POPUP FLAGS ARE A DELIBERATE WIDENING (0153, Mr. Pina's
					decision of 2026-09-11), so a document can open a link in a new
					tab -- IDEA100 Blade CAD 01's Open slides button. Measured, and
					the numbers are in the standard's security section: the opened tab
					is a separate context at its own origin that cannot read the
					opener, the opener's parent or the opener's top, and cannot
					navigate either of them. The row pins the WHOLE set, so dropping
					the escape flag reddens here too -- `allow-popups` alone opens a
					tab that inherits this sandbox, at an opaque origin, which is a tab
					Slides cannot run in.
				*/
				'sandbox=allow-scripts allow-popups allow-popups-to-escape-sandbox',
				/*
					`"null"`, NOT THE DOCUMENT ORIGIN, AND THAT IS MEASURED. The
					sandbox makes the document's origin opaque and `postMessage`
					serializes an opaque origin to the string "null", so a parent
					comparing against `https://sandbox.ideabosco.com` would drop every
					real message and the feature would be silently inert. This row is
					what stops that "fix".
				*/
				'expectedOrigin=null',
				'listening=yes',
				'frames=1'
			]
		},
		{
			label: 'the frame is as tall inside as the height it was told',
			/*
				THE 2px THE BORDER USED TO EAT. `box-sizing: border-box` is global,
				so a border on the `<iframe>` made the applied height an OUTER height
				and left the content box 2px short of what the document had just
				reported -- which a document long enough to fill its box answers with
				a full-length inner scrollbar over a 2px overflow. The border lives on
				`.hx-frame-box` now and the frame carries none, so the applied height
				IS the content height.

				MEASURED RATHER THAN ASSERTED AS A PASS: the row reports the three
				numbers. `delta=0` is the property; `border=0px` is the mechanism, and
				pinning it too is what tells a later reader WHICH of the two drifted.
				The box is 2px taller than the frame, which is the border being
				somewhere -- a box equal to the frame would mean the edge had been
				dropped rather than moved.
			*/
			evaluate: `() => {
				const f = document.querySelector('iframe[data-hx-frame]');
				if (!f) return ['frame=absent'];
				const box = f.closest('.hx-frame-box');
				const applied = Math.round(parseFloat(f.style.height || '0'));
				return [
					'applied>0=' + (applied > 0),
					'delta=' + (f.clientHeight - applied),
					'border=' + getComputedStyle(f).borderTopWidth,
					'box-minus-frame=' + Math.round(box.getBoundingClientRect().height - f.getBoundingClientRect().height)
				];
			}`,
			expected: ['applied>0=true', 'delta=0', 'border=0px', 'box-minus-frame=2']
		},
		{
			label: 'the malformed messages the document sent all got nowhere',
			/*
				FIVE REFUSALS, BY REASON, IN THE ORDER THE DOCUMENT SENT THEM. The two
				`field` entries are the heart of it: the first is a message naming a
				BLOCK ID in the field slot, the second a field no block declares. The
				`shape` entry ahead of them is the message that named `block_id`
				directly and carried no `field` at all -- there is no branch that
				reads one, so it is refused for being shapeless rather than for being
				recognised, which is the mechanism being absence rather than a check.
			*/
			evaluate: `() => (window.__hx?.droppedReasons ?? [])`,
			expected: ['shape', 'field', 'field', 'height', 'schema', 'origin', 'source', 'source']
		},
		{
			label: 'a forged message is dropped and a well-formed one is not',
			/*
				THE PROVENANCE HALF, AND THE POSITIVE CONTROL IS THE POINT. Three
				forged events are refused and the fourth -- right origin, right source
				-- is accepted, so a parent that had simply stopped listening cannot
				pass this row. `net accepted by the four` being exactly 1 is what says
				the accept came from the control and not from one of the forgeries.
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
		/* The frame is REAL and there is exactly one of it. A second frame would
		   mean a remount, which restarts a student's document. */
		{ selector: 'iframe[data-hx-frame]', label: 'the sandboxed frame', expectPresent: 1, maxPresent: 1 },
		/* Seven probe rows on screen, matching the seven in the snapshot: the
		   `orderResult` rows read `window.__hx`, and this is what says the page
		   actually rendered what the snapshot holds. */
		{ selector: '[data-probe-result]', label: 'rendered probe rows', expectPresent: 8, maxPresent: 8 },
		{ selector: '[data-testid="containment"]', label: 'the containment verdict, in words', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-dropped]', label: 'rendered drop rows', expectPresent: 8, maxPresent: 8 }
	],

	textContains: [
		{
			selector: '[data-testid="containment"]',
			label: 'the verdict says nothing escaped, in words rather than by a colour',
			must: ['Nothing escaped'],
			mustNot: ['THE BOUNDARY LEAKED']
		},
		{
			selector: '[data-testid="sandbox"]',
			label: 'the sandbox attribute on screen',
			must: ['allow-scripts', 'allow-popups-to-escape-sandbox'],
			/* Colour is never the only signal and neither is a passing check: the
			   one forbidden flag is named here so a reader of the page sees it too.
			   `allow-same-origin` is a SUBSTRING of nothing else in the set, so this
			   stays a real refusal after the popup flags joined it. */
			mustNot: ['allow-same-origin']
		},
		{
			selector: '[data-testid="topnav"]',
			label: 'top navigation was refused',
			must: ['REFUSED'],
			mustNot: ['THE FRAME NAVIGATED']
		}
	],

	contrast: [
		{ selector: '[data-testid="containment"]', label: 'the containment verdict', min: 4.5 },
		{ selector: '.harness .results li', label: 'a probe result line', min: 4.5 }
	],

	tapTargets: [
		{ selector: '.h-buttons .btn', label: 'the synthetic-message control', min: 44 }
	],

	/*
		THE FRAME'S OWN REFUSALS ARRIVE AS CONSOLE ERRORS AND THEY ARE THE POINT.
		Chrome logs the CSP `connect-src` refusal and the blocked top-level
		navigation, both from inside the sandboxed document. Ignoring them is not
		hiding a fault: they are the boundary working, and the rows above assert
		the same facts positively. Anything else in the console is still a finding.
	*/
	ignoreConsole: [
		'Refused to connect to .*hx-exfiltration-target',
		'Fetch API cannot load .*hx-exfiltration-target',
		'Unsafe attempt to initiate navigation'
	]
};
