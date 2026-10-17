/**
 * WHAT GIVES WAY IN THE HOME HEADER, AND IN WHAT ORDER (ledger 0396, review
 * rounds 1 and 2 and polish D): as the window narrows the lines-of-code readout
 * goes first, then the Install app key's word, and the class chip last, each
 * once, and only where it does not fit there or at some wider width.
 *
 * Silent when it breaks: a wrong order still renders a tidy header, only with a
 * student's class name cut off to keep a decorative readout on screen (which
 * is exactly what shipped before round 1, measured at 900px: 68px of the chip
 * gone), or with the key's word coming and going as a window is resized (round
 * 2: icon, word, icon, word between 1030 and 770). The geometry itself is
 * `npm run verify:browser`'s; what is pinned here is the decision, handed
 * readings a fake header would produce, and the stylesheet rules the browser
 * half rests on: the probe's lengths, and every new header rule naming the
 * home page's own header so the other pages in the room keep theirs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	HEADER_FLOORS,
	chooseFit,
	costsNothing,
	fitCandidates,
	fitChecks,
	lengthAtWidth,
	type FitCheck,
	type HeaderFit,
	type HeaderReading
} from '../src/lib/home-header-fit';

const fits = (list: HeaderFit[]) => list.map((f) => `${f.word ? 'word' : 'icon'}+${f.readout ? 'readout' : 'no-readout'}`);

describe('fitCandidates', () => {
	it('prefers everything, then gives up the readout, then the word, each candidate more compact than the last', () => {
		expect(fits(fitCandidates({ key: true, readout: true }))).toEqual(['word+readout', 'word+no-readout', 'icon+no-readout']);
	});

	it('has no word to give up without a key, and no readout to hide without one', () => {
		expect(fits(fitCandidates({ key: false, readout: true }))).toEqual(['icon+readout', 'icon+no-readout']);
		expect(fits(fitCandidates({ key: true, readout: false }))).toEqual(['word+no-readout', 'icon+no-readout']);
		expect(fits(fitCandidates({ key: false, readout: false }))).toEqual(['icon+no-readout']);
	});

	it("never offers the key's icon beside the readout, except while the readout's own panel holds it open", () => {
		const iconWithReadout = (list: HeaderFit[]) => list.filter((f) => !f.word && f.readout).length;
		expect(iconWithReadout(fitCandidates({ key: true, readout: true }))).toBe(0);
		expect(fits(fitCandidates({ key: true, readout: true, holdReadout: true }))).toEqual(['word+readout', 'icon+readout']);
		expect(fits(fitCandidates({ key: false, readout: true, holdReadout: true }))).toEqual(['icon+readout']);
		// Holding a readout that does not draw holds nothing.
		expect(fits(fitCandidates({ key: true, readout: false, holdReadout: true }))).toEqual(['word+no-readout', 'icon+no-readout']);
	});
});

/**
 * A fake header, a student's: the chip wants 260px, the readout takes 141px
 * with its gap, the key's word 127px and its icon 60px, and the rest of the row
 * is fixed. Whatever does not fit comes off the chip.
 */
function header(room: number) {
	const measured: string[] = [];
	const measure = (f: HeaderFit): HeaderReading => {
		measured.push(fits([f])[0]);
		const used = (f.readout ? 141 : 0) + (f.word ? 127 : 60);
		return { height: 64, overflow: 0, clipped: Math.max(0, used - room), overlap: false };
	};
	return { measure, measured };
}

describe('chooseFit', () => {
	it('with room for everything, keeps everything, and reads only the compact floor and the first choice', () => {
		const h = header(400);
		expect(fits([chooseFit(fitCandidates({ key: true, readout: true }), h.measure)])).toEqual(['word+readout']);
		expect(h.measured).toEqual(['icon+no-readout', 'word+readout']);
	});

	it('gives up the readout before the word (review round 2: a student at 1024px read a bare glyph beside the readout)', () => {
		const h = header(201); // the icon and the readout would fit (60 + 141), and so does the word alone (127)
		expect(fits([chooseFit(fitCandidates({ key: true, readout: true }), h.measure)])).toEqual(['word+no-readout']);
	});

	it('gives up the word before it cuts the class chip', () => {
		expect(fits([chooseFit(fitCandidates({ key: true, readout: true }), header(130).measure)])).toEqual(['word+no-readout']);
		expect(fits([chooseFit(fitCandidates({ key: true, readout: true }), header(100).measure)])).toEqual(['icon+no-readout']);
	});

	it('as the room shrinks a pixel at a time, each gives way once and never comes back: readout, then word', () => {
		const sequence: string[] = [];
		for (let room = 420; room >= 0; room--) {
			const f = fits([chooseFit(fitCandidates({ key: true, readout: true }), header(room).measure)])[0];
			if (sequence[sequence.length - 1] !== f) sequence.push(f);
		}
		expect(sequence).toEqual(['word+readout', 'word+no-readout', 'icon+no-readout']);
	});

	it('with no key, the readout still gives way before the chip (a browser with no install path)', () => {
		const measure = (f: HeaderFit): HeaderReading => ({ height: 64, overflow: 0, clipped: f.readout ? 42 : 0, overlap: false });
		expect(fits([chooseFit(fitCandidates({ key: false, readout: true }), measure)])).toEqual(['icon+no-readout']);
		const roomy = (): HeaderReading => ({ height: 64, overflow: 0, clipped: 0, overlap: false });
		expect(fits([chooseFit(fitCandidates({ key: false, readout: true }), roomy)])).toEqual(['icon+readout']);
	});

	it('when even the most compact header cuts the chip, keeps whatever cuts it no further', () => {
		const measure = (f: HeaderFit): HeaderReading => ({ height: 64, overflow: 0, clipped: f.word ? 80 : 13, overlap: false });
		expect(fits([chooseFit(fitCandidates({ key: true, readout: true }), measure)])).toEqual(['icon+no-readout']);
	});
});

/*
 * A fake header that is read at several window widths, a teacher's (no chip):
 * the word wants 67px more than the icon, and each reading has its own room
 * for it. The real row gains room at a narrower window (a phone's second row),
 * which is the case the probes exist for.
 */
function readings(roomFor: Record<string, number>) {
	const measured: string[] = [];
	const measure = (f: HeaderFit, check: FitCheck): HeaderReading => {
		const key = `${check.mode}@${check.width}`;
		measured.push(`${fits([f])[0]}@${key}`);
		const room = roomFor[key] ?? 0;
		const used = (f.readout ? 141 : 0) + (f.word ? 67 : 0);
		return { height: 64, overflow: Math.max(0, used - room), clipped: 0, overlap: false };
	};
	return { measure, measured };
}

describe('fitChecks', () => {
	it('at 900px and up reads the real row alone', () => {
		expect(fitChecks(1440, true)).toEqual([{ mode: 'line', width: 1440 }]);
		expect(fitChecks(900, false)).toEqual([{ mode: 'line', width: 900 }]);
	});

	it('below each width where the row gains room, also reads the row just above it, narrowest first', () => {
		expect(fitChecks(899, true)).toEqual([
			{ mode: 'wide', width: 900 },
			{ mode: 'line', width: 899 }
		]);
		expect(fitChecks(768, true)).toEqual([
			{ mode: 'mid', width: 769 },
			{ mode: 'wide', width: 900 },
			{ mode: 'line', width: 768 }
		]);
		expect(fitChecks(375, true)).toEqual([
			{ mode: 'narrow', width: 521 },
			{ mode: 'mid', width: 769 },
			{ mode: 'wide', width: 900 },
			{ mode: 'line', width: 375 }
		]);
	});

	it("asks a signed-in window about 520px and a signed-out one about 400px, never the other's", () => {
		expect(fitChecks(520, true).map((c) => c.width)).toEqual([521, 769, 900, 520]);
		expect(fitChecks(521, true).map((c) => c.width)).toEqual([769, 900, 521]);
		expect(fitChecks(520, false).map((c) => c.width)).toEqual([769, 900, 520]);
		expect(fitChecks(400, false).map((c) => c.width)).toEqual([401, 769, 900, 400]);
		expect(fitChecks(401, false).map((c) => c.width)).toEqual([769, 900, 401]);
		expect(fitChecks(375, false).map((c) => c.width)).not.toContain(521);
		expect(fitChecks(375, true).map((c) => c.width)).not.toContain(401);
	});

	it('every probe a check names is one app.css lays out', () => {
		const modes = new Set(HEADER_FLOORS.map((f) => f.mode));
		expect([...modes].sort()).toEqual(['mid', 'narrow', 'wide']);
	});
});

describe('chooseFit across readings', () => {
	const key = { key: true, readout: false };

	it("keeps a teacher's word on a phone when it fits there and at every wider width", () => {
		const h = readings({ 'narrow@521': 120, 'mid@769': 200, 'wide@900': 260, 'line@375': 90 });
		expect(fits([chooseFit(fitCandidates(key), h.measure, fitChecks(375, true))])).toEqual(['word+no-readout']);
	});

	it("gives it up when ANY wider width cannot hold it, though the phone's own row could (no word back at a narrower width)", () => {
		const h = readings({ 'narrow@521': 40, 'mid@769': 200, 'wide@900': 260, 'line@375': 90 });
		expect(fits([chooseFit(fitCandidates(key), h.measure, fitChecks(375, true))])).toEqual(['icon+no-readout']);
		// The narrowest width is asked first, and a refusal there ends it: two layouts, not eight.
		expect(h.measured).toEqual(['icon+no-readout@narrow@521', 'word+no-readout@narrow@521']);
	});

	it('gives it up when the row here cannot hold it, whatever the wider widths say', () => {
		const h = readings({ 'narrow@521': 120, 'mid@769': 200, 'wide@900': 260, 'line@375': 30 });
		expect(fits([chooseFit(fitCandidates(key), h.measure, fitChecks(375, true))])).toEqual(['icon+no-readout']);
	});

	it('as a window narrows a pixel at a time across every floor, each gives way once: readout, then word', () => {
		/* Room for the actions grows back at 899 (+59), 768 (+37) and 520 (+179): the real row's shape. */
		const roomAt = (w: number) => (w >= 900 ? w - 680 : w >= 769 ? w - 620 : w >= 521 ? w - 582 : w - 402);
		const measure = (f: HeaderFit, check: FitCheck): HeaderReading => {
			const room = roomAt(check.width);
			const used = (f.readout ? 141 : 0) + (f.word ? 67 : 0);
			return { height: 64, overflow: Math.max(0, used - room), clipped: 0, overlap: false };
		};
		const sequence: string[] = [];
		for (let w = 1440; w >= 320; w--) {
			const f = fits([chooseFit(fitCandidates({ key: true, readout: w >= 769 }), measure, fitChecks(w, true))])[0];
			if (sequence[sequence.length - 1] !== f) sequence.push(f);
		}
		expect(sequence).toEqual(['word+readout', 'word+no-readout', 'icon+no-readout']);
		// The negative control: the real row alone brings the word back where the room grows back.
		const alone: string[] = [];
		for (let w = 1440; w >= 320; w--) {
			const f = fits([chooseFit(fitCandidates({ key: true, readout: w >= 769 }), (x) => measure(x, { mode: 'line', width: w }))])[0];
			if (alone[alone.length - 1] !== f) alone.push(f);
		}
		expect(alone.length).toBeGreaterThan(3);
		expect(alone.filter((f) => f === 'word+no-readout').length).toBeGreaterThan(1);
	});
});

describe('lengthAtWidth', () => {
	it("reads the emblem's own length at another window width", () => {
		expect(lengthAtWidth('clamp(72px, 19vw, 104px)', 900)).toBe('clamp(72px, 171px, 104px)');
		expect(lengthAtWidth('clamp(72px, 19vw, 104px)', 401)).toBe('clamp(72px, 76.19px, 104px)');
		expect(lengthAtWidth('104px', 521)).toBe('104px');
		expect(lengthAtWidth('calc(0.5vw + 2vw)', 200)).toBe('calc(1px + 4px)');
	});

	it("is the page's own emblem length, so the probe's emblem is the real one's", () => {
		const page = readFileSync(join(__dirname, '..', 'src', 'routes', '+page.svelte'), 'utf8');
		expect(page).toMatch(/<a class="logo logo-mark"[^>]*><AnimatedLogo width="clamp\(72px, 19vw, 104px\)" \/><\/a>/);
	});
});

describe('costsNothing', () => {
	const floor: HeaderReading = { height: 64, overflow: 0, clipped: 0, overlap: false };
	it('refuses a taller header, a sideways overflow, a deeper cut and an overlap, and allows half a pixel of rounding', () => {
		expect(costsNothing({ ...floor }, floor)).toBe(true);
		expect(costsNothing({ ...floor, height: 64.4 }, floor)).toBe(true);
		expect(costsNothing({ ...floor, height: 75.5 }, floor)).toBe(false);
		expect(costsNothing({ ...floor, overflow: 3 }, floor)).toBe(false);
		expect(costsNothing({ ...floor, clipped: 8 }, floor)).toBe(false);
		expect(costsNothing({ ...floor, overlap: true }, floor)).toBe(false);
		expect(costsNothing({ ...floor, overlap: true }, { ...floor, overlap: true })).toBe(true);
	});
});

/* ------------------------------------------------------------- app.css */

const CSS = readFileSync(join(__dirname, '..', 'src', 'app.css'), 'utf8');

interface Rule {
	media: string | null;
	selector: string;
	body: string;
}

/** Every style rule, with the @media it sits in. Other at-rule blocks are skipped. */
function rules(css: string): Rule[] {
	const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const out: Rule[] = [];
	let media: string | null = null;
	let buf = '';
	let i = 0;
	while (i < src.length) {
		const c = src[i];
		if (c === ';') {
			buf = '';
			i++;
		} else if (c === '{') {
			const head = buf.trim();
			buf = '';
			if (head.startsWith('@media')) {
				media = head;
				i++;
			} else if (head.startsWith('@')) {
				let depth = 1;
				i++;
				while (i < src.length && depth > 0) {
					if (src[i] === '{') depth++;
					else if (src[i] === '}') depth--;
					i++;
				}
			} else {
				const close = src.indexOf('}', i);
				out.push({ media, selector: head.replace(/\s+/g, ' '), body: src.slice(i + 1, close) });
				i = close + 1;
			}
		} else if (c === '}') {
			media = null;
			buf = '';
			i++;
		} else {
			buf += c;
			i++;
		}
	}
	return out;
}

const ALL = rules(CSS);
function topLevel(selector: string): string {
	const found = ALL.filter((r) => r.media === null && r.selector === selector);
	if (!found.length) throw new Error(`no top-level rule ${selector}`);
	return found[0].body;
}
const decl = (body: string, prop: string) => body.match(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;]+);`))?.[1].trim();

function inMedia(media: string, selector: string): string {
	const found = ALL.filter((r) => r.media === media && r.selector === selector);
	if (!found.length) throw new Error(`no rule ${selector} in ${media}`);
	return found[0].body;
}
const QUICK_NOTE = readFileSync(join(__dirname, '..', 'src', 'lib', 'notebook', 'QuickNote.svelte'), 'utf8');

describe('the readings the fit measures against', () => {
	const probe = topLevel('.legacy-index header.home-header[data-fit-probe]');
	const probeRight = topLevel('.legacy-index header.home-header[data-fit-probe] .header-right');

	it("`wide` and `mid` lay the header out as the desktop row: its lengths are the desktop header's own", () => {
		const header = topLevel('.legacy-index header');
		const right = topLevel('.legacy-index .header-right');
		// `padding: 0 2rem` on the desktop header; the probe states the inline half.
		const desktopInline = decl(header, 'padding')!.split(/\s+/)[1];
		expect(desktopInline).toBe('2rem');
		expect(decl(probe, 'padding-inline')).toBe(desktopInline);
		expect(decl(probe, 'gap')).toBe(decl(header, 'gap'));
		expect(decl(probeRight, 'gap')).toBe(decl(right, 'gap'));
		expect(decl(probe, 'flex-wrap')).toBe('nowrap');
		expect(decl(probe, 'display')).toBe('flex');
		expect(decl(probeRight, 'display')).toBe('flex');
	});

	it("`narrow` is the row from 768px down, on one line: the 768px block's own lengths", () => {
		const header = inMedia('@media (max-width: 768px)', '.legacy-index header');
		const right = inMedia('@media (max-width: 768px)', '.legacy-index .header-right');
		const narrowInline = decl(header, 'padding')!.split(/\s+/)[1];
		expect(narrowInline).toBe('1rem');
		expect(decl(topLevel(".legacy-index header.home-header[data-fit-probe='narrow']"), 'padding-inline')).toBe(narrowInline);
		expect(decl(topLevel(".legacy-index header.home-header[data-fit-probe='narrow'] .header-right"), 'gap')).toBe(decl(right, 'gap'));
		// The header's own gap does not change at 768, so the probe's 1rem holds.
		expect(decl(header, 'gap')).toBeUndefined();
	});

	it('draws the quick note only where the row has it: from 900px up, never from 521 to 899', () => {
		expect(decl(topLevel('.legacy-index header.home-header[data-fit-probe] .qn-home'), 'display')).toBe('revert');
		const hidden = topLevel(
			".legacy-index header.home-header[data-fit-probe='mid'] .qn-home, .legacy-index header.home-header[data-fit-probe='narrow'] .qn-home"
		);
		expect(decl(hidden, 'display')).toBe('none');
		// Where the quick note's own stylesheet takes it out of the row: 521 to 899.98px.
		expect(QUICK_NOTE).toMatch(/@media \(min-width: 521px\) and \(max-width: 899\.98px\) \{\s*\.qn-home \{\s*display: none;/);
	});

	it('gives the emblem its width at the probed window, and holds the real row on one line', () => {
		expect(decl(topLevel('.legacy-index header.home-header[data-fit-probe] .logo-mark .idea-logo'), 'width')).toBe('var(--fit-logo) !important');
		expect(decl(topLevel('.legacy-index header.home-header[data-fit-line]'), 'flex-wrap')).toBe('nowrap');
	});

	it('every floor is a width where a media query gives the row room, and the media queries are where the floors say', () => {
		const at = (w: number) => HEADER_FLOORS.find((f) => f.width === w);
		expect(HEADER_FLOORS.map((f) => f.width)).toEqual([900, 769, 521, 401]);
		// 900: the quick note joins the row (QuickNote.svelte, above).
		expect(at(900)?.mode).toBe('wide');
		// 769: the side padding halves and the gaps close at 768.
		expect(at(769)?.mode).toBe('mid');
		expect(decl(inMedia('@media (max-width: 768px)', '.legacy-index header'), 'padding')).toBe('0.8rem 1rem');
		// 521: a signed-in phone's header is a grid from 520 down.
		expect(at(521)).toMatchObject({ mode: 'narrow', who: 'signed in' });
		expect(decl(inMedia('@media (max-width: 520px)', '.legacy-index header:has(.auth-block .pm-root)'), 'display')).toBe('grid');
		// 401: a signed-out phone's keys tighten from 400 down, in ONE step.
		expect(at(401)).toMatchObject({ mode: 'narrow', who: 'signed out' });
		const tight = ALL.filter((r) => r.media === '@media (max-width: 400px)' && r.selector.includes(':not(:has(.pm-root))'));
		expect(tight.length).toBe(3);
		const narrowerSteps = ALL.filter((r) => /@media \(max-width: (3\d\d)px\)/.test(r.media ?? '') && r.selector.includes('header.home-header'));
		expect(narrowerSteps).toEqual([]);
	});
});

describe("the home header's rules", () => {
	const start = CSS.indexOf("/* THE HOME PAGE'S HEADER (ledger 0396).");
	const end = CSS.indexOf("/* THE HOME HEADER'S CONTROLS TAKE THE 44px FLOOR (ledger 0297).");
	const own = rules(CSS.slice(start, end));
	const selectors = own.flatMap((r) => r.selector.split(',').map((s) => s.trim()));

	it("name the home page's own header, every one, so /archive, /fsp/class and the admin console keep theirs", () => {
		expect(start).toBeGreaterThan(0);
		expect(end).toBeGreaterThan(start);
		expect(selectors.length).toBe(20);
		expect(selectors.filter((s) => !s.startsWith('.legacy-index header.home-header'))).toEqual([]);
	});

	it('the narrow-width rules that give the real row room stand down for the probe', () => {
		const narrow = own.filter((r) => r.media !== null);
		expect(narrow.length).toBe(5);
		expect(narrow.filter((r) => !r.selector.includes(':not([data-fit-probe])'))).toEqual([]);
	});

	it('and the shared rules for every page in the room are as they were: the actions wrap inside themselves', () => {
		expect(decl(topLevel('.legacy-index .header-right'), 'flex-wrap')).toBe('wrap');
		expect(decl(topLevel('.legacy-index .header-left'), 'flex-shrink')).toBeUndefined();
		// The positive control: the home header's own row does not.
		expect(decl(topLevel('.legacy-index header.home-header .header-right'), 'flex-wrap')).toBe('nowrap');
	});
});
