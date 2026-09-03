// tests/home-order-and-accent.test.ts
//
// TWO HOME-PAGE GUARANTEES WHOSE REGRESSION IS SILENT.
//
// 1. THE SECTION ORDER. Apps sits above Your Classes for a viewer who manages
//    any section, and below it for everyone else. A regression either way looks
//    completely ordinary on screen -- nobody holds both roles at once, and the
//    only symptom is a scroll distance nobody measures.
//
// 2. THE ACCENT MECHANISM. Launcher cards DO carry a per-app accent, and that
//    is deliberate: GAUNTLET, GREENLINE and VANGUARD carry their product
//    colours and the FRC card carries FIRST's brand. What is pinned here is
//    HOW it arrives. It used to arrive as an inline style written from a
//    `PortalApp.theme` field, and an inline custom property beats every class
//    rule -- so `.app-card`'s shared brass/gold pair was dead code, no later
//    rule could correct one card, and nothing said so for months. It is now a
//    stylesheet rule keyed on the card's `data-app` attribute, which sits
//    inside the cascade: the shared pair is a live DEFAULT for the apps that
//    declare nothing, and one selector overrides one card.
//
//    Going back to inline is the regression this file exists to redden, and it
//    is a silent one: the eleven wrong colours painted for months in front of
//    everyone. A constant only makes the right thing available.
//
// SSR-ONLY, the classroom-body-render.test.ts pattern: `svelte/server`'s
// render() mounts the REAL components and hands back markup. There is no DOM
// harness here, so "which comes first" is asserted as DOCUMENT ORDER in that
// markup, which is what a screen reader and the tab order follow and therefore
// the thing actually worth pinning.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import Home from '../src/routes/+page.svelte';
import AppLauncher from '$lib/AppLauncher.svelte';
import { PORTAL_APPS, visibleApps, type PortalApp } from '$lib/portal-apps';
import type { ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';

const TEACHER = 'tvargas@boscotech.edu';
const STUDENT = 'alice@boscotech.net';

function section(id: string, teacherEmail: string): ClassroomSection {
	return {
		id,
		course_id: 'c1',
		label: `Period ${id}`,
		block: null,
		teacher_email: teacherEmail,
		active: true,
		course: { id: 'c1', code: 'IDEA100', title: 'Intro to Engineering Design', active: true }
	};
}

function item(sectionId: string): ClassroomItem {
	return {
		id: `${sectionId}-item`,
		kind: 'assignment',
		title: 'Checkpoint 1',
		body: '',
		points: 10,
		due_at: null,
		category: null,
		author_email: TEACHER,
		author_name: 'T. Vargas',
		published: true,
		pinned: false,
		sort_order: 1,
		created_at: '2026-10-01T12:00:00Z',
		first_published_at: '2026-10-01T12:00:00Z',
		edited_at: null,
		updated_at: '2026-10-01T12:00:00Z',
		postings: [{ section_id: sectionId }],
		attachments: [],
		links: []
	} as unknown as ClassroomItem;
}

/**
 * THE FOUR VIEWERS, AND WHY THERE ARE FOUR.
 *
 * Two would be enough to check the order flips, and two is what this file had
 * when a mutation keying the whole decision on `profile.role` instead of on
 * what the viewer MANAGES reddened nothing: in a fixture where the teacher
 * viewer is also the teacher of record, role and management are the same fact
 * and the suite could not tell the two designs apart.
 *
 * They come apart for two people who really exist here:
 *
 *   * `staff-no-sections` -- a `@boscotech.edu` account (role `teacher`, which
 *     this domain grants automatically and which on its own grants NOTHING) who
 *     is teacher of record of no section. They manage nothing, so the feed is
 *     their own student-shaped list and it keeps the top.
 *   * `admin-not-teacher` -- an admin whose profile role is not `teacher`.
 *     classroom_manages_section is true for them on every section, so they get
 *     the launcher first.
 */
type Viewer = 'teacher-of-record' | 'student' | 'staff-no-sections' | 'admin-not-teacher';

function homeData(viewer: Viewer) {
	// Every section belongs to TEACHER; only the viewer changes.
	const sections = [section('s1', TEACHER)];
	const email = viewer === 'teacher-of-record' ? TEACHER : STUDENT;
	const role =
		viewer === 'teacher-of-record' || viewer === 'staff-no-sections' ? 'teacher' : 'student';
	return {
		classroomReady: true,
		feedSections: sections,
		feedItems: sections.map((s) => item(s.id)),
		feedSubmissions: [],
		claims: { sub: 'u1', email },
		userProfile: {
			id: 'u1',
			role,
			display_name: 'Viewer',
			avatar: null,
			pathway: 'IDEA',
			preferences: {}
		},
		isAdmin: viewer === 'admin-not-teacher'
	};
}

function drawHome(viewer: Viewer): string {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return render(Home as any, { props: { data: homeData(viewer) } }).body;
}

/**
 * Where each block STARTS in the markup. -1 means it did not render at all.
 *
 * Matched on the opening tag, not on the class name alone: `launcher-bar`,
 * `launcher-title` and `launcher-actions` all begin `class="launcher`, so a
 * substring count over that prefix reads four where it means one.
 */
const APPS_TAG = '<section class="launcher';
const CLASSES_TAG = '<div class="courses';

function order(html: string) {
	return { apps: html.indexOf(APPS_TAG), classes: html.indexOf(CLASSES_TAG) };
}

const ALL_VIEWERS: Viewer[] = [
	'teacher-of-record',
	'student',
	'staff-no-sections',
	'admin-not-teacher'
];

describe('home page: which block comes first', () => {
	it('renders both blocks for every viewer (positive control)', () => {
		for (const viewer of ALL_VIEWERS) {
			const o = order(drawHome(viewer));
			expect(o.apps, `${viewer}: no Apps section rendered`).toBeGreaterThan(-1);
			expect(o.classes, `${viewer}: no Your Classes section rendered`).toBeGreaterThan(-1);
		}
	});

	it('puts Apps FIRST for a viewer who manages a section', () => {
		const o = order(drawHome('teacher-of-record'));
		expect(o.apps).toBeLessThan(o.classes);
	});

	it('leaves the student order alone: Your Classes first', () => {
		// The one thing the feed does that nothing else does is deep-link a
		// student into the exact item that is due. It keeps the top.
		const o = order(drawHome('student'));
		expect(o.classes).toBeLessThan(o.apps);
	});

	it('keys on what the viewer MANAGES, not on their role', () => {
		// Staff who teach no section manage nothing, so their feed is a student's
		// feed and it keeps the top -- even though their profile role is
		// `teacher`, which the email domain grants automatically and which on its
		// own grants nothing (CLAUDE.md, ADMIN TIER).
		const staff = order(drawHome('staff-no-sections'));
		expect(staff.classes).toBeLessThan(staff.apps);

		// An admin manages every section whatever their role says, so they get
		// the launcher first.
		const admin = order(drawHome('admin-not-teacher'));
		expect(admin.apps).toBeLessThan(admin.classes);
	});

	it('renders each block exactly ONCE, whichever order it chose', () => {
		// Two `{#if}` copies of the feed would pass the order assertions above
		// and be two places to fix everything after.
		for (const viewer of ALL_VIEWERS) {
			const html = drawHome(viewer);
			expect(html.split(APPS_TAG).length - 1, viewer).toBe(1);
			expect(html.split(CLASSES_TAG).length - 1, viewer).toBe(1);
		}
	});
});

/**
 * THE STYLESHEET IS READ AS SOURCE TEXT, ON PURPOSE.
 *
 * `svelte/server`'s render() returns markup, not styles -- Svelte extracts a
 * component <style> block at compile time -- so there is no rendered CSSOM here
 * to interrogate, and jsdom does not resolve custom properties through the
 * cascade even when there is. Whether these rules actually PAINT is a browser
 * measurement, and it was one: eleven cards swept in the pane at 1440px and
 * 375px, every accent-derived text clearing 4.5:1 and every load-bearing edge
 * 3:1, resolved by painting each colour to a canvas (docs/HISTORY.md).
 *
 * What this file adds is the thing a browser pass cannot catch on a Tuesday six
 * months from now: that the values are still DECLARED where the cascade can
 * reach them, rather than stamped onto the element where nothing can.
 */
const LAUNCHER_SRC = readFileSync(new URL('../src/lib/AppLauncher.svelte', import.meta.url), 'utf8');
const LAUNCHER_CSS = LAUNCHER_SRC.slice(LAUNCHER_SRC.lastIndexOf('<style>'));

/** App ids with a `[data-app=...]` rule of their own, of any kind. */
const declaringIds = () => {
	const ids = new Set<string>();
	for (const m of LAUNCHER_CSS.matchAll(/\.app-card\[data-app='([a-z-]+)'\]/g)) ids.add(m[1]);
	return ids;
};

/**
 * The five per-card custom properties a `[data-app=...]` rule exists to carry.
 * A rule that declares NONE of them is a rule that does nothing, which is the
 * thing worth reddening -- as against a rule that declares a texture and takes
 * the shared accent, which is a legitimate combination and is what the notebook
 * card is: brass is correct for it, and restating the default is how a default
 * drifts.
 */
const PER_CARD_PROPS = [
	'--acc-primary',
	'--acc-secondary',
	'--acc-ink',
	'--card-texture',
	'--card-texture-size'
];

/** App ids whose rule re-pins the identity PAIR, rather than only a texture. */
const accentIds = () => {
	const ids = new Set<string>();
	for (const id of declaringIds()) if (ruleFor(id).includes('--acc-primary:')) ids.add(id);
	return ids;
};

/** The body of one `[data-app=...]` rule, so a declaration can be attributed. */
function ruleFor(id: string): string {
	const at = LAUNCHER_CSS.indexOf(`.app-card[data-app='${id}']`);
	if (at < 0) return '';
	const open = LAUNCHER_CSS.indexOf('{', at);
	return LAUNCHER_CSS.slice(open, LAUNCHER_CSS.indexOf('}', open));
}

function launcherHtml(): string {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return render(AppLauncher as any, { props: { onRequireSignIn: () => {} } }).body;
}

describe('launcher accents are stylesheet data, never an inline style', () => {
	it('stamps NO accent custom property on any card, so the cascade still decides', () => {
		// THE REJECTED ALTERNATIVE, and the one this whole file is aimed at. An
		// inline custom property outranks every stylesheet rule, including the
		// `.app-card` default and any later per-card override, so putting the pair
		// back on the element would make both unreachable exactly as before.
		const html = launcherHtml();
		const cards = html.split('class="app-card').length - 1;
		// Positive control: "no card carries X" is worth nothing if no card rendered.
		expect(cards).toBe(visibleApps(false).length);
		expect(cards).toBeGreaterThan(5);
		for (const prop of PER_CARD_PROPS) {
			expect(html, `${prop} is stamped inline on a card`).not.toContain(`${prop}:`);
		}
	});

	it('gives every card the `data-app` attribute the rules key on', () => {
		// A rule keyed on an attribute no card carries is a rule that never
		// matches, and the card would silently fall back to the shared default.
		const html = launcherHtml();
		for (const app of visibleApps(false)) {
			expect(html, `${app.id}: no data-app attribute`).toContain(`data-app="${app.id}"`);
		}
	});

	it('declares no colour field on any PORTAL_APPS entry', () => {
		// The paint belongs to the stylesheet. A colour field here is how it gets
		// read back into a style attribute again.
		expect(PORTAL_APPS.length).toBeGreaterThan(5); // positive control
		const offenders = PORTAL_APPS.filter((app) =>
			Object.keys(app).some((k) => /theme|colou?r|accent|palette/i.test(k))
		).map((a) => a.id);
		expect(offenders).toEqual([]);
	});

	it('keeps the shared pair as a LIVE default, not a value every app restates', () => {
		// Both halves matter. The `.app-card` rule must declare the pair, AND some
		// real app must be taking it -- a default every entry overrides is the dead
		// code this replaced, wearing a stylesheet instead of a style attribute.
		const base = LAUNCHER_CSS.slice(LAUNCHER_CSS.indexOf('.app-card {'));
		expect(base).toContain('--acc-primary: var(--gold);');
		expect(base).toContain('--acc-secondary: var(--green);');

		// "Takes the default" is measured against the ACCENT, not against having a
		// rule at all: a card may declare a texture and still paint its accent
		// from `.app-card`, which is exactly what the notebook card does.
		const accents = accentIds();
		const takingDefault = visibleApps(true)
			.map((a) => a.id)
			.filter((id) => !accents.has(id));
		expect(takingDefault.length, 'every app declares its own accent').toBeGreaterThan(0);

		// POSITIVE CONTROL for the line above: the same check must be able to SEE a
		// declared accent, or "some app takes the default" passes because the sweep
		// found nothing at all.
		expect(accents.size, 'no app declares an accent').toBeGreaterThan(0);

		// And no per-card rule may be inert. This used to require --acc-primary of
		// every declaring id, which a texture-only rule legitimately breaks; the
		// rule that survives is the one that was actually meant -- a
		// `[data-app=...]` block has to carry at least one of the five properties
		// the mechanism reads, or it is a selector painting nothing.
		for (const id of declaringIds()) {
			const body = ruleFor(id);
			expect(
				PER_CARD_PROPS.some((prop) => body.includes(`${prop}:`)),
				`${id}: rule declares none of the per-card properties`
			).toBe(true);
		}
	});

	/**
	 * THE FOUNDRY CARD, WHICH IS THE NEWEST ONE AND THEREFORE THE ONE MOST
	 * LIKELY TO BE ADDED WRONG.
	 *
	 * The rule this file exists for is that a card QUOTES ITS OWN ROOM or
	 * declares nothing: a pair invented for an app that has no colours of its
	 * own is inventing an identity for the app.
	 *
	 * THIS ASSERTION USED TO PIN --green / --cyan BY TOKEN, and said in words
	 * that taking them by token rather than as hex was "what makes 'quotes its
	 * room' checkable". Both halves have been rewritten, because the premise
	 * was wrong in two ways that the token check could not see.
	 *
	 * GREEN IS NOT THE FORGE'S IDENTITY, IT IS ONE OF ITS STATES.
	 * `src/lib/foundry/forge.css` states the room's identity outright -- "the
	 * warmth is the room's identity", a near-black iron plate with a warm cast
	 * -- and spends --green on `--fg-st-done-ink` and `--fg-st-live-ink`, the
	 * approved and live states. A card painted in a room's state colour is
	 * quoting the room about as well as a card painted in its error red.
	 *
	 * AND ON THIS PAGE GREEN CANNOT IDENTIFY ANYTHING. GAUNTLET, VANGUARD,
	 * GREENLINE and dashboard/admin are already spending it, and --green
	 * resolves to #78b870, which is the admin card's literal -- so the Foundry
	 * card and the admin card were painting the same hex. That is asserted
	 * below rather than described, because it is the property that made the
	 * old pair a defect rather than a preference.
	 *
	 * SO THE CARD TAKES THE POUR, AS HEX, AND THE HEX IS FORCED. The `--fg-*`
	 * tokens are declared on `.fg-root`; the launcher is not inside it, so
	 * `var(--fg-heat)` here resolves to nothing. Every card that quotes a room
	 * re-types its room's values for exactly that reason, which is why the old
	 * "no hex" clause could never have been the general rule it was written as.
	 */
	it('gives Foundry its own room\'s pour, and not a fifth green', () => {
		const rule = ruleFor('foundry');
		expect(rule, 'the foundry card declares no rule at all').not.toBe('');
		// forge.css's own --fg-heat and --fg-heat-ember.
		expect(rule).toContain('--acc-primary: #f6952f;');
		expect(rule).toContain('--acc-secondary: #c65a1d;');

		// THE VALUES ARE THE ROOM'S, read out of forge.css rather than restated
		// here, so this cannot pass against a pair that merely looks forge-ish.
		const forge = readFileSync('src/lib/foundry/forge.css', 'utf8');
		expect(forge).toContain('--fg-heat: #f6952f;');
		expect(forge).toContain('--fg-heat-ember: #c65a1d;');
	});

	it('does not paint the Foundry card the same colour as another card', () => {
		// THE DEFECT, PINNED AS A PROPERTY RATHER THAN AS THE ONE PAIR THAT HAD
		// IT. --green is #78b870 and the admin card declares #78b870, so the old
		// foundry rule was the admin rule in different words. Asserting "not
		// var(--green)" would only forbid the spelling; this forbids the
		// collision, and bites for any future card that reintroduces one.
		const GREEN = '#78b870';
		const foundry = ruleFor('foundry');
		expect(foundry).not.toContain('--acc-primary: var(--green);');
		expect(foundry).not.toContain(`--acc-primary: ${GREEN};`);

		// The census this is protecting, so a reader can see what "a fifth
		// green" meant: four cards already spend one.
		const greens = ['gauntlet', 'vanguard', 'greenline', 'admin'].filter((id) =>
			/--acc-primary:\s*(#00ff41|#2ae57e|#78b870)/.test(ruleFor(id))
		);
		expect(greens).toHaveLength(4);
	});

	it('gives the Foundry card an animated mark that hides nothing at rest', () => {
		// EVERY app mark in $lib/marks animates under
		// prefers-reduced-motion: no-preference AND is fully visible with the
		// animation cancelled -- a base state that hides an element waiting for a
		// frame is invisible to a reduced-motion reader. FRC is the documented
		// exception and does not animate at all.
		const mark = readFileSync('src/lib/marks/FoundryMark.svelte', 'utf8');
		expect(mark).toContain('prefers-reduced-motion: no-preference');
		expect(mark).toMatch(/animation:\s*fd-/);

		// Nothing may sit at opacity 0 or a transform OUTSIDE a keyframe: that is
		// what "hidden at rest" looks like. The keyframes themselves legitimately
		// pass through opacity 0 mid-cycle.
		const styleBody = mark.slice(mark.indexOf('<style>'));
		const outsideKeyframes = styleBody.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
		expect(outsideKeyframes).not.toMatch(/opacity:\s*0/);

		// And the launcher actually renders it, rather than falling through to
		// the generic inline fallback glyph.
		const launcher = readFileSync('src/lib/AppLauncher.svelte', 'utf8');
		expect(launcher).toContain("id === 'foundry'");
		expect(launcher).toContain('<FoundryMark />');

		// THE MARK STOPS WHEN NOBODY CAN SEE IT (the MoltenSeam contract, scaled
		// down to a card): an IntersectionObserver plus a visibilitychange
		// listener set data-paused, which pauses the animation. The regression
		// is silent in the worst way -- a mark that quietly stops pausing looks
		// identical on screen and only shows up as compositor work on hidden
		// tabs and scrolled-away grids, which nobody files a bug about.
		expect(mark).toContain('IntersectionObserver');
		expect(mark).toContain('visibilitychange');
		expect(mark).toContain('data-paused');
		expect(mark).toContain('animation-play-state: paused');
	});

	/**
	 * IDEA MAPS, WHICH IS THE FIFTH GREEN AND THEREFORE THE ONE THAT HAS TO
	 * PROVE IT IS TELLABLE APART.
	 *
	 * Mr. Pina closed the maps accent on 2026-09-02: it is green, because green
	 * is the pathway's identity. That decision is not what this asserts. What
	 * it asserts is the thing a decision like that cannot settle on its own --
	 * that four cards were already spending a green, and that the one chosen is
	 * further from all of them than the closest pair the page ALREADY ships.
	 *
	 * THE THRESHOLD COMES FROM THE OTHER CARDS, NEVER FROM THE MAPS RULE. A
	 * number written down here would be a ratchet: whatever green somebody
	 * picked next would become the standard. The bar is the launcher's own
	 * tightest existing pair, computed from the stylesheet on every run, so a
	 * future card that crowds the board fails this whether or not it is Maps --
	 * and improving the board raises the bar automatically.
	 *
	 * THE COLOUR MATHS IS LOCAL AND IS NOT A SECOND COPY OF THE BROWSER
	 * HARNESS'S. `tools/browser-verify` measures a PAINTED PIXEL by compositing
	 * to a canvas, which is the only honest way to read a `color-mix()` over a
	 * real ground; this reads the AUTHORED hex out of the stylesheet, with no
	 * browser in the room. Two different questions, two instruments, and the
	 * browser pass is still what reports the rendered numbers.
	 */
	const hexChannels = (h: string): [number, number, number] => {
		const v = h.replace('#', '');
		return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255) as [number, number, number];
	};
	const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
	const luminance = (h: string) => {
		const [r, g, b] = hexChannels(h).map(linear);
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	};
	const contrast = (a: string, b: string) => {
		const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
		return (hi + 0.05) / (lo + 0.05);
	};
	/** sRGB -> CIE Lab (D65), the input CIEDE2000 is defined over. */
	const toLab = (h: string): [number, number, number] => {
		const [r, g, b] = hexChannels(h).map(linear);
		let X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
		const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
		let Z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
		X /= 0.95047;
		Z /= 1.08883;
		const f = (t: number) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
		const [fx, fy, fz] = [f(X), f(Y), f(Z)];
		return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
	};
	const deltaE00 = (h1: string, h2: string): number => {
		const [L1, a1, b1] = toLab(h1);
		const [L2, a2, b2] = toLab(h2);
		const C1 = Math.hypot(a1, b1);
		const C2 = Math.hypot(a2, b2);
		const Cb = (C1 + C2) / 2;
		const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
		const a1p = (1 + G) * a1;
		const a2p = (1 + G) * a2;
		const C1p = Math.hypot(a1p, b1);
		const C2p = Math.hypot(a2p, b2);
		const ang = (y: number, x: number) => {
			if (y === 0 && x === 0) return 0;
			const d = (Math.atan2(y, x) * 180) / Math.PI;
			return d < 0 ? d + 360 : d;
		};
		const h1p = ang(b1, a1p);
		const h2p = ang(b2, a2p);
		const dLp = L2 - L1;
		const dCp = C2p - C1p;
		let dhp = 0;
		if (C1p * C2p !== 0) {
			dhp = h2p - h1p;
			if (dhp > 180) dhp -= 360;
			else if (dhp < -180) dhp += 360;
		}
		const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);
		const Lbp = (L1 + L2) / 2;
		const Cbp = (C1p + C2p) / 2;
		let hbp: number;
		if (C1p * C2p === 0) hbp = h1p + h2p;
		else {
			hbp = (h1p + h2p) / 2;
			if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 180 : -180;
		}
		const T =
			1 -
			0.17 * Math.cos(((hbp - 30) * Math.PI) / 180) +
			0.24 * Math.cos((2 * hbp * Math.PI) / 180) +
			0.32 * Math.cos(((3 * hbp + 6) * Math.PI) / 180) -
			0.2 * Math.cos(((4 * hbp - 63) * Math.PI) / 180);
		const dTh = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
		const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
		const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
		const Sc = 1 + 0.045 * Cbp;
		const Sh = 1 + 0.015 * Cbp * T;
		const Rt = -Math.sin((2 * dTh * Math.PI) / 180) * Rc;
		return Math.sqrt(
			(dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh)
		);
	};
	/** Composite a colour at `alpha` over an opaque ground. */
	const over = (fg: string, alpha: number, bg: string) => {
		const f = hexChannels(fg);
		const b = hexChannels(bg);
		return (
			'#' +
			f
				.map((c, i) =>
					Math.round((c * alpha + b[i] * (1 - alpha)) * 255)
						.toString(16)
						.padStart(2, '0')
				)
				.join('')
		);
	};

	/** Every literal hex an accent rule declares as its --acc-primary. */
	const declaredAccents = (): Record<string, string> => {
		const out: Record<string, string> = {};
		for (const id of declaringIds()) {
			const m = /--acc-primary:\s*(#[0-9a-f]{6})\s*;/i.exec(ruleFor(id));
			if (m) out[id] = m[1].toLowerCase();
		}
		return out;
	};

	it('gives Maps a green nothing else on the launcher is already spending', () => {
		const rule = ruleFor('maps');
		expect(rule, 'the maps card declares no rule at all').not.toBe('');
		expect(rule).toContain('--acc-primary: #40e3b1;');
		// The second stop is --gold BY TOKEN, because it is the portal's own
		// token rather than a colour picked for this card, and /maps spends it
		// as a STATE (the found thing) exactly as the shell does.
		expect(rule).toContain('--acc-secondary: var(--gold);');

		const accents = declaredAccents();
		expect(accents.maps, 'no literal accent parsed off the maps rule').toBe('#40e3b1');
		// POSITIVE CONTROL: the parser must be able to SEE the other cards, or
		// "further than every rival" passes because it found no rivals.
		expect(Object.keys(accents).length, 'accent parser found nothing').toBeGreaterThan(5);

		// THE BAR IS THE BOARD'S OWN TIGHTEST PAIR, computed without Maps in it.
		const others = Object.entries(accents).filter(([id]) => id !== 'maps');
		let tightestExisting = Infinity;
		for (let i = 0; i < others.length; i += 1) {
			for (let j = i + 1; j < others.length; j += 1) {
				if (others[i][1] === others[j][1]) continue; // gauntlet and vanguard are one colour on purpose
				tightestExisting = Math.min(tightestExisting, deltaE00(others[i][1], others[j][1]));
			}
		}
		expect(tightestExisting).toBeLessThan(Infinity);

		const worstForMaps = Math.min(
			...others.filter(([, hex]) => hex !== accents.maps).map(([, hex]) => deltaE00(accents.maps, hex))
		);
		expect(
			worstForMaps,
			`the maps green sits ${worstForMaps.toFixed(1)} from its nearest neighbour, tighter than the launcher's own closest pair at ${tightestExisting.toFixed(1)}`
		).toBeGreaterThanOrEqual(tightestExisting);
	});

	it('gives the Maps accent the contrast a card ink and a card edge owe', () => {
		// THE GROUNDS ARE READ OUT OF THE DESIGN SYSTEM, not retyped here: a
		// plate that moves must move this measurement with it, and a hex copied
		// into a test is the copy that stops matching.
		const colors = readFileSync('src/lib/design-system/colors.css', 'utf8');
		const token = (name: string) => {
			const m = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(colors);
			expect(m, `--${name} is not a literal hex in colors.css any more`).not.toBeNull();
			return (m as RegExpExecArray)[1];
		};
		const [bg0, bg1, bg2] = [token('bg0'), token('bg1'), token('bg2')];
		const maps = /--acc-primary:\s*(#[0-9a-f]{6})\s*;/i.exec(ruleFor('maps'))?.[1] as string;

		// --acc-ink defaults to the identity, so the identity is what carries
		// every word, glyph and title on the card. 4.5:1 on all three grounds.
		for (const [name, ground] of [
			['--bg0', bg0],
			['--bg1', bg1],
			['--bg2', bg2]
		] as const) {
			const ratio = contrast(maps, ground);
			expect(ratio, `maps ink on ${name} measured ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
		}

		// --acc-edge is 75% of the ink and is the only thing separating the card
		// from the page, so it takes the load-bearing boundary's 3:1.
		const edge = contrast(over(maps, 0.75, bg1), bg0);
		expect(edge, `maps card edge measured ${edge.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);

		// POSITIVE CONTROL for both, on the same instrument: FRC's raw brand red
		// is the documented failure this launcher already re-pins an ink for, so
		// a contrast function that always answered "fine" cannot pass here.
		expect(contrast('#ed1c24', bg1)).toBeLessThan(4.5);
	});

	/**
	 * THE CARD ITSELF, WHICH IS WHAT 0020 COULD NOT ASSERT.
	 *
	 * 0020 landed the accent rule and said so in its own comment: "THERE IS NO
	 * `maps` ENTRY IN `PORTAL_APPS` YET AND THIS RULE PAINTS NOTHING UNTIL
	 * THERE IS." A stylesheet rule keyed on an attribute no card carries is
	 * inert and NOTHING ON SCREEN REPORTS THAT -- the card simply is not there,
	 * so there is no wrong colour to notice. These two assertions are the pair
	 * that closes it: the registry entry exists, and the launcher renders the
	 * mark for it rather than falling through to the generic fallback glyph.
	 */
	it('puts Maps in the registry, so the accent rule has a card to paint', () => {
		const maps = PORTAL_APPS.find((a) => a.id === 'maps');
		expect(maps, 'no `maps` entry in PORTAL_APPS: the accent rule paints nothing').toBeDefined();
		// The rule keys on `data-app`, which is stamped from the id, and the
		// icon snippet keys on `icon`. Two different fields, and a mismatch
		// costs the glyph silently while the colour still lands.
		expect((maps as PortalApp).icon).toBe('maps');
		expect((maps as PortalApp).href).toBe('/maps');

		// AND IT IS VISIBLE TO A SIGNED-OUT VISITOR, which is the whole point of
		// the surface: the spec locks read access as fully public, `/maps` is
		// not in `authedPrefixes`, and 0161/0162/0163/0165 grant the reads to
		// `anon`. A `requiresAuth` here would put a sign-in wall in front of a
		// page that answers an anonymous GET, and `adminOnly` would remove the
		// card outright. Asserted through `visibleApps(false)`, the same
		// function the launcher calls, rather than by reading the flags: the
		// flags are the mechanism, the card being there is the guarantee.
		expect(visibleApps(false).map((a) => a.id)).toContain('maps');
		expect((maps as PortalApp).requiresAuth).toBeUndefined();
		expect((maps as PortalApp).adminOnly).toBeUndefined();

		// POSITIVE CONTROL on the same instrument: a card that IS gated must not
		// come back from the anonymous list, or "maps is visible" means nothing.
		expect(visibleApps(false).map((a) => a.id)).not.toContain('dashboard');
	});

	it('gives the Maps card an animated mark that hides nothing at rest', () => {
		// Same contract every mark in $lib/marks carries (see the Foundry case
		// above): animates only under prefers-reduced-motion: no-preference, and
		// is fully visible with the animation cancelled.
		const mark = readFileSync('src/lib/marks/MapsMark.svelte', 'utf8');
		expect(mark).toContain('prefers-reduced-motion: no-preference');
		expect(mark).toMatch(/animation:\s*mm-/);

		// Nothing at opacity 0 or under a transform OUTSIDE a keyframe: that is
		// what "hidden at rest" looks like. The keyframes themselves may dip.
		const styleBody = mark.slice(mark.indexOf('<style>'));
		const outsideKeyframes = styleBody.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
		expect(outsideKeyframes).not.toMatch(/opacity:\s*0/);

		// NO LITERAL COLOUR ANYWHERE. The card resolves currentColor to
		// --acc-ink, which for this card defaults to the jade --acc-primary; a
		// hex baked into the mark would survive a later accent change and
		// silently stop matching the card around it. GreenlineMark is the one
		// mark that does hardcode a hex, and it is not the pattern to copy.
		expect(mark).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
		expect(mark).toContain('stroke="currentColor"');

		// And the launcher actually renders it rather than falling through to
		// the generic inline fallback glyph, which is the silent failure: the
		// card appears, correctly coloured, wearing somebody else's shape.
		const launcher = readFileSync('src/lib/AppLauncher.svelte', 'utf8');
		expect(launcher).toContain("id === 'maps'");
		expect(launcher).toContain('<MapsMark />');
	});

	it('never moves an identity colour for contrast, only the ink', () => {
		// FRC is the one card whose brand colour cannot carry text on --bg1: pure
		// #ED1C24 measured 3.41:1 there. The fix moved --acc-ink and left FIRST red
		// painting the strip and the texture. Quietly lightening --acc-primary
		// instead would be a recoloured trademark, which is the thing to refuse.
		expect(ruleFor('frc')).toContain('--acc-primary: #ed1c24;');
		expect(ruleFor('frc')).toContain('--acc-secondary: #0066b3;');
		expect(ruleFor('frc')).toContain('--acc-ink:');
	});
});
