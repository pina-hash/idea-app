/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * THE "ABOVE THE TEXT" RENDER PATH (prompt 0118, item FIVE / 0193), on the
 * REAL ItemDetail.
 *
 * An author can put the Links card and the Files card above the writing.
 * ItemDetail renders the SAME two snippets, carrying the same `data-testid`s,
 * in one of two positions -- after the deck and the check-ins and before the
 * body, or below the body as every pre-0193 item renders -- and the only thing
 * that tells the two apart is where the card sits in the document. Every other
 * spec and test of this surface renders the default, so until this file the
 * `top` branch had been measured in no direction at all.
 *
 * `?placement=top` attaches `{ files: 'top', links: 'top' }` to the fixture.
 * The rows below assert the `data-placement="top"` cards present and the
 * `bottom` ones absent, and the evaluate reads DOCUMENT ORDER: check-ins card,
 * then Links, then Files, then the body disclosure. The default state is the
 * control and is measured on the base spec (`...-open-1`): there the `bottom`
 * cards are present, the `top` ones absent, and both sit after the body.
 */
export default {
	path: '/dev/classroom-inspector?case=assignment&placement=top',
	label: 'Item page: links and files placed ABOVE the text render after the check-in and before the body',
	presence: [
		{ selector: '[data-testid="item-links-card"][data-placement="top"]', label: 'Links card, placed above', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="item-files-card"][data-placement="top"]', label: 'Files card, placed above', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="item-links-card"][data-placement="bottom"]', label: 'Links card below, ABSENT in this state', expectPresent: 0 },
		{ selector: '[data-testid="item-files-card"][data-placement="bottom"]', label: 'Files card below, ABSENT in this state', expectPresent: 0 },
		/* Positive controls: the neighbours the order is read against. */
		{ selector: '[data-testid="item-check-ins"]', label: 'the check-in card', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="item-body-disclosure"]', label: 'the body disclosure', expectPresent: 1, maxPresent: 1 }
	],
	orderResult: [
		{
			label: 'document order: check-ins, Links, Files, body',
			evaluate: `() => {
				const q = (s) => document.querySelector(s);
				const nodes = [
					['check-ins', q('[data-testid="item-check-ins"]')],
					['links', q('[data-testid="item-links-card"]')],
					['files', q('[data-testid="item-files-card"]')],
					['body', q('[data-testid="item-body-disclosure"]')]
				];
				if (nodes.some(([, n]) => !n)) return ['missing ' + nodes.filter(([, n]) => !n).map(([k]) => k).join(',')];
				const ok = nodes.every(([, n], i) => i === 0 || (nodes[i - 1][1].compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
				return [ok ? 'check-ins < links < files < body' : 'out of order'];
			}`,
			expected: ['check-ins < links < files < body']
		}
	],
	/* The fixture's two student files and its instructor-only attachment
	   resolve through `/api/classroom/attachment/<id>`, a real server route
	   needing a session this placeholder-.env dev server cannot provide; and
	   the harness blocks every non-loopback request. Instrument and fixture,
	   not this surface. */
	ignoreConsole: [
		'Failed to load resource: the server responded with a status of 401',
		'Failed to load resource: net::ERR_FAILED'
	]
};
