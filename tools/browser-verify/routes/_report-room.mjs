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

/* The in-page arithmetic, shared by the printed probe and the verdict.

   THE BOX MAY BE IN A FRAME (ledger 0396): on a legacy page (the Coin Ledger,
   an assignment handout) the official window opens in the same-origin frame
   `#idea-feedback-frame`, so the box is read out of that frame's document when
   the frame is open, and out of this one everywhere else. The button is always
   in this document. */
const PAIRS = `
	const frameEl = document.getElementById('idea-feedback-frame');
	const doc = frameEl && frameEl.classList.contains('is-open') && frameEl.contentDocument ? frameEl.contentDocument : document;
	const scrim = doc.querySelector('.sfb-host .fb-scrim');
	if (!scrim) return null;
	const cs = doc.defaultView.getComputedStyle(scrim);
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

/**
 * THE BOX IS THE HOME BOX'S SIZE IN EVERY ROOM, BECAUSE NO ROOM HANDS IT A
 * TYPEFACE (ledger 0396, review round 4). A room changes the box's colours and
 * never its type: FRC's Roboto and FSP's system stack, handed in through a font
 * hook that no longer exists, wrapped the notes onto more lines, so the box held
 * 869px of content in 826px at 1440x900 and SEND sat below its edge. So the
 * button and the box read the site's own faces, and above the phone width (the
 * harness window is 900 tall, which holds the home box) SEND sits wholly inside
 * the box's visible edge and answers a tap at its centre, as the home box's does.
 */
export const HOME_METRICS_CHECK = {
	label: 'the box and the button take the site\u2019s own faces, and above phone width SEND sits wholly inside the box and answers at its centre',
	evaluate: `() => {
		const frameEl = document.getElementById('idea-feedback-frame');
		const doc = frameEl && frameEl.classList.contains('is-open') && frameEl.contentDocument ? frameEl.contentDocument : document;
		const box = doc.querySelector('.fb-box');
		const msg = doc.querySelector('#fb-msg');
		const chip = doc.querySelector('.fb-kind');
		const trig = document.querySelector('.sfb-trigger');
		if (!box || !msg || !chip || !trig) return ['NO BOX OR NO BUTTON'];
		const face = (el) => el.ownerDocument.defaultView.getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();
		const send = doc.querySelector('.fb-btn-primary');
		const sb = send.getBoundingClientRect();
		const hit = doc.elementFromPoint(sb.left + sb.width / 2, sb.top + sb.height / 2);
		const phone = window.innerWidth <= 480;
		const bb = box.getBoundingClientRect();
		const fits = sb.top >= bb.top - 0.5 && sb.bottom <= bb.bottom + 0.5 && !!hit && (hit === send || send.contains(hit));
		return [
			'body ' + face(msg),
			'keys ' + face(chip),
			'button ' + face(trig),
			/* On a phone the home box scrolls too, so only the faces are claimed there. */
			phone || fits ? 'SEND where the home box has it' : 'SEND BELOW THE BOX EDGE (SEND ' + Math.round(sb.top) + '..' + Math.round(sb.bottom) + ', box ends ' + Math.round(bb.bottom) + ', ' + box.scrollHeight + ' in ' + box.clientHeight + ')'
		];
	}`,
	expected: ['body Rajdhani', 'keys Share Tech Mono', 'button Share Tech Mono', 'SEND where the home box has it']
};

/**
 * THE OFFICIAL WINDOW, OPENED FROM A LEGACY PAGE'S BUTTON (ledger 0396): the
 * real `FeedbackTrigger` server-rendered into the page, which opens the real
 * box in the same-origin frame. Done when the frame is open and the box's
 * message field has a box of its own inside it.
 */
export const OPEN_FRAME_BOX = {
	click: '#idea-feedback-launch .sfb-trigger',
	until: '() => { const f = document.getElementById("idea-feedback-frame"); const d = f && f.classList.contains("is-open") && f.contentDocument; const t = d && d.querySelector("#fb-msg"); return !!t && t.getBoundingClientRect().height > 0; }',
	attempts: 20,
	waitMs: 500,
	label: 'open the feedback window from the injected button (it loads in a frame)'
};

/**
 * THE FRAMED WINDOW'S FIRST OPEN DREW IN ITS OWN FACES (review polish round).
 * The frame is a fresh document over a page that is not one of ours, so the
 * box's faces were not loaded the first time it opened, and it used to draw in
 * the fallback stack and then reflow (871px of content in an 826px box, SEND
 * below its edge, at 1440). The window now warms its faces when it mounts and
 * every open waits for them, capped; the page's root says how this open went:
 * `set` (every face there before the box drew), `missing` (one failed to load)
 * or `capped` (the wait ran out). This page's open IS its first, so `set` here
 * is the first open measured.
 */
export const FRAME_TYPESET_CHECK = {
	label: 'the framed window opened already set in its own faces (its first open)',
	evaluate: `() => {
		const f = document.getElementById('idea-feedback-frame');
		const d = f && f.contentDocument;
		if (!d) return ['NO FRAME'];
		const root = d.querySelector('[data-testid="feedback-embed"]');
		/* Only the faces that set Latin text: @fontsource also declares a
		   latin-ext and a devanagari face per weight, which no English box asks
		   for and which rightly stay unloaded. */
		const latin = (range) => String(range || 'U+0-10FFFF').split(',').some((part) => {
			const m = /U\\+([0-9A-F?]+)(?:-([0-9A-F]+))?/i.exec(part.trim());
			if (!m) return false;
			const lo = parseInt(m[1].replace(/\\?/g, '0'), 16);
			const hi = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\\?/g, 'F'), 16);
			return lo <= 0x41 && 0x41 <= hi;
		});
		const pending = [];
		let latinFaces = 0;
		d.fonts.forEach((x) => {
			if (!/Rajdhani|Share Tech Mono/.test(x.family) || !latin(x.unicodeRange)) return;
			latinFaces++;
			if (x.status !== 'loaded') pending.push(x.family + ' ' + x.weight + ' ' + x.status);
		});
		if (latinFaces === 0) return ['typeset ' + (root?.dataset.typeset || 'NONE'), 'NO LATIN FACE OF THE BOX FOUND'];
		return ['typeset ' + (root?.dataset.typeset || 'NONE'), pending.length ? 'NOT LOADED: ' + pending.join(', ') : 'every face of the box loaded'];
	}`,
	expected: ['typeset set', 'every face of the box loaded']
};

/** Type into the framed box, so SEND is live and the save line appears. */
export const TYPE_FRAME_REPORT = {
	evaluate: `() => {
		const d = document.getElementById('idea-feedback-frame').contentDocument;
		const t = d.querySelector('#fb-msg');
		t.value = 'The leaderboard did not refresh.';
		t.dispatchEvent(new Event('input', { bubbles: true }));
		return 'typed ' + t.value.length + ' characters in the framed box';
	}`,
	until: '() => { const d = document.getElementById("idea-feedback-frame").contentDocument; const s = d.querySelector(".fb-state .save-ind-text"); return !!s && s.textContent.trim().length > 0; }',
	label: 'type a message in the framed box: SEND goes live and the save line appears'
};

/**
 * THE BUTTON SITS IN THE OFFICIAL CORNER: the home page's own gaps, read off
 * the real button. 0.75rem (12px) from the right and the bottom at a desktop,
 * and on a phone (30rem and under) 1rem from the right and 1.5rem up, 48px
 * tall. One verdict at every width.
 */
export const OFFICIAL_CORNER_CHECK = {
	label: 'the feedback button sits in the official corner, the home page\u2019s own gaps',
	evaluate: `() => {
		const t = document.querySelector('.sfb-shell .sfb-trigger');
		if (!t) return ['NO BUTTON'];
		const r = t.getBoundingClientRect();
		const phone = window.innerWidth <= 480;
		const right = Math.round(window.innerWidth - r.right);
		const bottom = Math.round(window.innerHeight - r.bottom);
		const want = phone ? { right: 16, bottom: 24, h: 48 } : { right: 12, bottom: 12, h: 44 };
		const ok = Math.abs(right - want.right) <= 1 && Math.abs(bottom - want.bottom) <= 1 && Math.round(r.height) >= want.h;
		return [ok ? 'official corner' : 'OFF THE CORNER: right ' + right + ', bottom ' + bottom + ', height ' + Math.round(r.height) + ' (want ' + JSON.stringify(want) + ')', getComputedStyle(t.closest('.sfb')).position];
	}`,
	expected: ['official corner', 'fixed']
};

/**
 * THE FRAMED WINDOW IS THE HOME PAGE'S BOX, field for field: every control the
 * official window offers, read out of the frame. `contact` is the one field
 * that turns on the session, and the caller names which it expects.
 */
/** The field census, as a function of the document the box lives in. */
const FIELD_LIST = `(d) => {
	const n = (s) => d.querySelectorAll(s).length;
	return [
		'title ' + (d.querySelector('.fb-title')?.textContent.trim() || 'NONE'),
		'kinds ' + n('.fb-kind:not(.fb-horizon)'),
		'horizons ' + n('.fb-horizon'),
		'message ' + n('#fb-msg'),
		'tried ' + n('#fb-tried'),
		'voice ' + (n('.fb-dictate') > 0 ? 'offered' : 'NONE'),
		'screenshot ' + (n('.fb-shot-input') + n('.fb-shot-absent') > 0 ? 'offered or explained' : 'NONE'),
		'contact ' + n('#fb-contact'),
		'send ' + n('.fb-btn-primary')
	];
}`;

const fieldsExpected = (signedIn) => [
	'title Send feedback',
	'kinds 4',
	'horizons 2',
	'message 1',
	'tried 1',
	'voice offered',
	'screenshot offered or explained',
	'contact ' + (signedIn ? 0 : 1),
	'send 1'
];

export function frameFields(signedIn) {
	return {
		label: 'the framed window offers every field the home box does' + (signedIn ? ' (signed in: no contact field)' : ' (signed out: the contact field)'),
		evaluate: `() => {
			const f = document.getElementById('idea-feedback-frame');
			const d = f && f.contentDocument;
			if (!d) return ['NO FRAME'];
			return (${FIELD_LIST})(d);
		}`,
		expected: fieldsExpected(signedIn)
	};
}

/**
 * THE SAME CENSUS OVER A BOX MOUNTED IN THE PAGE ITSELF (the root layout's own
 * `SiteFeedback`), so a room that wears the official window directly -- GAUNTLET
 * since ledger 0396 -- is held to the identical field list the frame is.
 */
export function pageFields(signedIn) {
	return {
		label: 'the window offers every field the home box does' + (signedIn ? ' (signed in: no contact field)' : ' (signed out: the contact field)'),
		evaluate: `() => (${FIELD_LIST})(document)`,
		expected: fieldsExpected(signedIn)
	};
}

/**
 * ESCAPE CLOSES THE FRAMED WINDOW AND HANDS FOCUS BACK TO THE BUTTON THAT
 * OPENED IT, through the real path: a keydown inside the frame reaches the
 * box's own handler, the box closes, the window posts `closed`, and the page
 * hides the frame and focuses the button. The window is opened again
 * afterwards, so any read after this one still has it.
 */
export const ESCAPE_CLOSES_FRAME = {
	label: 'Escape in the framed window closes it and hands focus back to the button',
	evaluate: `async () => {
		const f = document.getElementById('idea-feedback-frame');
		const t = document.querySelector('#idea-feedback-launch .sfb-trigger');
		if (!f || !t) return ['NO FRAME OR BUTTON'];
		const d = f.contentDocument;
		const ta = d.querySelector('#fb-msg');
		ta.focus();
		ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));
		for (let i = 0; i < 20 && f.classList.contains('is-open'); i++) await wait(100);
		const closed = !f.classList.contains('is-open') && getComputedStyle(f).visibility === 'hidden';
		const back = document.activeElement === t;
		t.click();
		for (let i = 0; i < 30 && !(f.classList.contains('is-open') && d.querySelector('#fb-msg')); i++) await wait(100);
		return [closed ? 'Escape closes the window' : 'ESCAPE LEFT THE WINDOW OPEN', back ? 'focus returns to the button' : 'FOCUS DID NOT RETURN: ' + (document.activeElement?.tagName || 'none')];
	}`,
	expected: ['Escape closes the window', 'focus returns to the button']
};

/**
 * THE FRAMED WINDOW'S LIT KEYS ARE READABLE, AND ITS KEYS ARE WHERE THE HOME
 * BOX'S ARE (review round 1 of ledger 0396).
 *
 * The Ledger's window wears the plate in the Ledger's colours. On Space White
 * the chosen kind and horizon drew the plate's dark key ink on the Ledger's
 * green lit face, 2.35:1, so the word saying which one is chosen could not be
 * read; the Ledger's own lit word now reaches the plate (`--plate-lit-ink`).
 * Every key in the box is scored against EVERY ground its face paints (the
 * ground colour and both gradient stops, composited on a canvas, never read
 * off a computed string), and the lit ones are named so a zero count cannot
 * pass. The box also has to hold Cancel and Send at 1440x900 with no inner
 * scroll, which it did not while the window was handed the Ledger's monospace.
 */
export const FRAME_KEYS_CHECK = {
	label: 'every key in the framed window clears 4.5:1 on its own face, the chosen ones included, and Cancel and Send sit inside the box',
	evaluate: `() => {
		const f = document.getElementById('idea-feedback-frame');
		const d = f && f.classList.contains('is-open') && f.contentDocument;
		if (!d) return ['NO OPEN FRAME'];
		const box = d.querySelector('.fb-box');
		if (!box) return ['NO BOX'];
		const cv = document.createElement('canvas');
		cv.width = cv.height = 1;
		const cx = cv.getContext('2d', { willReadFrequently: true });
		const paint = (c, g) => { cx.fillStyle = g || '#000'; cx.fillRect(0, 0, 1, 1); cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const p = cx.getImageData(0, 0, 1, 1).data; return [p[0], p[1], p[2]]; };
		const lum = (p) => { const q = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * q(p[0]) + 0.7152 * q(p[1]) + 0.0722 * q(p[2]); };
		const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
		let lit = 0, worst = 99, worstWord = '';
		for (const el of box.querySelectorAll('.fb-kind, .fb-btn')) {
			if (el.disabled) continue;
			const cs = d.defaultView.getComputedStyle(el);
			const on = el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true' || el.classList.contains('on');
			if (on) lit++;
			const stops = (cs.backgroundImage.match(/rgba?\\([^)]+\\)|#[0-9a-f]{3,8}/gi) || []).slice(0, 2);
			const ink = paint(cs.color, cs.backgroundColor);
			for (const g of [cs.backgroundColor, ...stops]) {
				const r = ratio(ink, paint(g, cs.backgroundColor));
				if (r < worst) { worst = r; worstWord = (el.textContent || '').trim().slice(0, 16); }
			}
		}
		const b = box.getBoundingClientRect();
		const actions = [...box.querySelectorAll('.fb-actions button')];
		const inside = actions.length > 0 && actions.every((a) => { const r = a.getBoundingClientRect(); return r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5; });
		const wide = window.innerWidth >= 1024 && window.innerHeight >= 900;
		return [
			lit >= 2 ? 'the chosen kind and horizon are lit' : 'ONLY ' + lit + ' LIT KEY(S)',
			worst >= 4.5 ? 'every key clears 4.5' : 'A KEY AT ' + worst.toFixed(2) + ' (' + worstWord + ')',
			!wide || inside ? 'Cancel and Send inside the box' : 'CANCEL AND SEND BELOW THE BOX'
		];
	}`,
	expected: ['the chosen kind and horizon are lit', 'every key clears 4.5', 'Cancel and Send inside the box']
};

/**
 * THE FRAMED WINDOW FOLLOWS A THEME SWITCHED IN ANOTHER TAB, AND WHAT A PERSON
 * TYPES STAYS READABLE (review round 2 of ledger 0396).
 *
 * The frame is kept once it has loaded, and the room's colours used to reach
 * it only in its address, so they were the page's colours at the moment the
 * frame was built. A theme switched in another tab moved the Ledger (its own
 * storage listener) and the window's document (ThemeRoot's) and left the
 * handed-in colours behind: the box kept one theme's light field under the
 * other theme's light ink, 1.0:1. The reviewer's sequence, through the real
 * paths: the window is open (the spec's prepare step), Escape closes it, the
 * stored theme moves -- a real `localStorage` write, which the frame's document
 * hears as a storage event because it is another document of this origin, and
 * a dispatched `StorageEvent` for the Ledger itself, which is what another tab's
 * write would deliver to it -- the button opens the window again, a sentence is
 * typed, and the typed text is scored against every ground the field paints
 * (its fill and its gradient's top stop, composited on a canvas).
 *
 * `to` is the theme switched to; `attr` is the attribute it puts on both
 * documents (null for IDEA, which is the attribute's absence).
 */
export function frameFollowsTheme(to, attr) {
	return {
		label: `the framed window follows a theme switched to ${to} in another tab, and typed text stays readable`,
		evaluate: `async () => {
			const wait = (ms) => new Promise((r) => setTimeout(r, ms));
			const f = document.getElementById('idea-feedback-frame');
			const t = document.querySelector('#idea-feedback-launch .sfb-trigger');
			if (!f || !t) return ['NO FRAME OR BUTTON'];
			const d0 = f.contentDocument;
			const ta0 = d0.querySelector('#fb-msg');
			ta0.focus();
			ta0.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
			for (let i = 0; i < 20 && f.classList.contains('is-open'); i++) await wait(100);
			if (f.classList.contains('is-open')) return ['ESCAPE LEFT THE WINDOW OPEN'];
			const key = 'idea_site_theme';
			const old = localStorage.getItem(key);
			localStorage.setItem(key, ${JSON.stringify(to)});
			window.dispatchEvent(new StorageEvent('storage', { key, oldValue: old, newValue: ${JSON.stringify(to)}, storageArea: localStorage }));
			const want = ${JSON.stringify(attr)};
			const both = () => document.documentElement.getAttribute('data-theme') === want && f.contentDocument?.documentElement.getAttribute('data-theme') === want;
			for (let i = 0; i < 30 && !both(); i++) await wait(100);
			const followed = both();
			t.click();
			for (let i = 0; i < 40 && !(f.classList.contains('is-open') && f.contentDocument?.querySelector('#fb-msg')); i++) await wait(100);
			const d = f.contentDocument;
			const ta = d && d.querySelector('#fb-msg');
			if (!ta || !f.classList.contains('is-open')) return [followed ? 'both documents follow' : 'A DOCUMENT DID NOT FOLLOW', 'THE WINDOW DID NOT OPEN AGAIN'];
			ta.focus();
			ta.value = 'The leaderboard did not refresh after the theme changed.';
			ta.dispatchEvent(new Event('input', { bubbles: true }));
			await wait(300);
			const cs = d.defaultView.getComputedStyle(ta);
			const cv = document.createElement('canvas');
			cv.width = cv.height = 1;
			const cx = cv.getContext('2d', { willReadFrequently: true });
			const paint = (c, g) => { cx.fillStyle = '#000'; cx.fillStyle = g || '#000'; cx.fillRect(0, 0, 1, 1); cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const p = cx.getImageData(0, 0, 1, 1).data; return [p[0], p[1], p[2]]; };
			const lum = (p) => { const q = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * q(p[0]) + 0.7152 * q(p[1]) + 0.0722 * q(p[2]); };
			const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
			const stops = (cs.backgroundImage.match(/rgba?\\([^)]+\\)|#[0-9a-f]{3,8}/gi) || []).slice(0, 2);
			let worst = 99;
			for (const g of [cs.backgroundColor, ...stops]) {
				const ground = paint(g, cs.backgroundColor);
				worst = Math.min(worst, ratio(paint(cs.color, g), ground));
			}
			/* The box wears the page's colours as they are NOW: the field the
			   window paints is the field the page's room declares in its new
			   theme. Without this row a window handed the old theme's field AND
			   the old theme's ink would read clean on contrast and still be the
			   wrong room. */
			const wrap = document.getElementById('idea-feedback-launch');
			const scrim = d.querySelector('.sfb-host .fb-scrim');
			const roomField = wrap ? getComputedStyle(wrap).getPropertyValue('--fb-room-field').trim() : '';
			const boxField = scrim ? d.defaultView.getComputedStyle(scrim).getPropertyValue('--fb-field').trim() : '';
			const same = roomField && boxField && paint(roomField, '#000').join() === paint(boxField, '#000').join();
			return [
				followed ? 'both documents follow' : 'A DOCUMENT DID NOT FOLLOW: page ' + document.documentElement.getAttribute('data-theme') + ', window ' + d.documentElement.getAttribute('data-theme'),
				same ? 'the box wears the page\u2019s current colours' : 'THE BOX KEPT OLD COLOURS: page field ' + roomField + ', box field ' + boxField,
				worst >= 4.5 ? 'typed text clears 4.5' : 'TYPED TEXT AT ' + worst.toFixed(2) + ' (' + cs.color + ' on ' + cs.backgroundColor + ')'
			];
		}`,
		expected: ['both documents follow', 'the box wears the page\u2019s current colours', 'typed text clears 4.5']
	};
}

/**
 * SEND FILES WHAT PRODUCTION WOULD FILE, FOR EACH KIND OF REPORTER (review
 * round 3). The window's harness sink (`/feedback/embed?sink=memory`) builds
 * the record with the REAL writer the window would use: `submitFeedback`'s row
 * signed in, and the body `submitAnonymousFeedback` would post to the anonymous
 * route signed out. It used to send every report through the signed-in writer,
 * so a signed-out harness row carried an account and no contact. This presses
 * the framed box's own Send and reads what landed on this page. It runs last:
 * the box is on its "went through" panel afterwards.
 */
export function sinkReportCheck(signedIn) {
	return {
		label: signedIn
			? 'Send files the signed-in row: an account, no contact, against the opener\'s route'
			: 'Send files the signed-out report through the anonymous route: the contact, no account, against the opener\'s route',
		evaluate: `async () => {
			const wait = (ms) => new Promise((r) => setTimeout(r, ms));
			const f = document.getElementById('idea-feedback-frame');
			const t = document.querySelector('#idea-feedback-launch .sfb-trigger');
			if (!f || !t) return ['NO FRAME OR BUTTON'];
			if (!f.classList.contains('is-open')) t.click();
			for (let i = 0; i < 30 && !(f.classList.contains('is-open') && f.contentDocument.querySelector('#fb-msg')); i++) await wait(100);
			const d = f.contentDocument;
			const ta = d.querySelector('#fb-msg');
			if (!ta) return ['NO BOX'];
			ta.value = 'The leaderboard did not refresh.';
			ta.dispatchEvent(new Event('input', { bubbles: true }));
			const c = d.querySelector('#fb-contact');
			if (c) { c.value = 'period 3'; c.dispatchEvent(new Event('input', { bubbles: true })); }
			await wait(200);
			window.__ideaFeedbackSink = [];
			const send = d.querySelector('.fb-actions .fb-btn-primary');
			if (!send || send.disabled) return ['SEND NOT LIVE'];
			send.click();
			const filed = () => (window.__ideaFeedbackSink || []).find((r) => r.kind === 'row' || r.kind === 'anonymous');
			for (let i = 0; i < 60 && !filed(); i++) await wait(100);
			const rec = filed();
			if (!rec) return ['NOTHING FILED'];
			if (rec.kind === 'anonymous') {
				const b = rec.value.body || {};
				return [
					'through ' + rec.value.method + ' ' + rec.value.endpoint,
					'user_id' in b ? 'AN ACCOUNT ON AN ANONYMOUS REPORT' : 'no account',
					'contact ' + (b.contact ?? 'none'),
					'route ' + ((b.meta || {}).route ?? 'none')
				];
			}
			const row = rec.value || {};
			return [
				'through the signed-in insert',
				row.user_id ? 'an account' : 'NO ACCOUNT ON A SIGNED-IN ROW',
				'contact ' + (row.contact ?? 'none'),
				'route ' + ((row.meta || {}).route ?? 'none')
			];
		}`,
		expected: signedIn
			? ['through the signed-in insert', 'an account', 'contact none', 'route /assignments/[slug]']
			: ['through POST /api/feedback', 'no account', 'contact period 3', 'route /assignments/[slug]']
	};
}
