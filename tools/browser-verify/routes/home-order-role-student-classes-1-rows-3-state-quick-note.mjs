import { SETTLE_ENTRANCE } from './_shared.mjs';

/**
 * THE QUICK NOTE ON THE PORTAL HOME (ledger 0298), in the REAL home page's
 * header, beside the profile menu and in that header's own control style.
 *
 * WHAT IS MEASURED: the control is there, 44px, carrying its word, answering a
 * tap at its own centre; the header does not scroll sideways at 375 and its
 * height is printed (the home header's own rule is that a new child must not
 * push the actions onto another row); the panel opens inside the viewport.
 * Nothing is typed: this harness hands the dock the real transports, which have
 * no session here -- the write itself is `/dev/quick-note`'s to prove.
 *
 * AT 375 AND 1440. From 521 to 899px the home header has no room for the
 * control and it is deliberately not drawn (QuickNote's own stylesheet has the
 * measurement); run at a width in that band, this spec's presence rows report
 * the absence and its height row reports the header unchanged, which is the
 * claim there.
 */
export default {
	path: '/dev/home-order?role=student&classes=1&rows=3&state=quick-note',
	label: 'Quick note on the home page header: present, 44px, in the header\'s own style, opening inside the viewport',
	prepare: [
		{ evaluate: SETTLE_ENTRANCE },
		{ waitFor: '() => !!document.querySelector("header [data-testid=\\"qn-trigger\\"]") && !!document.querySelector("header .pm-trigger")', timeoutMs: 20000 },
		/* THE HARNESS STRIP IS NOT THE PAGE. It is `position: fixed` at the top of
		   /dev/home-order and wraps to several lines at 375, over the header's
		   controls, so a tap at the Note control's centre lands on the strip.
		   Production has no strip; it is taken away before anything is pressed. */
		{ evaluate: `() => { const s = document.querySelector('.harness-strip'); if (s) s.style.display = 'none'; return s ? 'harness strip hidden' : 'no harness strip'; }` },
		/* THE HEADER'S HEIGHT WITH AND WITHOUT THE NOTE CONTROL, on the same page:
		   the home header's own rule is that a new child must not grow it. */
		{
			evaluate: `async () => {
				const h = () => Math.round(document.querySelector('.legacy-index header').getBoundingClientRect().height * 10) / 10;
				const withNote = h();
				const tag = document.createElement('style');
				tag.textContent = '.legacy-index header .qn { display: none !important; }';
				document.head.appendChild(tag);
				await new Promise((r) => setTimeout(r, 50));
				const without = h();
				tag.remove();
				await new Promise((r) => setTimeout(r, 50));
				window.__qnHomeHeight = [withNote === without ? 'the header is the same height with the Note control' : 'HEADER ' + without + ' -> ' + withNote];
				return 'header ' + withNote + 'px with the Note control, ' + without + 'px without';
			}`
		},
		{
			click: 'header [data-testid="qn-trigger"]',
			until: '() => { const p = document.querySelector("[data-testid=\\"qn-panel\\"]"); return !!p && !p.hidden; }',
			attempts: 12,
			waitMs: 250
		}
	],
	presence: [
		{ selector: 'header [data-testid="qn-trigger"]', label: 'the Note control in the home header', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="qn-panel"]', label: 'its panel, open', expectPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: 'header [data-testid="qn-trigger"]', label: 'the control carries its word', must: ['Note'] }],
	/* A REACH, NOT A BOX, at 375: there the control paints 34px so the header's
	   first row does not grow, and reaches 44 the way the profile menu beside it
	   does. The reach check measures the hit area itself and hit-tests it. */
	tapReach: [{ selector: 'header [data-testid="qn-trigger"]', label: 'the Note control\'s hit area', min: 44 }],
	contrast: [
		{ selector: 'header [data-testid="qn-trigger"] .qn-word', label: 'the word Note', min: 4.5 },
		{ selector: '[data-testid="qn-where"]', label: 'where the note will be saved', min: 4.5 }
	],
	orderResult: [
		{ label: 'the Note control does not grow the home header', evaluate: '() => window.__qnHomeHeight', expected: ['the header is the same height with the Note control'] },
		{
			label: 'Note sits on the profile menu\'s row, answers at its centre, and its panel opened inside the viewport',
			evaluate: `() => {
				const t = document.querySelector('header [data-testid="qn-trigger"]');
				const r = t.getBoundingClientRect();
				const p = document.querySelector('header .pm-trigger').getBoundingClientRect();
				const panel = document.querySelector('[data-testid="qn-panel"]').getBoundingClientRect();
				const sameRow = Math.abs((r.top + r.bottom) / 2 - (p.top + p.bottom) / 2) < 12;
				const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
				return [
					sameRow ? 'on the profile menu row' : 'ANOTHER ROW',
					hit && t.contains(hit) ? 'answers at its centre' : 'COVERED',
					panel.left >= 0 && panel.right <= window.innerWidth + 0.5 && panel.top >= 0 ? 'panel inside the viewport' : 'PANEL OFF SCREEN ' + Math.round(panel.left) + ',' + Math.round(panel.top) + '..' + Math.round(panel.right)
				];
			}`,
			expected: ['on the profile menu row', 'answers at its centre', 'panel inside the viewport']
		}
	]
};
