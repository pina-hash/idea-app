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
// 3. THE ACTIVE COURSES TILE. The hero's first stat is a NUMBER, which is the
//    most silent thing a page can be wrong about: it renders, it is plausible,
//    and nobody re-derives it. It read 4 against a pathway running 2 for as
//    long as `Section.course` carried rotation numbers. What is pinned below is
//    that the tile shows `activeCourseCount()` and that the count collapses
//    every section of a course into one -- never the literal 2, which is an
//    ordinary edit to hand-maintained metadata away.
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
import { SECTIONS, activeCourseCount } from '$lib/curriculum';
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
 *
 * AND TWO MORE WITH NO FEED AT ALL, which is the case the four above could not
 * express: every one of them carries exactly one section, so `hasClasses` was
 * true for all four and the emptiness half of the decision was unreachable
 * from this fixture. `student-no-classes` is a real student before the roster
 * import (and the same shape a failed classroom read produces);
 * `signed-out` is a visitor, whose payload carries no claims and no sections
 * because that is literally what `+page.server.ts` returns with no session.
 */
type Viewer =
	| 'teacher-of-record'
	| 'student'
	| 'staff-no-sections'
	| 'admin-not-teacher'
	| 'student-no-classes'
	| 'visitor-with-class'
	| 'signed-out';

function homeData(viewer: Viewer) {
	/*
	 * THE EMPTY-FEED VIEWERS RETURN THE PAYLOAD SHAPE THEIR REAL CASE
	 * PRODUCES, not a doctored one. `+page.server.ts` returns
	 * `feedSections: []` with no claims for a signed-out visitor, and the same
	 * empty arrays with claims for a signed-in account on nobody's roster --
	 * so `buildFeed` returns nothing and `ClassroomFeed` renders its own empty
	 * state, which is a card, which is why "is the block there" was never the
	 * question.
	 */
	if (viewer === 'signed-out' || viewer === 'student-no-classes') {
		return {
			classroomReady: true,
			feedSections: [],
			feedItems: [],
			feedSubmissions: [],
			claims: viewer === 'signed-out' ? null : { sub: 'u1', email: STUDENT },
			userProfile:
				viewer === 'signed-out'
					? null
					: {
							id: 'u1',
							role: 'student',
							display_name: 'Viewer',
							avatar: null,
							pathway: 'IDEA',
							preferences: {}
						},
			isAdmin: false
		};
	}

	// Every section belongs to TEACHER; only the viewer changes.
	const sections = [section('s1', TEACHER)];
	const email = viewer === 'teacher-of-record' ? TEACHER : STUDENT;
	const role =
		viewer === 'teacher-of-record' || viewer === 'staff-no-sections'
			? 'teacher'
			: viewer === 'visitor-with-class'
				? 'visitor'
				: 'student';
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
	'admin-not-teacher',
	'student-no-classes',
	'visitor-with-class',
	'signed-out'
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

	it('puts Apps FIRST for a student, classes or no classes (ledger 0117, report 21)', () => {
		// THIS ASSERTION USED TO REFUSE THE REPORTED REMEDY, and the measurement
		// it rested on is still true: at 375px on /dev/home-order a student's
		// class block grows 616px per class, so putting Apps first moves that
		// scroll onto the feed's deep links rather than removing it. Mr. Pina
		// asked a second time, in his own words, with the cost known. A student
		// WITH a class now gets the launcher first; the page's own comment keeps
		// the figure as the price of the decision.
		const o = order(drawHome('student'));
		expect(o.apps).toBeLessThan(o.classes);
	});

	it('keys the student order on the ROLE, so a visitor with a class is not a student', () => {
		// A `visitor` account (any non-school domain) manages nothing and is not a
		// student, so it keeps the content-earned rule: Your Classes first while
		// there is a class in it. This is the positive control for the student
		// assertion above -- the same payload, one field different, the opposite
		// order -- so a predicate keyed on "does not manage" rather than on the
		// role passes that test and fails this one.
		const o = order(drawHome('visitor-with-class'));
		expect(o.classes).toBeLessThan(o.apps);
	});

	/*
	 * THE EMPTINESS HALF, WHICH USED TO GO THE OTHER WAY.
	 *
	 * The page keyed the order on `managesAnySection` alone, so a viewer with
	 * NO feed got the student order and a 230px "You are not in any classes
	 * yet" card sat above the launcher with nothing in it to open. Measured at
	 * 375px: the first app card was at 900px (1.13 screens) with an empty feed
	 * against 629px (0.79 screens) after. The rule keeps its own stated reason
	 * -- the feed earns the top by deep-linking a student into what is due --
	 * and stops applying where there is nothing to link to.
	 */
	it('puts Apps FIRST when there is no class to put above them', () => {
		for (const viewer of ['student-no-classes', 'signed-out'] as Viewer[]) {
			const o = order(drawHome(viewer));
			expect(o.apps, `${viewer}: Apps did not come first`).toBeLessThan(o.classes);
		}
	});

	it('keys the emptiness on the FEED, not on being signed out', () => {
		/*
		 * The two halves are separable and only one of them is the rule. A
		 * signed-IN student on nobody's roster is the case a "signed out?"
		 * check would get wrong, and it is the commoner one: it is every
		 * student between enrolment and the roster import, and every viewer
		 * whose classroom read failed.
		 *
		 * POSITIVE CONTROL on the same instrument, and it is what makes this
		 * more than a restatement of the test above: the SAME signed-in
		 * student, differing only in whether the payload carries a section,
		 * must come back with the opposite order. A predicate keyed on the
		 * session rather than on the feed passes the previous test and fails
		 * this pair.
		 */
		const empty = order(drawHome('student-no-classes'));
		expect(empty.apps, 'signed-in student with no classes').toBeLessThan(empty.classes);

		// The enrolled half of the pair is a VISITOR since 0117: a student with a
		// class gets Apps first by role, so the student payload can no longer
		// show the feed-keyed order flipping. The visitor is on the same rule the
		// student used to be on.
		const enrolled = order(drawHome('visitor-with-class'));
		expect(enrolled.classes, 'signed-in visitor WITH a class').toBeLessThan(enrolled.apps);
	});

	it('keys the STAFF order on what the viewer MANAGES, not on their role', () => {
		// Staff who teach no section manage nothing, so their feed keeps the top
		// -- even though their profile role is `teacher`, which the email domain
		// grants automatically and which on its own grants nothing (CLAUDE.md,
		// ADMIN TIER). Only a STUDENT's order is keyed on the role (0117).
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

/** Family ids with a `[data-family=...]` rule (ledger 0467). */
const familyIds = () => {
	const ids = new Set<string>();
	for (const m of LAUNCHER_CSS.matchAll(/\.app-card\[data-family='([a-z-]+)'\]/g)) ids.add(m[1]);
	return ids;
};

/** The body of one `[data-family=...]` rule. */
function familyRule(id: string): string {
	const at = LAUNCHER_CSS.indexOf(`.app-card[data-family='${id}']`);
	if (at < 0) return '';
	const open = LAUNCHER_CSS.indexOf('{', at);
	return LAUNCHER_CSS.slice(open, LAUNCHER_CSS.indexOf('}', open));
}

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

/*
 * THE COURSE-COUNT ROWS. Read off the rendered hero rather than by calling the
 * function twice: the question is what a visitor sees, and a tile wired to a
 * different value, a stale literal or nothing at all is exactly the failure
 * that stood. `drawHome` mounts the real page, so this is the shipping
 * expression.
 */
function heroCourseCount(html: string): string | null {
	// The stat whose label is Active Courses, whatever order the stats are in.
	const stats = html.split('<div class="hero-stat">').slice(1);
	for (const stat of stats) {
		if (!/Active Courses/.test(stat)) continue;
		const m = stat.match(/<span class="value">([^<]*)<\/span>/);
		return m ? m[1].trim() : null;
	}
	return null;
}

describe('home page: the Active Courses tile', () => {
	it('renders the tile at all, for every viewer (positive control)', () => {
		for (const viewer of ALL_VIEWERS) {
			expect(heroCourseCount(drawHome(viewer)), `${viewer}: no Active Courses tile`).not.toBeNull();
		}
	});

	it('shows activeCourseCount(), not a literal and not a section tally', () => {
		expect(heroCourseCount(drawHome('student'))).toBe(String(activeCourseCount()));
	});

	it('shows the same number to every viewer: it is the programme, not the person', () => {
		const counts = ALL_VIEWERS.map((v) => heroCourseCount(drawHome(v)));
		expect(new Set(counts).size, `the tile varies by viewer: ${counts.join(', ')}`).toBe(1);
	});

	it('counts fewer courses than there are sections, because rotations collapse', () => {
		/*
		 * THE DEFECT, AS A PROPERTY. `IDEA 100-1/-2/-3` were three values of one
		 * field, so the Set saw three courses where the pathway runs one. Stated
		 * as an inequality rather than as "2", because adding a course, a
		 * rotation or a section is an ordinary edit and must not redden this.
		 * A catalog where every section were its own course would pass it
		 * vacuously, which the sibling assertion below refuses.
		 */
		expect(activeCourseCount()).toBeLessThan(SECTIONS.length);
	});

	it('has a course carrying more than one section, so the collapse is real', () => {
		// The positive control for the row above: without a multi-section course
		// in the catalog, "fewer courses than sections" could be true for
		// unrelated reasons (a concluded programme excluded, say).
		const perCourse = new Map<string, number>();
		for (const s of SECTIONS) perCourse.set(s.course, (perCourse.get(s.course) ?? 0) + 1);
		const shared = [...perCourse.values()].filter((n) => n > 1);
		expect(shared.length, 'no course in the catalog has two sections to collapse').toBeGreaterThan(0);
	});
});

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
			expect(html, `${app.id}: no data-family attribute`).toContain(`data-app="${app.id}" data-family="${app.family}"`);
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
		// Ledger 0467: the default is the neutral family, an entry of the kit's
		// library through its generated token, never a typed hex.
		expect(base).toContain('--acc-primary: var(--id-titanium-fill);');
		expect(base).toContain('--acc-ink: var(--id-titanium-ink);');

		// "Takes the default" is measured against the FAMILY rule: an app whose
		// family has no `[data-family=...]` rule paints from `.app-card`, which
		// is what the Tools family (Maps, Admin) does.
		const families = familyIds();
		const takingDefault = visibleApps(true)
			.map((a) => a.id)
			.filter((id) => !families.has(PORTAL_APPS.find((x) => x.id === id)!.family));
		expect(takingDefault.length, 'every family declares its own accent').toBeGreaterThan(0);

		// POSITIVE CONTROL for the line above: the same check must be able to SEE a
		// declared family, or "some app takes the default" passes because the sweep
		// found nothing at all.
		expect(families.size, 'no family declares an accent').toBeGreaterThan(0);
		// And no `[data-app=...]` rule re-pins the pair any more: one card's
		// colour is its family's (ledger 0467), so the per-app rules carry
		// textures only.
		expect([...accentIds()]).toEqual([]);

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
	 * THE FOUNDRY CARD (ledger 0467). It used to quote its room's molten pour
	 * as two typed hex values, and the test before that pinned it off a fifth
	 * green. Now it is in the Make family with IdeaCAD and the Armory, painted
	 * from the kit library's indigo through the generated token, and what is
	 * pinned is the property the old census was protecting: no card on the
	 * launcher spends the brand green, which means act and done.
	 */
	it('gives Foundry its family\'s colour, and no card the brand green', () => {
		const foundry = PORTAL_APPS.find((a) => a.id === 'foundry')!;
		expect(foundry.family).toBe('make');
		expect(familyRule('make')).toContain('--acc-primary: var(--id-indigo-fill);');
		expect(familyRule('make')).toContain('--acc-ink: var(--id-indigo-ink);');
		// No rule anywhere in the launcher paints a card from a green.
		for (const fam of familyIds()) {
			expect(familyRule(fam), fam).not.toMatch(/--acc-(primary|secondary|ink):\s*var\(--(green|id-idea-green)/);
		}
		expect(LAUNCHER_CSS).not.toMatch(/--acc-primary:\s*#/);
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
		expect(launcher).toContain('<FoundryMark once />');

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

	it('puts Maps in the neutral Tools family, the default nobody declares', () => {
		// Ledger 0467: Maps was a jade, the fifth green on this board, and green
		// means act and done. It is a tool, and the Tools family is the default
		// `.app-card` pair, so the Maps card has no rule of its own at all.
		const maps = PORTAL_APPS.find((a) => a.id === 'maps')!;
		expect(maps.family).toBe('tools');
		expect(familyRule('tools')).toBe('');
		expect(ruleFor('maps')).toBe('');
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
		// silently stop matching the card around it. GreenlineMark was the one
		// mark that hardcoded a hex until ledger 0298 redrew it on currentColor.
		expect(mark).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
		expect(mark).toContain('stroke="currentColor"');

		// And the launcher actually renders it rather than falling through to
		// the generic inline fallback glyph, which is the silent failure: the
		// card appears, correctly coloured, wearing somebody else's shape.
		const launcher = readFileSync('src/lib/AppLauncher.svelte', 'utf8');
		expect(launcher).toContain("id === 'maps'");
		expect(launcher).toContain('<MapsMark once />');
	});

	it('gives the IdeaCAD card an animated extrude mark that hides nothing at rest', () => {
		// Same contract every mark in $lib/marks carries (see the Foundry case
		// above), and Mr. Pina's own words for this one: an animated cube that
		// reads as IdeaCAD without the word, honoring reduced motion with a
		// still frame and never a frame stopped mid-extrude.
		const mark = readFileSync('src/lib/marks/IdeaCadMark.svelte', 'utf8');
		expect(mark).toContain('prefers-reduced-motion: no-preference');
		expect(mark).toMatch(/animation:\s*im-/);

		// Nothing at opacity 0 and nothing under a transform OUTSIDE a keyframe.
		// `transform-origin` is a declaration about where a transform would
		// pivot, not a transform, so it is the one `transform` word allowed.
		const styleBody = mark.slice(mark.indexOf('<style>'));
		const outsideKeyframes = styleBody.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
		expect(outsideKeyframes).not.toMatch(/opacity:\s*0/);
		expect(outsideKeyframes).not.toMatch(/transform:/);

		// NO LITERAL COLOR. The card resolves currentColor to its ink, and the
		// IdeaCAD front door points the `--icm-*` hooks at its own tokens.
		expect(mark).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
		expect(mark).toContain('stroke="currentColor"');

		// HALF A CYCLE ENDS ON THE REST STATE, which is what lets the front door
		// play the extrude once and settle with no second set of keyframes. Read
		// each keyframe set as offset -> value, and ask what it holds at 50%:
		// both neighbours of 50% must already be the rest value, or `once`
		// would stop on a frame the base styles then snap away from.
		const frames = (name: string, prop: string) => {
			const body = styleBody.match(new RegExp(`@keyframes ${name}\\s*\\{((?:[^{}]*\\{[^{}]*\\})*)[^{}]*\\}`))?.[1] ?? '';
			const out: [number, string][] = [];
			for (const block of body.matchAll(/([\d%,\s]+)\{([^}]*)\}/g)) {
				const value = block[2].match(new RegExp(`(?:^|;|\\s)${prop}:\\s*([^;]+)`))?.[1].trim();
				if (value === undefined) continue;
				for (const offset of block[1].split(',')) if (offset.trim()) out.push([parseFloat(offset), value]);
			}
			return out.sort((a, b) => a[0] - b[0]);
		};
		const at50 = (f: [number, string][]) => [f.filter(([o]) => o <= 50).at(-1)?.[1], f.find(([o]) => o >= 50)?.[1]];
		const rise = frames('im-rise', 'transform');
		const grow = frames('im-grow', 'transform');
		const shade = frames('im-shade', 'opacity');
		// The hole cut into the top face (ledger 0298): it opens after the
		// extrude and is open at the rest frame, the same half-cycle rule.
		const cut = frames('im-cut', 'transform');
		// Positive control on the reader: each set was found and has its ends.
		expect(rise.length).toBeGreaterThanOrEqual(4);
		expect(grow.length).toBeGreaterThanOrEqual(4);
		expect(shade.length).toBeGreaterThanOrEqual(4);
		expect(cut.length).toBeGreaterThanOrEqual(4);
		expect(at50(rise)).toEqual(['translateY(0)', 'translateY(0)']);
		expect(at50(grow)).toEqual(['scaleY(1)', 'scaleY(1)']);
		expect(at50(shade)).toEqual(['1', '1']);
		expect(at50(cut)).toEqual(['scale(1)', 'scale(1)']);
		expect(mark).toContain('animation-iteration-count: 0.5');

		// The launcher renders it, and the inline cube it replaced is gone
		// rather than left as a second drawing of the same logo.
		const launcher = readFileSync('src/lib/AppLauncher.svelte', 'utf8');
		expect(launcher).toContain("id === 'ideacad'");
		expect(launcher).toContain('<IdeaCadMark once />');
		expect(launcher).not.toContain('m16 4 11 6-11 6L5 10l11-6Z');
	});

	// The Classroom and Notebook marks were REDESIGNED IN PLACE to the IdeaCAD
	// standard (ledger 0297, package F1b): layered geometry, faces mixed from
	// currentColor, a hook family a host can point at its own tokens, and a
	// `once` prop whose half cycle ends on the rest frame. Each case below is the
	// IdeaCAD case above pointed at one mark, with the keyframe reader shared.
	const markFrames = (styleBody: string, name: string, prop: string) => {
		const body = styleBody.match(new RegExp(`@keyframes ${name}\\s*\\{((?:[^{}]*\\{[^{}]*\\})*)[^{}]*\\}`))?.[1] ?? '';
		const out: [number, string][] = [];
		for (const block of body.matchAll(/([\d%,\s]+)\{([^}]*)\}/g)) {
			const value = block[2].match(new RegExp(`(?:^|;|\\s)${prop}:\\s*([^;]+)`))?.[1].trim();
			if (value === undefined) continue;
			for (const offset of block[1].split(',')) if (offset.trim()) out.push([parseFloat(offset), value]);
		}
		return out.sort((a, b) => a[0] - b[0]);
	};
	const markAt50 = (f: [number, string][]) => [f.filter(([o]) => o <= 50).at(-1)?.[1], f.find(([o]) => o >= 50)?.[1]];
	const MARK_CASES = [
		{ file: 'ClassroomMark', app: 'classroom', prefix: 'cm-', keyframes: 'cm-swing', rest: 'rotate(0deg)', hook: '--crm-' },
		{ file: 'NotebookMark', app: 'notebook', prefix: 'nm-', keyframes: 'nm-focus', rest: 'scale(1)', hook: '--nbm-' }
	] as const;
	for (const c of MARK_CASES) {
		it(`gives the ${c.app} card a layered mark that hides nothing at rest and settles on its rest frame`, () => {
			const mark = readFileSync(`src/lib/marks/${c.file}.svelte`, 'utf8');
			expect(mark).toContain('prefers-reduced-motion: no-preference');
			expect(mark).toMatch(new RegExp(`animation:\\s*${c.prefix}`));

			// Nothing at opacity 0 and nothing under a transform OUTSIDE a keyframe;
			// `transform-origin` is the one `transform` word allowed.
			const styleBody = mark.slice(mark.indexOf('<style>'));
			const outsideKeyframes = styleBody.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
			expect(outsideKeyframes).not.toMatch(/opacity:\s*0/);
			expect(outsideKeyframes).not.toMatch(/transform:/);

			// No literal color: currentColor, with the faces mixed from it and a
			// hook family in front of every paint.
			expect(mark).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
			expect(mark).toContain('stroke="currentColor"');
			for (const tier of ['edge', 'hl', 'top', 'right', 'left']) expect(mark).toContain(`var(${c.hook}${tier},`);
			// Three shaded tiers, as the IdeaCAD mark has, so it is a solid and not a line.
			for (const pct of ['46%', '26%', '12%']) expect(mark).toContain(`color-mix(in srgb, currentColor ${pct}, transparent)`);

			// Half a cycle ends on the rest state. Positive control first: the
			// reader found the keyframe set and both of its ends.
			const f = markFrames(styleBody, c.keyframes, 'transform');
			expect(f.length).toBeGreaterThanOrEqual(3);
			expect(f[0]).toEqual([0, c.rest]);
			expect(f.at(-1)).toEqual([100, c.rest]);
			expect(markAt50(f)).toEqual([c.rest, c.rest]);
			expect(mark).toContain('animation-iteration-count: 0.5');
			expect(mark).toMatch(/let \{ once = false \}/);

			// And the launcher still renders it from its own call site.
			const launcher = readFileSync('src/lib/AppLauncher.svelte', 'utf8');
			expect(launcher).toContain(`id === '${c.app}'`);
			expect(launcher).toContain(`<${c.file} once />`);
		});
	}

	// THE GREENLINE AND ADMIN MARKS WERE REDRAWN TO THE IDEACAD STANDARD
	// (ledger 0298, decision 40 item 3): layered geometry, faces mixed from
	// currentColor at the three tiers, a hook family, no literal color, and a
	// `once` whose half cycle ends on the rest frame. The rest frame here sits
	// in the MIDDLE of every keyframe set (the start is somewhere else -- the
	// machine below its hover height, a knob elsewhere on its slot), so the
	// assertion is the IdeaCAD one: both neighbours of 50% are the rest value.
	const REDRAWN = [
		{
			file: 'GreenlineMark',
			app: 'greenline',
			prefix: 'gl-',
			hook: '--glm-',
			sets: [
				['gl-hover', 'transform', 'translateY(0)'],
				['gl-thrust', 'opacity', '1'],
				['gl-line', 'stroke-dashoffset', '0']
			]
		},
		{
			file: 'DashboardMark',
			app: 'dashboard',
			prefix: 'dm-',
			hook: '--dbm-',
			sets: [
				['dm-k1', 'transform', 'translate(0, 0)'],
				['dm-k2', 'transform', 'translate(0, 0)'],
				['dm-k3', 'transform', 'translate(0, 0)'],
				['dm-lamp', 'opacity', '1']
			]
		}
	] as const;
	for (const c of REDRAWN) {
		it(`gives the ${c.app} card a redrawn solid mark that hides nothing at rest and settles on its rest frame`, () => {
			const mark = readFileSync(`src/lib/marks/${c.file}.svelte`, 'utf8');
			expect(mark).toContain('prefers-reduced-motion: no-preference');
			expect(mark).toMatch(new RegExp(`animation:\\s*${c.prefix}`));
			const styleBody = mark.slice(mark.indexOf('<style>'));
			const outsideKeyframes = styleBody.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
			expect(outsideKeyframes).not.toMatch(/opacity:\s*0/);
			expect(outsideKeyframes).not.toMatch(/transform:/);
			expect(outsideKeyframes).not.toMatch(/stroke-dashoffset:/);
			// No literal color anywhere, which is what retired the launcher's
			// Space White re-ink rule for GREENLINE's near-white strokes.
			expect(mark).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
			expect(mark).toContain('stroke="currentColor"');
			for (const tier of ['edge', 'hl', 'top', 'right', 'left']) expect(mark).toContain(`var(${c.hook}${tier},`);
			for (const pct of ['46%', '26%', '12%']) expect(mark).toContain(`color-mix(in srgb, currentColor ${pct}, transparent)`);
			for (const [name, prop, rest] of c.sets) {
				const f = markFrames(styleBody, name, prop);
				// Positive control: the reader found the set and both of its ends.
				expect(f.length, name).toBeGreaterThanOrEqual(4);
				expect(markAt50(f), name).toEqual([rest, rest]);
			}
			expect(mark).toContain('animation-iteration-count: 0.5');
			expect(mark).toMatch(/let \{ once = false \}/);
			const launcher = readFileSync('src/lib/AppLauncher.svelte', 'utf8');
			expect(launcher).toContain(`id === '${c.app}'`);
			expect(launcher).toContain(`<${c.file} once />`);
		});
	}

	it('mounts EVERY launcher mark with `once`, and every mark in $lib/marks accepts it', () => {
		/* NO CARD LOOPS FOREVER (ledger 0298, decision 40 item 3). The launcher
		   used to mount every mark looping, so a grid of glyphs never stopped
		   moving and IdeaCAD's showed a collapsed diamond for 18% of every
		   loop. A mark mounted without `once` still type-checks and still looks
		   right in a screenshot, so the mount is asserted here. */
		const launcher = readFileSync('src/lib/AppLauncher.svelte', 'utf8');
		const snippet = launcher.slice(launcher.indexOf('{#snippet appIcon'), launcher.indexOf('{/snippet}', launcher.indexOf('{#snippet appIcon')));
		const mounts = [...snippet.matchAll(/<([A-Z][A-Za-z]*Mark)\b([^>]*)\/>/g)];
		// Positive control: the reader found the marks the launcher imports.
		const imported = [...launcher.matchAll(/import ([A-Z][A-Za-z]*Mark) from '\$lib\/marks\//g)].map((m) => m[1]);
		expect(imported.length).toBeGreaterThanOrEqual(12);
		expect(mounts.map((m) => m[1]).sort()).toEqual([...imported].sort());
		for (const m of mounts) expect(m[2], m[1]).toMatch(/\bonce\b/);
		for (const name of imported) {
			const mark = readFileSync(`src/lib/marks/${name}.svelte`, 'utf8');
			expect(mark, name).toMatch(/let \{[^}]*\bonce = false\b[^}]*\}/);
			expect(mark, name).toContain('class:once');
			expect(mark, name).toMatch(/\.once[^{]*\{\s*animation-iteration-count:\s*(0\.5|1);/);
		}
	});

	it('never moves an identity colour for contrast, only the ink', () => {
		// FRC is the one family whose brand colour cannot carry text on --bg1
		// (FIRST red measured 3.41:1 there). The strip paints the FIRST entries'
		// fills and the words their ink, both solve()'s answers for the library
		// anchors (ledger 0467); nothing re-pins either by hand.
		const frc = familyRule('frc');
		expect(frc).toContain('--acc-primary: var(--id-first-red-fill);');
		expect(frc).toContain('--acc-secondary: var(--id-first-blue-fill);');
		expect(frc).toContain('--acc-ink: var(--id-first-red-ink);');
	});
});
