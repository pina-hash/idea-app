/**
 * THE REPORT BOX IN A ROOM'S OWN COLOURS (report 35, 2026-09-25) -- the steps
 * and the probe every `*-report-room` spec shares.
 *
 * The report control and its box are mounted once in the ROOT layout, a
 * sibling of every room's wrapper, so a room can only reach them through the
 * `--fb-room-*` hooks it declares on `body:has(.<room>)` (see the scrim block
 * in `src/lib/feedback/SiteFeedback.svelte`). These specs open the REAL box
 * from the REAL floating control on a harness that mounts the REAL room, and
 * measure what the hooks produced.
 *
 * WHY A PROBE AS WELL AS `contrast` ROWS. The box paints a GRADIENT (its plate
 * at the top, its deep plate at the bottom) and the `contrast` check flags a
 * background-image rather than reading through it, and it measures TEXT only
 * -- the 3:1 a control's outer edge owes is not text. So `ROOM_INKS` reads the
 * resolved hook values off the scrim and COMPOSITES each pair by painting it
 * to a canvas and reading the pixel back (CLAUDE.md: never a regex over
 * computed styles), and scores every ink against EVERY ground it can land on
 * -- both gradient stops and the field fill -- rather than a mean. It returns
 * a sentence the report prints, and `ROOM_INKS_CHECK` is the same arithmetic
 * reduced to a verdict per family.
 *
 * `_`-prefixed: a helper module, not a route spec.
 */

/** Open the box from the shell's floating control and wait for its field. */
export const OPEN_REPORT_BOX = {
	click: '.sfb-shell .sfb-trigger',
	until: '() => { const t = document.querySelector("#fb-msg"); return !!t && t.getBoundingClientRect().height > 0; }',
	attempts: 12,
	waitMs: 300,
	label: 'open the report box from the floating control'
};

/** Type into the message so SEND is live and the save line reads "Unsaved changes". */
export const TYPE_REPORT = {
	evaluate: `() => {
		const t = document.querySelector('#fb-msg');
		t.value = 'The page did not load my progress.';
		t.dispatchEvent(new Event('input', { bubbles: true }));
		return 'typed ' + t.value.length + ' characters';
	}`,
	until: '() => { const s = document.querySelector(".fb-state .save-ind-text"); return !!s && s.textContent.trim().length > 0; }',
	label: 'type a message: SEND goes live and the save line appears'
};

/* The in-page arithmetic, shared by the printed probe and the verdict. */
const PAIRS = `
	const scrim = document.querySelector('.sfb-host .fb-scrim');
	if (!scrim) return null;
	const cs = getComputedStyle(scrim);
	const v = (n) => cs.getPropertyValue(n).trim();
	const cv = document.createElement('canvas');
	cv.width = cv.height = 1;
	const cx = cv.getContext('2d', { willReadFrequently: true });
	const paint = (color, ground) => {
		cx.clearRect(0, 0, 1, 1);
		cx.fillStyle = '#000';
		cx.fillStyle = ground || '#000';
		cx.fillRect(0, 0, 1, 1);
		cx.fillStyle = '#123457';
		cx.fillStyle = color;
		if (cx.fillStyle === '#123457' && color.toLowerCase() !== '#123457') return null;
		cx.fillRect(0, 0, 1, 1);
		const d = cx.getImageData(0, 0, 1, 1).data;
		return [d[0], d[1], d[2]];
	};
	const lum = (rgb) => {
		const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
		return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
	};
	const ratio = (ink, ground) => {
		const g = paint(ground, '#000');
		const i = paint(ink, ground);
		if (!g || !i) return NaN;
		const a = lum(i), b = lum(g);
		return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
	};
	const grounds = { plate: v('--fb-bg'), deep: v('--fb-bg-deep'), field: v('--fb-field') };
	const worst = (ink, on) => Math.min(...on.map((k) => ratio(ink, grounds[k])));
	const t = document.querySelector('.sfb-shell .sfb-trigger') || document.querySelector('.sfb-trigger');
	let pill = null;
	if (t) {
		const tc = getComputedStyle(t);
		const r = t.getBoundingClientRect();
		let pageGround = null;
		for (const el of document.elementsFromPoint(Math.max(0, r.left - 6), r.top + r.height / 2)) {
			if (t.contains(el)) continue;
			const bg = getComputedStyle(el).backgroundColor;
			const p = paint(bg, '#fff');
			const q = paint(bg, '#000');
			if (p && q && p.join() === q.join()) { pageGround = bg; break; }
		}
		pill = {
			word: ratio(tc.color, tc.backgroundColor),
			edgeOnPage: pageGround ? ratio(tc.borderTopColor, pageGround) : NaN,
			pageGround
		};
	}
	const rows = {
		ink: worst(v('--fb-ink'), ['plate', 'deep', 'field']),
		muted: worst(v('--fb-ink-dim'), ['plate', 'deep', 'field']),
		accent: worst(v('--fb-accent'), ['plate', 'deep', 'field']),
		danger: worst(v('--fb-danger'), ['plate', 'deep']),
		saveOk: worst(v('--save-ok'), ['plate', 'deep']),
		saveInfo: worst(v('--save-info'), ['plate', 'deep']),
		saveWarn: worst(v('--save-warn'), ['plate', 'deep']),
		saveError: worst(v('--save-error'), ['plate', 'deep']),
		edge: worst(v('--fb-line'), ['plate', 'deep', 'field'])
	};
`;

/** A prepare step whose printed return value is every measured ratio. */
export const ROOM_INKS = {
	evaluate: `() => {
		${PAIRS}
		const f = (n) => (Number.isFinite(n) ? n.toFixed(2) : 'UNREAD');
		return 'grounds ' + JSON.stringify(grounds)
			+ ' | worst over every ground: ink ' + f(rows.ink) + ', muted ' + f(rows.muted)
			+ ', accent ' + f(rows.accent) + ', danger ' + f(rows.danger)
			+ ', saved ' + f(rows.saveOk) + ', saving ' + f(rows.saveInfo)
			+ ', unsaved ' + f(rows.saveWarn) + ', not-saved ' + f(rows.saveError)
			+ ', edge ' + f(rows.edge) + ' (3:1)'
			+ (pill ? ' | pill word ' + f(pill.word) + ', pill edge on ' + pill.pageGround + ' ' + f(pill.edgeOnPage) + ' (3:1)' : ' | NO PILL');
	}`,
	label: 'measure every box ink against every ground it lands on (canvas readback)'
};

/** The verdict: every text ink clears 4.5:1 and every edge 3:1, on every ground. */
export const ROOM_INKS_CHECK = {
	label: 'every box ink clears 4.5:1 and the control edges 3:1, on every ground they land on (numbers in the prepare line)',
	evaluate: `() => {
		${PAIRS}
		const text = ['ink', 'muted', 'accent', 'danger', 'saveOk', 'saveInfo', 'saveWarn', 'saveError'];
		return [
			text.every((k) => rows[k] >= 4.5) ? 'text inks clear 4.5' : 'TEXT BELOW 4.5: ' + text.filter((k) => !(rows[k] >= 4.5)).join(' '),
			rows.edge >= 3 ? 'box edges clear 3' : 'BOX EDGE BELOW 3',
			pill && pill.word >= 4.5 ? 'pill word clears 4.5' : 'PILL WORD BELOW 4.5',
			pill && pill.edgeOnPage >= 3 ? 'pill edge clears 3 on the page' : 'PILL EDGE BELOW 3 ON THE PAGE'
		];
	}`,
	expected: ['text inks clear 4.5', 'box edges clear 3', 'pill word clears 4.5', 'pill edge clears 3 on the page']
};
