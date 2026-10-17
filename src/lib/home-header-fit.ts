/**
 * THE HOME HEADER'S FIT (ledger 0396): what gives way, and in what order, when
 * the home header's row is short of room.
 *
 * The row's controls change with who is looking (a class chip, the Install app
 * key, an admin link, the quick note, the profile menu) and a class name can be
 * any length, so no breakpoint can say when they fit. `fitHomeHeader` lays the
 * header out in each arrangement it may take and keeps the first one that
 * costs nothing the most compact one would not: no taller header, no sideways
 * overflow, no more of the class chip cut off, and no two controls overlapping.
 *
 * WHAT GIVES WAY, IN ORDER, AS THE WINDOW NARROWS (review round 2):
 *  1. the lines-of-code readout beside the logo: a desktop readout, already
 *     hidden below 769px for the same reason (app.css);
 *  2. the Install app key's word: it becomes its icon, and the word stays in
 *     the button, visually hidden, as its accessible name;
 *  3. the class chip, last of all: an ellipsis, with its whole name in `title`.
 *
 * EACH GIVES WAY ONCE, AND ONLY WHERE IT DOES NOT FIT (review polish D). An
 * arrangement is kept at a width when it fits there AND at every wider width,
 * so as a window narrows the readout goes once, then the word goes once, and
 * neither comes back. Narrowing the window GIVES the real row room at a few
 * widths, and those are why "fits here" alone is not enough: the quick note
 * leaves the row from 899px down, the side padding halves and the actions'
 * gaps close at 768, a signed-in phone's tools take a row of their own at 520,
 * and a signed-out phone's keys tighten at 400 (`HEADER_FLOORS`). Read off the
 * real row alone, a student's key went icon, word, icon, word, icon, word,
 * icon between 1030 and 320px (measured before round 2).
 *
 * So the fit asks every width the window has passed through on its way down,
 * not one: the real row at this width held on one line (`data-fit-line`), and
 * the row as it is just above each of those widths that is wider than the
 * window (`data-fit-probe`, a copy of the header laid out at that width;
 * `fitChecks`).
 * Inside each stretch between them the room only shrinks as the window does,
 * so its narrowest width speaks for all of it. A teacher's row (no class chip)
 * fits the word at every width, so it never loses it, phone included; a
 * student's chip runs out of room at 790px with the word beside it, so the key
 * is its icon from there down even where a phone's second row would hold it.
 * Round 2 measured everything against the desktop row squeezed to the
 * window's width, which was monotonic but took the word from a teacher's
 * phone, where it fits.
 *
 * Held on one line, a row that does not fit shows as an overflow or a cut
 * chip, never as a wrap: a wrap under the logo costs every arrangement the
 * same height once they all wrap, which is how a word came back at a
 * narrower width.
 *
 * `tools/browser-verify/_home-header-sweep.mjs` resizes the real page from
 * 1440 to 320 and back for five viewers and fails on any width where something
 * came back, and on any width where the icon shows although the word fits
 * there and everywhere wider, or the word shows where it does not fit.
 *
 * THE DECISION IS PURE (`fitCandidates`, `fitChecks`, `chooseFit`), handed a
 * `measure` that lays the header out and reads it, so the order is testable
 * with no browser. The action is the thin part. It writes `data-fit` on the
 * key and `data-readout` on the header; Svelte manages neither, so a
 * re-render cannot undo them, and app.css and InstallAppKey's own stylesheet
 * draw from them. Every arrangement is laid out and read in ONE task, below
 * 900px on a hidden copy of the header (`copyOf`), so nothing paints in
 * between and the page never moves while it is read. Measured on this
 * container at 375px: a teacher's fit (four readings, eight layouts) took
 * 15ms, 61ms at a 4x CPU slowdown; a student's (refused at the first reading)
 * 4.8ms; a desktop's at 1440 1.8ms.
 */

/** What one arrangement of the header measures. */
export interface HeaderReading {
	/** The header's height. */
	height: number;
	/** How far the row's controls run past the header's content box sideways. */
	overflow: number;
	/** How much of the class chip's text is cut off (0 with no chip). */
	clipped: number;
	/** Any two of the row's controls overlap. */
	overlap: boolean;
}

/** One arrangement: the key with its word or its icon, the readout shown or not. */
export interface HeaderFit {
	word: boolean;
	readout: boolean;
}

/**
 * Every arrangement there is, in the order the header prefers them, each
 * strictly more compact than the one before it: the readout gives way first,
 * then the key's word. The LAST is the most compact. With no key there is no
 * word to give up; with no readout there is no readout to hide.
 *
 * `holdReadout` is for while the readout's own breakdown panel is open: the
 * readout is not taken away from under it, so only the word may give way.
 */
export function fitCandidates({
	key,
	readout,
	holdReadout = false
}: {
	key: boolean;
	readout: boolean;
	holdReadout?: boolean;
}): HeaderFit[] {
	if (holdReadout && readout) return key ? [{ word: true, readout: true }, { word: false, readout: true }] : [{ word: false, readout: true }];
	const out: HeaderFit[] = [];
	if (key && readout) out.push({ word: true, readout: true });
	if (key) out.push({ word: true, readout: false });
	if (!key && readout) out.push({ word: false, readout: true });
	out.push({ word: false, readout: false });
	return out;
}

/** Half a pixel either way is rounding, never a cost. */
const SLACK = 0.5;

/** Whether an arrangement costs nothing the most compact one does not. */
export function costsNothing(reading: HeaderReading, compact: HeaderReading): boolean {
	return (
		reading.height <= compact.height + SLACK &&
		reading.overflow <= compact.overflow + SLACK &&
		reading.clipped <= compact.clipped + SLACK &&
		(!reading.overlap || compact.overlap)
	);
}

/**
 * How the header is laid out for one reading. `line` is the real row at the
 * window's own width, held on one line; the other three are the row as it is
 * at a WIDER window, laid out at that width (app.css, `data-fit-probe`).
 */
export type FitProbeMode = 'wide' | 'mid' | 'narrow';
export interface FitCheck {
	mode: 'line' | FitProbeMode;
	/** The window width this reading stands for. */
	width: number;
}

/**
 * THE WIDTHS WHERE NARROWING THE WINDOW GIVES THE ROW ROOM, each with the
 * probe that lays the row out as it is at that width, just above the change.
 * Each is a media query elsewhere (app.css, and the quick note's own
 * stylesheet), and tests/home-header-fit.test.ts holds the two equal. Between
 * two of them the room only shrinks as the window does, so the narrowest
 * width of a stretch speaks for the whole of it.
 */
export const HEADER_FLOORS: readonly {
	width: number;
	mode: FitProbeMode;
	who: 'everyone' | 'signed in' | 'signed out';
	why: string;
}[] = [
	{ width: 900, mode: 'wide', who: 'everyone', why: 'the quick note is in the row from 900px up' },
	{ width: 769, mode: 'mid', who: 'everyone', why: "the side padding and the actions' gaps are the desktop row's from 769px up" },
	{ width: 521, mode: 'narrow', who: 'signed in', why: "a signed-in phone's tools take a row of their own from 520px down" },
	{ width: 401, mode: 'narrow', who: 'signed out', why: "a signed-out phone's keys tighten from 400px down" }
];

/**
 * Every reading an arrangement must pass at this window width: the row as it
 * is just above each floor the window is narrower than, narrowest first (the
 * one most likely to refuse, so a refusal costs the fewest layouts), then the
 * real row here. At 900px and up that is the real row alone.
 */
export function fitChecks(width: number, signedIn: boolean): FitCheck[] {
	const floors = HEADER_FLOORS.filter(
		(f) => width < f.width && (f.who === 'everyone' || (f.who === 'signed in') === signedIn)
	)
		.map((f): FitCheck => ({ mode: f.mode, width: f.width }))
		.sort((a, b) => a.width - b.width);
	return [...floors, { mode: 'line', width }];
}

/**
 * The first arrangement, in preference order, that costs nothing the most
 * compact one would not, in EVERY reading; the most compact one when none
 * does. `measure` lays the header out in the arrangement and the reading it is
 * handed and reads it. With no readings named it is one reading of whatever
 * the header is now. The compact arrangement is read once per reading, and
 * only for the readings a candidate gets as far as.
 */
export function chooseFit<C = null>(
	candidates: HeaderFit[],
	measure: (fit: HeaderFit, check: C) => HeaderReading,
	checks: readonly C[] = [null as C]
): HeaderFit {
	const compact = candidates[candidates.length - 1];
	if (!compact) return { word: false, readout: false };
	if (candidates.length === 1) return compact;
	const floors = new Map<number, HeaderReading>();
	const floorAt = (i: number) => {
		let reading = floors.get(i);
		if (!reading) {
			reading = measure(compact, checks[i]);
			floors.set(i, reading);
		}
		return reading;
	};
	for (const fit of candidates.slice(0, -1)) {
		const passes = checks.every((check, i) => {
			const floor = floorAt(i);
			return costsNothing(measure(fit, check), floor);
		});
		if (passes) return fit;
	}
	return compact;
}

/**
 * The emblem's width at another window width: its own CSS length with every
 * `vw` read against that width, so the page's one statement of it
 * (`clamp(72px, 19vw, 104px)` today) is the only one.
 */
export function lengthAtWidth(length: string, width: number): string {
	return length.replace(/(-?\d*\.?\d+)vw\b/g, (_, n: string) => `${(parseFloat(n) * width) / 100}px`);
}

/* ------------------------------------------------------------------ runtime */

const KEY = '.install-key';
/** What app.css's signed-in phone layout keys on, so the two cannot disagree. */
const SIGNED_IN = '.auth-block .pm-root';
const READOUT = '.header-left .loc';
/** The row's own controls, the ones that must never overlap. */
const CONTROLS = '.header-left, .header-tools > *, .auth-block';

function overlapping(header: HTMLElement): boolean {
	const boxes = [...header.querySelectorAll<HTMLElement>(CONTROLS)]
		.filter((el) => el.getClientRects().length > 0)
		.map((el) => ({ el, r: el.getBoundingClientRect() }));
	for (let i = 0; i < boxes.length; i++) {
		for (let j = i + 1; j < boxes.length; j++) {
			const a = boxes[i];
			const b = boxes[j];
			if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
			const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
			const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
			if (x > SLACK && y > SLACK) return true;
		}
	}
	return false;
}

/**
 * How far the row's controls run past the header's CONTENT box, either side.
 * `scrollWidth` alone cannot say: a control pushed into the header's own side
 * padding is still inside its padding box, so it is not scrollable overflow,
 * and a teacher's row (no class chip to give way) measured 0 there while its
 * last key sat 17.6px into the 32px padding at 780px (review round 2).
 */
function overflowOf(header: HTMLElement): number {
	const cs = getComputedStyle(header);
	const box = header.getBoundingClientRect();
	const left = box.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
	const right = box.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
	let over = header.scrollWidth - header.clientWidth;
	for (const el of header.querySelectorAll<HTMLElement>(CONTROLS)) {
		if (el.getClientRects().length === 0) continue;
		const r = el.getBoundingClientRect();
		over = Math.max(over, r.right - right, left - r.left);
	}
	return Math.max(0, over);
}

function readHeader(header: HTMLElement): HeaderReading {
	const chip = header.querySelector<HTMLElement>('.class-chip-text');
	return {
		height: header.getBoundingClientRect().height,
		overflow: overflowOf(header),
		clipped: chip ? chip.scrollWidth - chip.clientWidth : 0,
		overlap: overlapping(header)
	};
}

function apply(header: HTMLElement, fit: HeaderFit) {
	const key = header.querySelector<HTMLElement>(KEY);
	if (key) key.dataset.fit = fit.word ? 'full' : 'compact';
	header.dataset.readout = fit.readout ? 'shown' : 'hidden';
}

/** Whether the readout draws at this width (app.css hides it below 769px). */
function readoutDraws(header: HTMLElement): boolean {
	const loc = header.querySelector<HTMLElement>(READOUT);
	if (!loc) return false;
	header.dataset.readout = 'shown';
	return loc.getClientRects().length > 0;
}

/**
 * BELOW 900px THE READINGS ARE TAKEN ON A COPY OF THE HEADER, NEVER ON THE
 * HEADER ITSELF (review polish D). A probe at a wider window has to give the
 * header that window's width, and done in place that moved the page: measured
 * on a teacher's phone at 375px, every fit scrolled the page 2px up (700 to
 * 698 to 696, and 8px more a frame later), because the browser keeps its
 * place in a page whose top changes size while it is read (scroll anchoring),
 * and switching that off on the root moved a student's page 40px a fit
 * instead. A copy sits outside the page's flow (`position: fixed`, hidden,
 * inert), at the end of the room, so the same rules reach it, and it is made
 * and removed inside one task, so it is never painted; nothing the reader
 * sees, and nothing the ResizeObserver or the scroll position follows,
 * changes until the answer is written onto the real header.
 *
 * FROM 900px UP THE ONE READING IS THE REAL ROW AT ITS OWN WIDTH, and it is
 * taken in place, as round 2 took every reading: the row is already one line
 * there and 64px tall whatever it holds, so the page cannot move, and a copy
 * would cost a desktop being resized about 5ms a fit (measured 7.4ms against
 * 2.1ms at 1440).
 */
function copyOf(header: HTMLElement): HTMLElement {
	const copy = header.cloneNode(true) as HTMLElement;
	copy.removeAttribute('id');
	copy.setAttribute('aria-hidden', 'true');
	copy.setAttribute('inert', '');
	copy.style.cssText = 'position: fixed; top: 0; left: 0; visibility: hidden; pointer-events: none;';
	(header.parentElement ?? document.body).appendChild(copy);
	return copy;
}

/**
 * Lays the header (or its copy) out for one reading. A probe at a wider
 * window gives the copy that window's width (the header's own width now, plus
 * the difference, so a classic scrollbar is allowed for exactly as the media
 * queries allow for it), and the emblem its width there. Only a copy is ever
 * given a width; a probe is only ever read on a copy.
 */
function layOut(el: HTMLElement, check: FitCheck, now: { window: number; header: number; logo: string | null }, copy: boolean) {
	if (check.mode === 'line') {
		delete el.dataset.fitProbe;
		el.dataset.fitLine = '';
		if (copy) {
			el.style.setProperty('width', `${now.header}px`);
			el.style.removeProperty('--fit-logo');
		}
		return;
	}
	delete el.dataset.fitLine;
	el.dataset.fitProbe = check.mode;
	el.style.setProperty('width', `${now.header + check.width - now.window}px`);
	if (now.logo) el.style.setProperty('--fit-logo', lengthAtWidth(now.logo, check.width));
}

/**
 * THE ACTION, on the home page's `<header>`. It re-runs when the header's box
 * or the groups in it change size, when the web fonts land, when the window
 * resizes, and when a control arrives or leaves (the Install app key renders
 * only after hydration, and only where this browser has an install path).
 *
 * A size change re-runs on a timeout, so a ResizeObserver callback never
 * changes the layout it is reporting on. A control arriving re-runs AT ONCE, in
 * the mutation's own microtask, so the key never paints its word for a frame
 * before it turns into its icon.
 *
 * A WINDOW RESIZE COUNTS ONLY WHEN THE WIDTH MOVED. A phone's address bar
 * showing and hiding resizes the window's HEIGHT during ordinary scrolling,
 * and every reading here is a function of the width (`fitChecks` takes
 * `innerWidth`; the header's own boxes are watched by the ResizeObserver), so a
 * height-only resize re-ran the whole fit, hidden copy included, for nothing.
 */
export function fitHomeHeader(header: HTMLElement) {
	const run = () => {
		if (!header.isConnected) return;
		/* Whether the readout draws here is read on the header itself, as it
		   always was: it changes nothing a reader sees (below 769px the readout
		   never draws, and above it the row is 64px tall whatever it holds). */
		const candidates = fitCandidates({
			key: !!header.querySelector(KEY),
			readout: readoutDraws(header),
			holdReadout: !!header.querySelector(`${READOUT} .loc-panel`)
		});
		if (candidates.length < 2) {
			apply(header, candidates[0] ?? { word: false, readout: false });
			return;
		}
		const logo = header.querySelector<HTMLElement>('.header-left .logo-mark .idea-logo');
		const now = {
			window: window.innerWidth,
			header: header.getBoundingClientRect().width,
			/* The emblem's own length, or failing that its width now in px. */
			logo: logo ? logo.style.width || `${logo.getBoundingClientRect().width}px` : null
		};
		const checks = fitChecks(now.window, !!header.querySelector(SIGNED_IN));
		const copy = checks.length > 1;
		const el = copy ? copyOf(header) : header;
		let fit: HeaderFit;
		try {
			fit = chooseFit(
				candidates,
				(f, check) => {
					layOut(el, check, now, copy);
					apply(el, f);
					return readHeader(el);
				},
				checks
			);
		} finally {
			if (copy) el.remove();
			else delete el.dataset.fitLine;
		}
		apply(header, fit);
	};

	let timer: ReturnType<typeof setTimeout> | null = null;
	const later = () => {
		if (timer) return;
		timer = setTimeout(() => {
			timer = null;
			run();
		}, 0);
	};

	run();

	const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(later) : null;
	const watchSizes = () => {
		if (!ro) return;
		ro.disconnect();
		ro.observe(header);
		for (const el of header.querySelectorAll<HTMLElement>('.header-left, .header-right, .auth-block, .class-chip')) ro.observe(el);
	};
	watchSizes();

	const mo =
		typeof MutationObserver === 'function'
			? new MutationObserver(() => {
					watchSizes();
					run();
				})
			: null;
	for (const el of header.querySelectorAll<HTMLElement>('.header-left, .header-right, .header-tools, .auth-block')) {
		mo?.observe(el, { childList: true });
	}

	let lastWidth = window.innerWidth;
	const onResize = () => {
		if (window.innerWidth === lastWidth) return;
		lastWidth = window.innerWidth;
		later();
	};
	window.addEventListener('resize', onResize);
	document.fonts?.ready.then(later).catch(() => {});

	return {
		destroy() {
			ro?.disconnect();
			mo?.disconnect();
			window.removeEventListener('resize', onResize);
			if (timer) clearTimeout(timer);
		}
	};
}
