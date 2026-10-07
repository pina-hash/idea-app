/**
 * Shared steps and probes for the /dev/classroom-live and
 * /dev/classroom-projector specs (ledger 0297, package LIVE): the teacher's
 * control view in the REAL ClassroomShell, and the projector view the class
 * sees. `_`-prefixed, so the route loader skips it (routes.mjs).
 */

/** The control view has hydrated once the grid has drawn its rows. */
export const LIVE_READY = {
	waitFor: `() => document.querySelectorAll('[data-testid="live-cell"]').length > 0`,
	timeoutMs: 30000
};

/** Each group on the grid and how many names it holds, in reading order. */
export const LIVE_GROUPS = `() => [...document.querySelectorAll('[data-testid^="live-group-"]')].map((g) =>
	g.getAttribute('data-testid').replace('live-group-', '') + ' ' + g.querySelectorAll('[data-testid="live-cell"]').length
)`;

/** Every name on the grid, sorted, so an absence below is read off the same list. */
export const LIVE_NAMES = `() => [...document.querySelectorAll('[data-testid="live-cell"] .lg-name')].map((n) => n.textContent.trim()).sort()`;

/** The projector has painted once its clock has digits in it. */
export const PROJECTOR_READY = {
	waitFor: `() => /\\d:\\d\\d/.test(document.querySelector('[data-testid="projector-clock"]')?.textContent || '')`,
	timeoutMs: 30000
};

/**
 * THE 8H RULE, MEASURED: the smallest font on the wall against one fiftieth of
 * the window's height, over every element that paints text of its own inside
 * the stage (the teacher's strip is chrome and fades; it is not the wall).
 * A portrait window is not a projector: the rule is about a wall display, so
 * at 375 the probe says so in words rather than passing or failing it.
 */
export const EIGHT_H = `() => {
	if (innerWidth < innerHeight) return 'portrait window, not a wall profile';
	const floor = innerHeight / 50;
	let min = Infinity, what = '';
	for (const el of document.querySelectorAll('.lp-stage *')) {
		if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
		if (!el.getBoundingClientRect().width) continue;
		const fs = parseFloat(getComputedStyle(el).fontSize);
		if (fs < min) { min = fs; what = el.textContent.trim().slice(0, 20); }
	}
	return min >= floor ? 'smallest text clears 1/50 of the height' : 'BELOW 8H: ' + what + ' ' + min + 'px < ' + floor.toFixed(1) + 'px';
}`;

/** The wall fits its window: no scroll in either direction. */
export const WALL_FITS = `() => {
	const d = document.documentElement;
	return [d.scrollWidth <= innerWidth ? 'no horizontal scroll' : 'scrolls sideways ' + d.scrollWidth, d.scrollHeight <= innerHeight ? 'no vertical scroll' : 'scrolls down ' + d.scrollHeight + ' > ' + innerHeight];
}`;

/** Every roster name the fixture holds, against the wall's whole text. */
export const ROSTER_ON_WALL = `() => {
	const names = ['Ana Reyes', 'Ben Okafor', 'Cruz Delgado', 'Dee Marsh', 'Eli Nakamura', 'Fay Obi', 'Gus Varga', 'Hana Ito', 'Ivan Petrov', 'Jo Lindqvist', 'Kim Soto', 'Lee Amari', 'Max Left', 'Mr. Pina'];
	const text = document.body.innerText;
	return [names.filter((n) => text.includes(n)).join(', ') || 'none', text.includes('@') ? 'an address' : 'no address'];
}`;

/**
 * THE TIMER, WATCHED FOR A SECOND (ledger 0298). Reads the readout's text on
 * every animation frame for `ms` and stashes what it saw on
 * `window.__bvTimerSample`: how many DIFFERENT readings (the digits are derived
 * from the clock on every frame the timer's own loop runs, so this counts
 * paints that changed the face), how many frames ran, and the gaps between
 * them (p50, p95, longest), which is frame pacing on THIS machine and is
 * reported, never gated -- the container is shared and its numbers are not an
 * old school desktop's. Returns the whole sample as a string, which the step
 * prints.
 */
export const sampleTimer = (selector, ms = 1000) => `async () => {
	const read = () => document.querySelector(${JSON.stringify(selector)})?.textContent ?? '';
	const seen = new Set();
	const gaps = [];
	let frames = 0;
	await new Promise((done) => {
		requestAnimationFrame((t0) => {
			let last = t0;
			const step = (t) => {
				frames++;
				gaps.push(t - last);
				last = t;
				seen.add(read());
				if (t - t0 < ${ms}) requestAnimationFrame(step);
				else done();
			};
			requestAnimationFrame(step);
		});
	});
	gaps.sort((a, b) => a - b);
	const at = (p) => +gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))].toFixed(1);
	const s = { distinct: seen.size, frames, p50: at(0.5), p95: at(0.95), longest: +gaps[gaps.length - 1].toFixed(1), first: [...seen].slice(0, 3) };
	window.__bvTimerSample = s;
	return 'in ${ms}ms: ' + s.distinct + ' distinct readings over ' + s.frames + ' frames; frame gap p50 ' + s.p50 + 'ms, p95 ' + s.p95 + 'ms, longest ' + s.longest + 'ms; first ' + s.first.join(' | ');
}`;

/** The verdict on that sample: at least `min` different readings in the window. */
export const timerTicked = (min) => `() => {
	const s = window.__bvTimerSample;
	return [s && s.distinct >= ${min} ? 'at least ${min} distinct readings' : 'only ' + (s ? s.distinct : 'no sample') + ' distinct readings'];
}`;

/** A readout's text, split into its two drawn parts, as the face shows them. */
export const READOUT_PARTS = (root) => `() => {
	const r = document.querySelector(${JSON.stringify(root)});
	if (!r) return ['no readout'];
	const whole = r.querySelector('.lp-whole, .lc-whole')?.textContent ?? '';
	const frac = r.querySelector('.lp-frac, .lc-frac')?.textContent ?? '';
	return [whole, frac];
}`;

/**
 * THE WALL FITS ITS WINDOW, WITH A PORTRAIT WINDOW EXEMPT FROM THE VERTICAL
 * HALF (reports R12, R13): a phone is not a wall, and the projector stacks and
 * scrolls there by design. The horizontal half holds at every width. The spec
 * reads the exemption in words, the way `EIGHT_H` does, so a portrait run is
 * never a silent pass.
 */
export const WALL_FITS_LANDSCAPE = `() => {
	const d = document.documentElement;
	const h = d.scrollWidth <= innerWidth ? 'no horizontal scroll' : 'scrolls sideways ' + d.scrollWidth;
	if (innerWidth < innerHeight) return [h, 'portrait window, not a wall profile'];
	return [h, d.scrollHeight <= innerHeight ? 'no vertical scroll' : 'scrolls down ' + d.scrollHeight + ' > ' + innerHeight];
}`;

/** The same, with the portrait exemption spelled as the landscape answer so one `expected` list serves every width. */
export const WALL_FITS_ANY = `() => (${WALL_FITS_LANDSCAPE})().map((v) => v.startsWith('portrait') ? 'no vertical scroll' : v)`;

/**
 * EVERY SIDE CARD FITS ITS OWN BOX: no card's content is taller than the card
 * (it would be clipped, or spill over the next one), and the side column's
 * content is no taller than the column. A clipping pane passes a "does the page
 * scroll" measurement by hiding what does not fit, so this reads the cards
 * themselves. Reports the worst overflow it saw, in px.
 */
export const WALL_CARDS_FIT = `() => {
	const side = document.querySelector('[data-testid="projector-side"]');
	if (!side) return ['no side column'];
	if (innerWidth < innerHeight) return ['every card holds its content', 'the side column holds its cards'];
	let worst = 0, what = '';
	for (const c of side.querySelectorAll('.lp-card')) {
		const over = c.scrollHeight - c.clientHeight;
		if (over > worst) { worst = over; what = c.getAttribute('aria-label') || c.querySelector('.lp-label')?.textContent || c.className; }
	}
	const cards = [...side.children];
	const bottom = cards.length ? Math.max(...cards.map((c) => c.getBoundingClientRect().bottom)) : 0;
	const top = cards.length ? Math.min(...cards.map((c) => c.getBoundingClientRect().top)) : 0;
	const box = side.getBoundingClientRect();
	const spill = Math.max(0, Math.round(bottom - box.bottom), Math.round(box.top - top));
	return [
		worst <= 1 ? 'every card holds its content' : 'card overflows by ' + worst + 'px: ' + what,
		spill <= 1 ? 'the side column holds its cards' : 'cards spill ' + spill + 'px past the side column'
	];
}`;

/** The wall's names, per activity group, and every count tile, read off the painted wall. */
export const WALL_NAMES = `() => {
	const card = document.querySelector('[data-testid="projector-activity"]');
	if (!card) return ['no activity on the wall'];
	const counts = [...card.querySelectorAll('[data-testid="projector-count"]')].map((t) => t.getAttribute('data-key') + ' ' + t.querySelector('.lp-count').textContent.trim());
	const names = [...card.querySelectorAll('[data-testid="projector-names"]')].map((g) => g.getAttribute('data-key') + ': ' + [...g.querySelectorAll('.lp-name')].map((n) => n.textContent.trim()).join(', '));
	return [...counts, ...names];
}`;

/**
 * THE RING IS THE TIMER, AND IT FILLS THE WALL: the Plate ring is drawn inside
 * the timer, and the ring's box against the window's height and the digits'
 * size against 1/12.5 of it (8vh), both reported in px.
 */
export const RING_FILLS = (minRingVh = 0.6, minDigitsVh = 0.08) => `() => {
	const ring = document.querySelector('[data-testid="projector-timer"] [data-testid="plate-ring"]');
	if (!ring) return ['no ring in the timer'];
	if (innerWidth < innerHeight) return ['a ring drawn', 'the ring fills the wall', 'the digits read from the back'];
	const r = ring.getBoundingClientRect();
	const digits = parseFloat(getComputedStyle(document.querySelector('[data-testid="projector-timer-digits"]')).fontSize);
	return [
		getComputedStyle(ring).display !== 'none' && r.width > 0 ? 'a ring drawn' : 'the ring is not drawn',
		r.height >= ${minRingVh} * innerHeight ? 'the ring fills the wall' : 'ring ' + Math.round(r.height) + 'px < ' + Math.round(${minRingVh} * innerHeight) + 'px',
		digits >= ${minDigitsVh} * innerHeight ? 'the digits read from the back' : 'digits ' + digits + 'px < ' + Math.round(${minDigitsVh} * innerHeight) + 'px'
	];
}`;

/**
 * THE DIGITS ON THE RING'S FACE, WASHED. The face is an SVG radial gradient,
 * which the contrast walk cannot see (it reads ancestors' background-color and
 * would report the page plate), so this reads the two colour stops the browser
 * RESOLVED for the face, and the digits' own colour, and composites them
 * through the harness's projector model (`window.__bvWash`, set by the spec's
 * prepare step from checks.mjs's numbers). It also reads the arc against the
 * wall's flattened track, a projector boundary (2:1 washed).
 */
export const RING_FACE_CONTRAST = (contrast, ambient, { word = 'washed', arc: withArc = true } = {}) => `() => {
	const toRgb = (s) => { const m = String(s).match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2] }; };
	const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
	const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
	// THE HARNESS'S OWN MODEL (checks.mjs \`washedRatio\`): luminance lifted onto
	// the projector's black floor plus the ambient light, and the ratio taken
	// with NO +0.05 flare term, because the ambient term IS the flare. With no
	// model (\`contrast\` null) it is the plain WCAG ratio, flare and all.
	const wash = (l) => ${contrast === null ? 'l' : `l * (1 - 1 / ${contrast}) + 1 / ${contrast} + ${ambient}`};
	const flare = ${contrast === null ? 0.05 : 0};
	const washed = (a, b) => { const [x, y] = [wash(lum(a)), wash(lum(b))].sort((p, q) => q - p); return (x + flare) / (y + flare); };
	const ring = document.querySelector('[data-testid="projector-timer"] [data-testid="plate-ring"]');
	const digits = document.querySelector('[data-testid="projector-timer-digits"]');
	if (!ring || !digits) return ['no ring'];
	const stops = [...ring.querySelectorAll('radialGradient stop')].map((s) => toRgb(getComputedStyle(s).stopColor));
	const ink = toRgb(getComputedStyle(digits).color);
	const face = Math.min(...stops.map((s) => washed(ink, s)));
	const arc = toRgb(getComputedStyle(ring.querySelector('.r-value')).stroke);
	const rest = [...ring.querySelectorAll('linearGradient')][0];
	const track = [...rest.querySelectorAll('stop')].map((s) => toRgb(getComputedStyle(s).stopColor));
	const edge = Math.min(...track.map((t) => washed(arc, t)));
	window.__bvRingFace = 'digits ' + face.toFixed(2) + ':1, arc ' + edge.toFixed(2) + ':1 (${word})';
	const out = [face >= 4.5 ? 'digits clear 4.5 ${word} on the ring face' : 'digits ' + face.toFixed(2) + ':1 ${word} on the face'];
	if (${withArc}) out.push(edge >= 2 ? 'the arc clears 2 ${word} on its track' : 'arc ' + edge.toFixed(2) + ':1 ${word} on the track');
	return out;
}`;

/** WCAG, for a theme the projector model does not judge (IDEA, Matrix): the same read with no wash. */
export const RING_FACE_WCAG = (opts = {}) => RING_FACE_CONTRAST(null, 0, { word: 'WCAG', ...opts });

/**
 * EVERY CUT IS SAID ON THE WALL: the agenda lines shown plus the "+N more"
 * figure, Coming up shown plus its figure, and each named group's names shown
 * plus its figure against that group's own count tile.
 */
export const EVERY_CUT_SAID = `() => {
	const frame = JSON.parse(localStorage.getItem('idea_live_projector:harness-teacher:s-live') || '{}');
	const figure = (el) => Number(el?.textContent.match(/\\+(\\d+) more/)?.[1] ?? 0);
	const agenda = document.querySelectorAll('[data-testid="projector-agenda-line"]').length + figure(document.querySelector('[data-testid="projector-agenda-more"]'));
	const next = document.querySelectorAll('[data-testid="projector-next-line"]').length + figure(document.querySelector('[data-testid="projector-next-more"]'));
	const names = (frame.activity && frame.activity.names) || {};
	let total = 0;
	let said = figure(document.querySelector('[data-testid="projector-names-folded"]'));
	for (const [key, list] of Object.entries(names)) {
		total += list.length;
		const g = document.querySelector('[data-testid="projector-names"][data-key="' + key + '"]');
		if (g) said += g.querySelectorAll('.lp-name:not(.lp-name-more)').length + figure(g.querySelector('.lp-name-more'));
	}
	return ['agenda ' + agenda, 'next ' + next, total > 0 && said === total ? 'every name accounted for' : 'names said ' + said + ' of ' + total];
}`;

/**
 * THE CLOCK FACE'S HANDS, WASHED (idea 26033e4b). The dial is drawn on the same
 * Plate ring as the timer, over the same SVG radial-gradient face the contrast
 * walk cannot see, so this reads the face's two RESOLVED stops and each hand's
 * own computed stroke, composited through the same model `RING_FACE_CONTRAST`
 * uses (`contrast` null is plain WCAG). The hour and minute hands and the
 * indices are the time and are held to 4.5; the second hand is a graphical
 * object, 3; and every hand against its own halo (the band that keeps a light
 * hand legible where it crosses the ring's light segments), 3. Reports the
 * weakest of each so the reading is auditable, on `window.__bvDialInks`.
 */
export const DIAL_HANDS_CONTRAST = (contrast, ambient, { word = 'washed' } = {}) => `() => {
	const toRgb = (s) => { const m = String(s).match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2] }; };
	const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
	const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
	const wash = (l) => ${contrast === null ? 'l' : `l * (1 - 1 / ${contrast}) + 1 / ${contrast} + ${ambient}`};
	const flare = ${contrast === null ? 0.05 : 0};
	const ratio = (a, b) => { const [x, y] = [wash(lum(a)), wash(lum(b))].sort((p, q) => q - p); return (x + flare) / (y + flare); };
	const dial = document.querySelector('[data-testid="projector-dial"]');
	if (!dial) return ['no dial'];
	const stops = [...dial.querySelectorAll('[data-testid="plate-ring"] radialGradient stop')].map((s) => toRgb(getComputedStyle(s).stopColor));
	if (stops.length !== 2) return ['face stops ' + stops.length];
	const ink = (sel) => toRgb(getComputedStyle(dial.querySelector(sel)).stroke);
	const onFace = (c) => Math.min(...stops.map((s) => ratio(c, s)));
	const hands = Math.min(onFace(ink('.wc-hour .wc-ink')), onFace(ink('.wc-min .wc-ink')), onFace(ink('.wc-index')));
	const second = onFace(ink('.wc-sec-ink'));
	const halo = Math.min(
		ratio(ink('.wc-hour .wc-ink'), ink('.wc-hour .wc-halo')),
		ratio(ink('.wc-min .wc-ink'), ink('.wc-min .wc-halo')),
		ratio(ink('.wc-sec-ink'), ink('.wc-sec .wc-halo'))
	);
	window.__bvDialInks = 'hands ' + hands.toFixed(2) + ':1, second ' + second.toFixed(2) + ':1, halo ' + halo.toFixed(2) + ':1 (${word})';
	return [
		hands >= 4.5 ? 'hands and indices clear 4.5 ${word} on the face' : 'hands ' + hands.toFixed(2) + ':1 ${word}',
		second >= 3 ? 'the second hand clears 3 ${word} on the face' : 'second hand ' + second.toFixed(2) + ':1 ${word}',
		halo >= 3 ? 'every hand clears 3 ${word} on its halo' : 'halo ' + halo.toFixed(2) + ':1 ${word}'
	];
}`;

/** The same, by WCAG, for a theme the projector model does not judge. */
export const DIAL_HANDS_WCAG = DIAL_HANDS_CONTRAST(null, 0, { word: 'WCAG' });

/**
 * THE DIAL TELLS THE TIME THE DIGITS UNDER IT SAY, AND FILLS THE HERO. The
 * hands' angles (the dial's own data attributes) against the reading parsed off
 * the digits, within half a degree; the dial's height against the window's
 * (half of it, landscape), and the digits sitting wholly under the dial.
 */
export const DIAL_READS = `() => {
	const dial = document.querySelector('[data-testid="projector-dial"]');
	const read = document.querySelector('.lp-dial-read');
	if (!dial || !read) return ['no dial'];
	const m = read.textContent.replace(/\\s+/g, '').match(/^(\\d{1,2}):(\\d{2})([AP]M)$/);
	if (!m) return ['digits unreadable: ' + read.textContent.trim()];
	const h = +m[1] % 12, min = +m[2];
	const near = (a, b) => Math.abs(((+a - b) % 360 + 540) % 360 - 180) <= 0.5;
	const d = dial.getBoundingClientRect(), r = read.getBoundingClientRect();
	const portrait = innerWidth < innerHeight;
	return [
		near(dial.dataset.hour, (h + min / 60) * 30) && near(dial.dataset.minute, min * 6) ? 'the hands agree with the digits' : 'hands ' + dial.dataset.hour + '/' + dial.dataset.minute + ' against ' + m[0],
		portrait || d.height >= 0.5 * innerHeight ? 'the dial fills the hero' : 'dial ' + Math.round(d.height) + 'px < ' + Math.round(0.5 * innerHeight) + 'px',
		r.top >= d.bottom - 1 && r.width > 0 ? 'the digits sit under the dial' : 'digits at ' + Math.round(r.top) + ', dial ends ' + Math.round(d.bottom)
	];
}`;
