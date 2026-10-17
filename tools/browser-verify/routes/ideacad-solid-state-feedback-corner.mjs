/**
 * THE FEEDBACK BUTTON IN THE DIRECT MODELER, IN THE CORNER IT HAS ON EVERY
 * OTHER PAGE (ledger 0396, review round 4). A different STATE of
 * `/dev/ideacad-solid` (`aliasOf`): a two-feature part, so the history slider
 * row stands between the work area and the footer as well as the tool strip.
 *
 * Mr. Pina's decision is that the window's button sits in the same place on
 * every page but VANGUARD and GREENLINE. The workspace used to pull it into its
 * 48px footer, 2px off the edge, and on a phone hid its word, which left it a
 * glyph with no accessible name over the tool strip's More tools and Move
 * keys. Now the button keeps its corner and its word, and the footer grows to
 * as far up the window as the button reaches, so nothing in the workspace is
 * under it at any width. The probe reads each of those facts off the page and
 * says how many workspace controls it examined, so a sweep that found nothing
 * cannot read as a pass.
 */
export default {
	path: '/dev/ideacad-solid?state=feedback-corner',
	aliasOf: '/dev/ideacad-solid',
	label: 'IdeaCAD: the feedback button in the page corner with its word, and nothing in the workspace under it',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy' },
		{
			evaluate: `async () => {
				const s = window.ideaCadSolid;
				const wait = async () => { for (let i = 0; i < 400 && s.busy; i++) await new Promise((r) => setTimeout(r, 25)); };
				await wait();
				if (s.model.features.length) return 'already built';
				const rect = (x0, y0, w, h) => [{ id: 'p0', type: 'point', x: x0, y: y0 }, { id: 'p1', type: 'point', x: x0 + w, y: y0 }, { id: 'p2', type: 'point', x: x0 + w, y: y0 + h }, { id: 'p3', type: 'point', x: x0, y: y0 + h }, { id: 'l0', type: 'line', a: 'p0', b: 'p1' }, { id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p0' }];
				await s.apply({ type: 'add-feature', feature: { id: 'sk1', name: 'Base sketch', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: rect(-2, -1.5, 4, 3), constraints: [] } }, 'Draw sketch'); await wait();
				await s.apply({ type: 'add-feature', feature: { id: 'ex1', name: 'Plate', type: 'extrude', sketch: 'sk1', distance: 0.5, operation: 'new' } }, 'Extrude'); await wait();
				return s.model.features.length + ' features';
			}`,
			until: '() => window.ideaCadSolid && window.ideaCadSolid.model.features.length === 2 && !window.ideaCadSolid.busy && !!document.querySelector(\'[data-testid="ideacad-history-slider"]\')',
			attempts: 3,
			gapMs: 500,
			waitMs: 600
		},
		{
			waitFor: '() => { const t = document.querySelector(".sfb-shell .sfb-trigger"); return !!t && t.getBoundingClientRect().height > 0; }',
			timeoutMs: 20000,
			label: 'the corner feedback button has painted'
		}
	],
	presence: [
		{ selector: '.sfb-shell .sfb-trigger', label: 'the feedback button, floating in the page corner', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.sfb-shell .sfb-word', label: 'its word, drawn at every width (never glyph-only)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.solid-workspace .sfb-trigger', label: 'none inside the workspace (the corner button above is the positive control)', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-history-slider"]', label: 'the history slider row, the row nearest the footer', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: '.sfb-shell .sfb-trigger', label: 'the button carries its word, not only its glyph', must: ['Send feedback'] }],
	contrast: [{ selector: '.sfb-shell .sfb-word', label: 'the button word', min: 4.5 }],
	tapTargets: [{ selector: '.sfb-shell .sfb-trigger', label: 'the feedback button', min: 44 }],
	orderResult: [
		{
			label: 'the button hit-tests to itself, carries its word, sits in the home page corner, the footer holds it, and no workspace control is under it',
			evaluate: `() => {
				const t = document.querySelector('.sfb-shell .sfb-trigger');
				if (!t) return ['NO FEEDBACK BUTTON'];
				const r = t.getBoundingClientRect();
				const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
				const w = t.querySelector('.sfb-word').getBoundingClientRect();
				const worded = w.width > 0 && w.left >= r.left - 0.5 && w.right <= r.right + 0.5 && (t.textContent || '').trim().length > 0;
				const phone = window.innerWidth <= 480;
				const right = Math.round(window.innerWidth - r.right);
				const bottom = Math.round(window.innerHeight - r.bottom);
				const corner = phone ? right === 16 && bottom === 24 : right === 12 && bottom === 12;
				const foot = document.querySelector('.solid-workspace footer').getBoundingClientRect();
				const held = foot.top <= r.top - 4;
				const vis = (el) => { const b = el.getBoundingClientRect(); if (b.width < 1 || b.height < 1) return false; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
				const controls = [...document.querySelectorAll('.solid-workspace :is(button, a[href], input, select, textarea, canvas)')].filter(vis);
				const under = controls.filter((c) => {
					const b = c.getBoundingClientRect();
					return Math.min(b.right, r.right) - Math.max(b.left, r.left) > 0.5 && Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top) > 0.5;
				}).map((c) => (c.getAttribute('aria-label') || c.textContent || c.tagName).trim().slice(0, 24));
				return [
					hit && t.contains(hit) ? 'feedback answers at its centre' : 'COVERED at its centre',
					worded ? 'the word is drawn inside the control' : 'NO WORD (glyph only, no accessible name)',
					corner ? 'in the corner' : 'NOT IN THE CORNER (right ' + right + ', bottom ' + bottom + ')',
					held ? 'the footer holds the button' : 'THE BUTTON RISES ABOVE THE FOOTER (' + Math.round(foot.top - r.top) + 'px)',
					controls.length >= 10 && under.length === 0 ? 'no workspace control under the button' : 'UNDER THE BUTTON: ' + (under.join(', ') || 'examined only ' + controls.length)
				];
			}`,
			expected: [
				'feedback answers at its centre',
				'the word is drawn inside the control',
				'in the corner',
				'the footer holds the button',
				'no workspace control under the button'
			]
		}
	]
};
