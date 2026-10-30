// tests/home-order-and-accent.test.ts
//
// TWO HOME-PAGE GUARANTEES WHOSE REGRESSION IS SILENT.
//
// 1. THE SECTION ORDER. Apps sits above Your Classes for a viewer who manages
//    any section, and below it for everyone else. A regression either way looks
//    completely ordinary on screen -- nobody holds both roles at once, and the
//    only symptom is a scroll distance nobody measures.
//
// 2. EVERY LAUNCHER CARD IS A FILM STILL LIT BY ITS APP'S LIGHT (ledger
//    0475, decision 73 as amended the second time). Mr. Pina chose
//    "cinematic light" from four samples. What is pinned here is that choice,
//    as far as source can say it: every card has a room, an ink block, a
//    scene and an icon; every colour on a card is DERIVED from its app's
//    light, recorded in rooms.ts with the sample as its source; no two cards
//    share a look; a card is a film and looks the same on every theme; the
//    art carries no words; and every word clears 4.5:1. The paint still
//    arrives through the cascade (`$lib/launcher/cards.css`, keyed on
//    `data-app`), never stamped inline, because an inline custom property
//    beats every rule and a stamped colour is how eleven wrong accents once
//    painted for months. What a test cannot see (the title over the
//    brightest pixel of its scene) is measured in the browser and recorded in
//    docs/history/launcher-cinematic-light-0475.md.
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

import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { render } from 'svelte/server';
import Home from '../src/routes/+page.svelte';
import AppLauncher from '$lib/AppLauncher.svelte';
import CardArt from '$lib/launcher/CardArt.svelte';
import { PORTAL_APPS, visibleApps, type PortalApp } from '$lib/portal-apps';
import { LAUNCHER_ROOMS, launcherRoom, type LauncherRoom } from '$lib/launcher/rooms';
import { ICON_IDS, SCENE_IDS, cardInks, iconSvg, sceneSvg } from '$lib/launcher/art';
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

/* ---- the card inks, read from their own file ---------------------------- */

const CARDS_CSS = readFileSync(new URL('../src/lib/launcher/cards.css', import.meta.url), 'utf8');
const CARD_ART = readFileSync(new URL('../src/lib/launcher/CardArt.svelte', import.meta.url), 'utf8');
const ART_SRC = readFileSync(new URL('../src/lib/launcher/art.ts', import.meta.url), 'utf8');
type Theme = 'idea' | 'matrix' | 'space-white';
const THEMES: Theme[] = ['idea', 'matrix', 'space-white'];

/** Every `--rm-*` declaration of one selector's block in cards.css (comments stripped). */
function cardBlock(id: string, theme: Theme = 'idea', css = CARDS_CSS): Record<string, string> {
	const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const sel = theme === 'idea' ? `.app-card[data-app='${id}']` : `:root[data-theme='${theme}'] .app-card[data-app='${id}']`;
	const out: Record<string, string> = {};
	for (const m of bare.matchAll(/(?<=^|\})\s*([^{}]+?)\s*\{([^{}]*)\}/g)) {
		if (m[1].trim() !== sel) continue;
		for (const d of m[2].matchAll(/(--rm-[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim().replace(/\s+/g, ' ');
	}
	return out;
}

/** The card's paint under one theme: its base block with that theme's block laid over it. */
function cardPaint(id: string, theme: Theme): Record<string, string> {
	return { ...cardBlock(id), ...(theme === 'idea' ? {} : cardBlock(id, theme)) };
}

/** The properties that carry a colour (the rest are faces, sizes and radii). */
const COLOUR_PROPS = /^--rm-(ground|edge|title|title-glow|accent|icon|icon-filter|sub|cta-ink|cta-bg|cta-edge|glow)$/;

/**
 * WHAT THE CARD'S BLOCK MUST SAY, from its room's light (ledger 0475). Every
 * colour on a card is `cardInks()` of its `LAUNCHER_ROOMS` entry, whose hue,
 * core and ground are the chosen sample's; the faces and sizes are its
 * `title`. Returns each property the block must carry, exactly.
 */
function expectedBlock(room: LauncherRoom): Record<string, string> {
	const k = cardInks(room);
	const t = room.title;
	const out: Record<string, string> = {
		'--rm-ground': k.ground,
		'--rm-edge': k.edge,
		'--rm-radius': '4px',
		'--rm-title': k.title,
		'--rm-title-glow': k.titleGlow,
		'--rm-title-font': t.font,
		'--rm-title-weight': String(t.weight),
		'--rm-title-size': `${+(t.size / 16).toFixed(5)}rem`,
		'--rm-title-track': t.track,
		'--rm-icon': k.icon,
		'--rm-sub': k.sub,
		'--rm-cta-ink': k.ctaInk,
		'--rm-cta-edge': k.ctaEdge,
		'--rm-cta-bg': k.ctaBg,
		'--rm-glow': k.glow
	};
	if (t.case) out['--rm-title-case'] = t.case;
	if (t.style) out['--rm-title-style'] = t.style;
	if (k.accent) out['--rm-accent'] = k.accent;
	// The FIRST mark is never filtered.
	if (room.id !== 'frc') out['--rm-icon-filter'] = k.iconFilter;
	return out;
}

/**
 * WHY A BLOCK DOES NOT TRACE TO ITS ROOM'S LIGHT, or null: a property it
 * should carry and does not, one it carries that it should not, or a value
 * that is not the derivation's.
 */
function untraceable(block: Record<string, string>, room: LauncherRoom): string | null {
	const want = expectedBlock(room);
	for (const [prop, value] of Object.entries(want)) if (block[prop] !== value) return `${prop} is ${block[prop] ?? 'missing'}, the light gives ${value}`;
	for (const prop of Object.keys(block)) if (!(prop in want)) return `${prop} is not one of the card's inks`;
	return null;
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

describe('launcher cards: the paint arrives through the cascade, never inline', () => {
	it('stamps NO room property on any card, so the cascade still decides', () => {
		// THE REJECTED ALTERNATIVE. An inline custom property outranks every
		// stylesheet rule, so putting a card's paint back on the element would
		// make cards.css unreachable for that card.
		const html = launcherHtml();
		const cards = html.split('class="app-card').length - 1;
		// Positive control: "no card carries X" is worth nothing if no card rendered.
		expect(cards).toBe(visibleApps(false).length);
		expect(cards).toBeGreaterThan(5);
		expect(html).not.toMatch(/--rm-[a-z0-9-]+\s*:/);
		expect(html).not.toMatch(/--acc-[a-z-]+\s*:/);
	});

	it('gives every card the `data-app` the paint keys on, and no family', () => {
		const html = launcherHtml();
		for (const app of visibleApps(false)) expect(html, `${app.id}: no data-app attribute`).toContain(`data-app="${app.id}"`);
		// Decision 73 retired ledger 0467's families: no card is grouped.
		expect(html).not.toContain('data-family');
		expect(LAUNCHER_SRC).not.toContain('data-family');
		expect(LAUNCHER_CSS).not.toContain('[data-family');
	});

	it('declares no colour field and no family on any PORTAL_APPS entry', () => {
		expect(PORTAL_APPS.length).toBeGreaterThan(5); // positive control
		const offenders = PORTAL_APPS.filter((app) =>
			Object.keys(app).some((k) => /theme|colou?r|accent|palette|family/i.test(k))
		).map((a) => a.id);
		expect(offenders).toEqual([]);
	});

	it('reads every room property with a site fallback, so an app with no paint is a plain plate card', () => {
		// The default is LIVE: a card cards.css says nothing about still
		// draws, on the plate, rather than borrowing another app's look.
		const reads = [...LAUNCHER_CSS.matchAll(/var\((--rm-[a-z0-9-]+)(\s*,|\))/g)];
		expect(reads.length).toBeGreaterThan(15); // positive control on the reader
		const bare = reads.filter((m) => m[2] === ')').map((m) => m[1]);
		expect(bare).toEqual([]);
		// And the launcher's own stylesheet declares no room paint itself.
		expect(LAUNCHER_CSS).not.toMatch(/\.app-card\[data-app=/);
		expect(LAUNCHER_CSS).not.toMatch(/--id-[a-z]/);
	});
});

describe('every launcher card is a film still lit by its app\'s light (ledger 0475, decision 73 as amended the second time)', () => {
	type Rgb = { r: number; g: number; b: number };
	type Kit = {
		hex: (h: string) => Rgb;
		contrast: (a: Rgb, b: Rgb) => number;
		deltaE2000: (a: Rgb, b: Rgb) => number;
	};
	type Gen = {
		themeVars: () => Record<Theme, Record<string, string>>;
		paint: (value: string, vars: Record<string, string>) => { rgb: Rgb; a: number };
	};
	let K: Kit;
	let G: Gen;
	let VARS: Record<Theme, Record<string, string>>;
	/* Computed URLs, never literal specifiers: a literal import pulls the
	   tools' JavaScript into svelte-check's program (docs/subsystems/testing.md). */
	beforeAll(async () => {
		K = (await import(new URL('../tools/hx-kit/color.mjs', import.meta.url).href)) as Kit;
		G = (await import(new URL('../tools/identity-colors.mjs', import.meta.url).href)) as Gen;
		VARS = G.themeVars();
	});
	const EVERY_APP = visibleApps(true);
	const over = (fg: { rgb: Rgb; a: number }, bg: Rgb): Rgb => ({
		r: fg.rgb.r * fg.a + bg.r * (1 - fg.a),
		g: fg.rgb.g * fg.a + bg.g * (1 - fg.a),
		b: fg.rgb.b * fg.a + bg.b * (1 - fg.a)
	});
	/** One card's paint resolved to colours under one theme, the way AppLauncher reads it. */
	function resolved(id: string, theme: Theme) {
		const p = cardPaint(id, theme);
		const vars = { ...VARS[theme], ...p };
		const col = (prop: string, fallback: string) => G.paint(p[prop] ?? fallback, vars);
		const groundP = col('--rm-ground', 'var(--bg1)');
		expect(groundP.a, `${id} ${theme}: the ground is opaque`).toBe(1);
		const ground = groundP.rgb;
		const ctaGround = over(col('--rm-cta-bg', 'transparent'), ground);
		return {
			ground,
			title: over(col('--rm-title', 'var(--text-1)'), ground),
			accent: p['--rm-accent'] ? over(col('--rm-accent', 'inherit'), ground) : null,
			icon: over(col('--rm-icon', 'var(--text-1)'), ground),
			sub: over(col('--rm-sub', 'var(--text-2)'), ground),
			cta: over(col('--rm-cta-ink', 'var(--text-1)'), ctaGround),
			ctaGround,
			// The title's whole treatment: face, weight, case and tracking.
			titleFace: [p['--rm-title-font'] ?? 'var(--font-display)', p['--rm-title-weight'] ?? '700', p['--rm-title-case'] ?? 'none', p['--rm-title-track'] ?? '0.02em'].join(' ')
		};
	}
	const sceneText = (id: string) =>
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		render(CardArt as any, { props: { app: id } })
			.body.replace(/<!--[\s\S]*?-->/g, '')
			.replace(/<style[\s\S]*?<\/style>/g, '')
			.replace(/<[^>]+>/g, '')
			.trim();

	it('gives every app the launcher can draw a room, an ink block, a scene and an icon (FRC\'s is FIRST\'s), and nothing else one', () => {
		const ids = EVERY_APP.map((a) => a.id).sort();
		expect(ids.length).toBeGreaterThanOrEqual(14); // positive control: an admin's whole launcher
		expect(LAUNCHER_ROOMS.map((r) => r.id).sort()).toEqual(ids);
		const blocks = [...CARDS_CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/^\.app-card\[data-app='([a-z-]+)'\]\s*\{/gm)].map((m) => m[1]).sort();
		expect(blocks).toEqual(ids);
		expect([...SCENE_IDS].sort()).toEqual(ids);
		expect([...ICON_IDS].sort()).toEqual(ids.filter((id) => id !== 'frc'));
		for (const id of ids) expect(sceneSvg(id), id).toMatch(/^<svg class="scene" viewBox="0 0 340 88"/);
		// An app nobody registered draws nothing rather than somebody else's scene.
		expect(sceneSvg('nobody')).toBe('');
		expect(iconSvg('nobody')).toBe('');
	});

	it('draws one lit scene and no words on every card (decision 73: "no words in the art")', () => {
		const drawn = EVERY_APP.map((a) => [a.id, sceneText(a.id)] as const);
		expect(drawn.length).toBeGreaterThanOrEqual(14); // positive control
		expect(drawn.filter(([, t]) => t !== '')).toEqual([]);
		// Positive control on the reader: it does read text where there is some.
		expect(sceneText('nobody')).toBe('');
		for (const room of LAUNCHER_ROOMS) {
			const svg = sceneSvg(room.id);
			// Every card draws something: a ground, its light, a scrim and a vignette.
			expect((svg.match(/<(rect|path|ellipse|circle|polygon)\b/g) ?? []).length, room.id).toBeGreaterThan(5);
			expect(svg, `${room.id} is not lit by its own light`).toContain(room.glow ?? room.hue);
			expect(svg, `${room.id} has no scrim in its ground`).toContain(`stop-color="${room.ground}" stop-opacity="0.940"`);
			expect(svg, room.id).not.toMatch(/<text\b/);
			expect(room.scene.length, room.id).toBeGreaterThan(10);
		}
		// The ids are the app's own, so a server render and a browser render agree and no two cards share one.
		const ids = LAUNCHER_ROOMS.flatMap((r) => [...sceneSvg(r.id).matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
		expect(new Set(ids).size).toBe(ids.length);
		expect(sceneSvg('greenline')).toBe(sceneSvg('greenline'));
	});

	it('records every hue with its source: the sample Mr. Pina chose', () => {
		for (const room of LAUNCHER_ROOMS) {
			expect(room.source, room.id).toMatch(/^chosen sample A, 2026-10-30/);
			for (const c of [room.hue, room.core, room.ground, room.light, room.glow].filter(Boolean)) expect(c, room.id).toMatch(/^#[0-9a-f]{6}$/);
		}
		// GREENLINE and the Foundry were redrawn in the same grammar at his request, and say so.
		expect(LAUNCHER_ROOMS.filter((r) => /redrawn/.test(r.source)).map((r) => r.id).sort()).toEqual(['foundry', 'greenline']);
	});

	it('traces every colour on every card to its own app\'s light', () => {
		const offenders: string[] = [];
		let checked = 0;
		for (const room of LAUNCHER_ROOMS) {
			const block = cardBlock(room.id);
			checked += Object.keys(block).filter((p) => COLOUR_PROPS.test(p)).length;
			const why = untraceable(block, room);
			if (why) offenders.push(`${room.id}: ${why}`);
		}
		expect(checked).toBeGreaterThan(14 * 10); // positive control: the reader found the paint
		expect(offenders).toEqual([]);
	});

	it('NEGATIVE CONTROL: the tracer refuses a colour the light does not give, a missing ink and a stray property', () => {
		const gauntlet = launcherRoom('gauntlet')!;
		expect(untraceable(cardBlock('gauntlet'), gauntlet)).toBeNull();
		const plant = (decl: string) => cardBlock('gauntlet', 'idea', CARDS_CSS + `\n.app-card[data-app='gauntlet'] { ${decl} }\n`);
		expect(untraceable(plant('--rm-title: #123456;'), gauntlet)).toMatch(/--rm-title is #123456/);
		expect(untraceable(plant('--rm-a8: #7fcfee;'), gauntlet)).toMatch(/--rm-a8 is not one of/);
		const { ['--rm-sub']: _gone, ...noSub } = cardBlock('gauntlet');
		expect(untraceable(noSub, gauntlet)).toMatch(/--rm-sub is missing/);
		// Another card's light is refused too: the inks are this app's own.
		expect(untraceable(cardBlock('vanguard'), gauntlet)).not.toBeNull();
	});

	it('looks like no other card: each pair differs in its ground, words, icon or face', () => {
		const near = (a: Rgb, b: Rgb) => K.deltaE2000(a, b) < 10;
		const r = EVERY_APP.map((a) => [a.id, resolved(a.id, 'idea')] as const);
		let pairs = 0;
		const same: string[] = [];
		for (let i = 0; i < r.length; i++)
			for (let j = i + 1; j < r.length; j++) {
				pairs++;
				const [a, x] = r[i];
				const [b, y] = r[j];
				if (near(x.ground, y.ground) && near(x.title, y.title) && near(x.icon, y.icon) && near(x.cta, y.cta) && x.titleFace === y.titleFace) same.push(`${a} / ${b}`);
			}
		expect(pairs).toBeGreaterThan(80); // positive control
		expect(same).toEqual([]);
		// And no two cards are lit by the same light.
		const hues = LAUNCHER_ROOMS.map((room) => room.hue);
		expect(new Set(hues).size).toBe(hues.length);
	});

	it('is a film, not plate: every card looks the same on every theme, Space White included', () => {
		const key = (x: ReturnType<typeof resolved>) => [x.ground, x.title, x.icon, x.sub, x.cta].map((c) => `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`).join(' ');
		for (const room of LAUNCHER_ROOMS) {
			for (const theme of THEMES) {
				expect(cardBlock(room.id, theme === 'idea' ? 'idea' : theme), `${room.id} ${theme}`).toEqual(theme === 'idea' ? cardBlock(room.id) : {});
				expect(key(resolved(room.id, theme)), `${room.id} on ${theme}`).toBe(key(resolved(room.id, 'idea')));
			}
			// PRESENT: a dark ground on every theme (the positive direction).
			expect(K.contrast(resolved(room.id, 'space-white').ground, K.hex('#0d1311')), room.id).toBeLessThan(1.3);
		}
		// No theme selector in the ink file at all.
		expect(CARDS_CSS.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/data-theme/);
	});

	it('clears 4.5:1 for every word on every card (title, its accent, description, key) and 3:1 for its icon', () => {
		const fails: string[] = [];
		let n = 0;
		for (const app of EVERY_APP) {
			const x = resolved(app.id, 'idea');
			const check = (what: string, ink: Rgb, ground: Rgb, min = 4.5) => {
				n++;
				const c = K.contrast(ink, ground);
				if (c < min) fails.push(`${app.id} ${what} ${c.toFixed(2)}`);
			};
			check('title', x.title, x.ground);
			if (x.accent) check('title accent', x.accent, x.ground);
			check('description', x.sub, x.ground);
			check('key', x.cta, x.ctaGround);
			check('icon', x.icon, x.ground, 3);
		}
		// Positive control: 14 cards x (title, description, key, icon), and the accents.
		expect(n).toBeGreaterThanOrEqual(14 * 4 + 2);
		expect(fails).toEqual([]);
	});

	it('draws no neon and no colour outside the light and the sample\'s darks', () => {
		const NEON = /#00ff41\b|#c8ff00\b|\b0\s*,\s*255\s*,\s*65\b|\b200\s*,\s*255\s*,\s*0\b/i;
		expect(NEON.test(CARDS_CSS)).toBe(false);
		expect(NEON.test(ART_SRC)).toBe(false);
		// CardArt names no colour of its own: the scene and the grain are all it draws.
		expect(CARD_ART.replace(/<!--[\s\S]*?-->/g, '').match(/#[0-9a-f]{6}\b/gi) ?? []).toEqual([]);
		// It does not move.
		expect(CARD_ART).not.toMatch(/@keyframes|animation\s*:/);
	});
});

describe('the app marks in $lib/marks, and the launcher\'s still icons (ledger 0475)', () => {
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

		// The launcher no longer mounts it (ledger 0475): its card wears the
		// filled Foundry icon from the chosen sample instead.
		expect(iconSvg('foundry')).toMatch(/^<svg /);

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
		// The paint keys on `data-app` and the icon on the same id (ledger
		// 0475 retired the separate `icon` field), so the two cannot disagree.
		expect(iconSvg((maps as PortalApp).id)).toMatch(/^<svg /);
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

		// The launcher's Maps card wears the filled locator icon (ledger 0475).
		expect(iconSvg('maps')).toMatch(/^<svg /);
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

		// The inline cube it once replaced stays gone from the launcher, which
		// now draws the filled block icon (ledger 0475).
		expect(LAUNCHER_SRC).not.toContain('m16 4 11 6-11 6L5 10l11-6Z');
		expect(iconSvg('ideacad')).toMatch(/^<svg /);
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

			// The launcher draws this app's filled icon instead (ledger 0475).
			expect(iconSvg(c.app)).toMatch(/^<svg /);
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
			expect(iconSvg(c.app)).toMatch(/^<svg /);
		});
	}

	it('mounts no $lib/marks component: every launcher icon is the still, filled mark, and every mark still accepts `once` for its other homes', () => {
		/* LEDGER 0475: the launcher's icons are the filled marks of the sample
		   Mr. Pina chose, drawn by `iconSvg`, and they do not move (a card is
		   a door, not a screensaver, ledger 0298). The animated marks in
		   $lib/marks still serve the Foundry house card, the Armory and the
		   IdeaCAD launch page, so their own contract is still held here. */
		const snippet = LAUNCHER_SRC.slice(LAUNCHER_SRC.indexOf('{#snippet appIcon'), LAUNCHER_SRC.indexOf('{/snippet}', LAUNCHER_SRC.indexOf('{#snippet appIcon')));
		// ABSENT: no mark component imported or mounted.
		expect(LAUNCHER_SRC).not.toMatch(/from '\$lib\/marks\//);
		expect(snippet).not.toMatch(/<[A-Z][A-Za-z]*Mark\b/);
		// PRESENT: every app but FRC has a filled icon, and the snippet draws it.
		expect(snippet).toContain('{@html iconSvg(id)}');
		const drawn = visibleApps(true).filter((a) => a.id !== 'frc');
		expect(drawn.length).toBeGreaterThanOrEqual(13);
		for (const a of drawn) expect(iconSvg(a.id), a.id).toMatch(/^<svg viewBox="0 0 32 32"/);
		expect(iconSvg('frc')).toBe('');
		// Still: nothing in the launcher's drawing animates.
		expect(ART_SRC).not.toMatch(/<animate|@keyframes|animation/);
		// AdminMark was never a launcher mark and never took `once`.
		const marks = readdirSync('src/lib/marks').filter((f) => f.endsWith('Mark.svelte') && f !== 'AdminMark.svelte');
		expect(marks.length).toBeGreaterThanOrEqual(12);
		for (const name of marks) {
			const mark = readFileSync(`src/lib/marks/${name}`, 'utf8');
			expect(mark, name).toMatch(/let \{[^}]*\bonce = false\b[^}]*\}/);
		}
	});

	it('leaves the FIRST mark exactly as FIRST draws it: the unmodified image, never animated or filtered', () => {
		const snippet = LAUNCHER_SRC.slice(LAUNCHER_SRC.indexOf('{#snippet appIcon'), LAUNCHER_SRC.indexOf('{/snippet}', LAUNCHER_SRC.indexOf('{#snippet appIcon')));
		expect(snippet).toContain('<img class="frc-icon-img" src={frcIcon} width="516" height="309"');
		const rule = LAUNCHER_CSS.slice(LAUNCHER_CSS.indexOf('.app-icon.frc-icon :global(.frc-icon-img) {'));
		const body = rule.slice(0, rule.indexOf('}'));
		expect(body).not.toMatch(/filter|animation|transform/);
		expect(cardBlock('frc')['--rm-icon-filter']).toBeUndefined();
	});
});
