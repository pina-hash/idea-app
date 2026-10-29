// tests/home-order-and-accent.test.ts
//
// TWO HOME-PAGE GUARANTEES WHOSE REGRESSION IS SILENT.
//
// 1. THE SECTION ORDER. Apps sits above Your Classes for a viewer who manages
//    any section, and below it for everyone else. A regression either way looks
//    completely ordinary on screen -- nobody holds both roles at once, and the
//    only symptom is a scroll distance nobody measures.
//
// 2. EVERY LAUNCHER CARD IS A MINIATURE OF ITS OWN APP (ledger 0472,
//    decision 73). Mr. Pina asked for it at least four times; every earlier
//    attempt styled the cards from a palette instead of from the apps. What is
//    pinned here is what he asked for, as far as source can say it: every card
//    has its app's own paint, drawing and room entry; every colour on a card
//    TRACES to its app's own files; no two cards share a look; a card follows
//    its room (not the site theme) on Space White; and every word on a card
//    clears 4.5:1 in every theme. The paint still arrives through the cascade
//    (`$lib/launcher/cards.css`, keyed on `data-app`), never stamped inline,
//    because an inline custom property beats every rule and a stamped colour
//    is how eleven wrong accents once painted for months.
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
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import Home from '../src/routes/+page.svelte';
import AppLauncher from '$lib/AppLauncher.svelte';
import { PORTAL_APPS, visibleApps, type PortalApp } from '$lib/portal-apps';
import { LAUNCHER_ROOMS, launcherRoom, type LauncherRoom } from '$lib/launcher/rooms';
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

/* ---- the room paint, read from its own file ---------------------------- */

const CARDS_CSS = readFileSync(new URL('../src/lib/launcher/cards.css', import.meta.url), 'utf8');
const CARD_ART = readFileSync(new URL('../src/lib/launcher/CardArt.svelte', import.meta.url), 'utf8');
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
const COLOUR_PROPS = /^--rm-(ground|edge|edge-hover|title|title-glow|title-img|title-fill|title-filter|accent|accent-glow|icon|sub|cta-ink|cta-bg|cta-img|cta-edge|cta-glow|cta-led|cta-dot|glow|art-bg|seam-glow|a\d+|g\d+)$/;

/** The text of every source file a card names, and of its ROOM files (the site token file aside). */
const SITE_FILE = 'src/lib/design-system/colors.css';
const sourceText = (files: readonly string[]) => files.map((f) => readFileSync(f, 'utf8')).join('\n');
const normalTriple = (t: string) => t.split(',').slice(0, 3).map((x) => x.trim()).join(',');

/**
 * WHY A VALUE IS NOT TRACEABLE TO ITS ROOM, or null. A literal (a hex, or an
 * rgb()/rgba() triple) must appear in one of the card's source files; a token
 * `var(--x)` must be read or declared by one of its ROOM files (not only by
 * the site token file, which declares every token there is and so would
 * vouch for anything). The fallback inside a `var()` is a literal like any
 * other. Font, size and radius tokens are not colours and are not asked.
 */
function untraceable(value: string, room: LauncherRoom): string | null {
	const all = sourceText(room.sources).toLowerCase();
	const roomText = sourceText(room.sources.filter((f) => f !== SITE_FILE));
	for (const h of value.match(/#[0-9a-f]{3,8}\b/gi) ?? []) if (!all.includes(h.toLowerCase())) return `${h} is not in ${room.sources.join(', ')}`;
	const triples = [...all.matchAll(/rgba?\(([^)]*)\)/g)].map((m) => normalTriple(m[1]));
	for (const m of value.matchAll(/rgba?\(([^)]*)\)/gi)) if (!triples.includes(normalTriple(m[1]))) return `rgb(${m[1]}) is not in ${room.sources.join(', ')}`;
	// A room may name a family of tokens through a template, as status-tone.ts
	// does (`var(--status-${t}-solid)`): any token that fits it is read there.
	const templates = [...roomText.matchAll(/var\((--[a-z0-9-]*)\$\{[^}]+\}([a-z0-9-]*)\)/g)].map((m) => [m[1], m[2]] as const);
	for (const m of value.matchAll(/var\((--[a-z0-9-]+)/g)) {
		const t = m[1];
		if (t.startsWith('--rm-') || /^--(font|radius|plate-r)-/.test(t)) continue;
		if (roomText.includes(`var(${t}`) || roomText.includes(`${t}:`)) continue;
		if (templates.some(([pre, post]) => pre.length > 3 && t.startsWith(pre) && t.endsWith(post) && t.length > pre.length + post.length)) continue;
		return `${t} is read by none of ${room.sources.filter((f) => f !== SITE_FILE).join(', ')}`;
	}
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
		const bare = reads.filter((m) => m[2] === ')' && !['--rm-band'].includes(m[1])).map((m) => m[1]);
		expect(bare).toEqual([]);
		// And the launcher's own stylesheet declares no room paint itself.
		expect(LAUNCHER_CSS).not.toMatch(/\.app-card\[data-app=/);
		expect(LAUNCHER_CSS).not.toMatch(/--id-[a-z]/);
	});
});

describe('every launcher card is a miniature of its own app (ledger 0472, decision 73)', () => {
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
		const ctaBgP = col('--rm-cta-bg', 'transparent');
		const ctaGround = over(ctaBgP, ground);
		const ctaStops = (p['--rm-cta-img'] ?? '').match(/#[0-9a-f]{6}\b/gi)?.map((h) => K.hex(h)) ?? [];
		return {
			ground,
			title: over(col('--rm-title', 'var(--text-1)'), ground),
			accent: p['--rm-accent'] ? over(col('--rm-accent', 'inherit'), ground) : null,
			icon: over(col('--rm-icon', 'var(--text-1)'), ground),
			sub: over(col('--rm-sub', 'var(--text-2)'), ground),
			cta: over(col('--rm-cta-ink', 'var(--text-1)'), ctaGround),
			ctaGrounds: [ctaGround, ...ctaStops],
			// The title's whole treatment: face, weight, case and tracking.
			titleFace: [p['--rm-title-font'] ?? 'var(--font-display)', p['--rm-title-weight'] ?? '700', p['--rm-title-case'] ?? 'none', p['--rm-title-track'] ?? '0.02em'].join(' ')
		};
	}

	it('gives every app the launcher can draw a room entry, a paint block and a drawing, and nothing else one', () => {
		const ids = EVERY_APP.map((a) => a.id).sort();
		expect(ids.length).toBeGreaterThanOrEqual(14); // positive control: an admin's whole launcher
		expect(LAUNCHER_ROOMS.map((r) => r.id).sort()).toEqual(ids);
		const blocks = [...CARDS_CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/^\.app-card\[data-app='([a-z-]+)'\]\s*\{/gm)].map((m) => m[1]).sort();
		expect(blocks).toEqual(ids);
		const drawings = [...CARD_ART.matchAll(/app === '([a-z-]+)'/g)].map((m) => m[1]);
		// Every app is drawn, and the Foundry's seam is the one second branch.
		for (const id of ids) expect(drawings, id).toContain(id);
		expect(drawings.filter((d) => !ids.includes(d))).toEqual([]);
		// Each paint block says something: a ground, a title and an icon at least.
		for (const id of ids) for (const prop of ['--rm-ground', '--rm-title', '--rm-icon']) expect(cardBlock(id)[prop], `${id} ${prop}`).toBeDefined();
	});

	it('traces every colour on every card to its own app\'s files', () => {
		const offenders: string[] = [];
		let checked = 0;
		for (const room of LAUNCHER_ROOMS) {
			for (const theme of THEMES) {
				const block = theme === 'idea' ? cardBlock(room.id) : cardBlock(room.id, theme);
				for (const [prop, value] of Object.entries(block)) {
					if (!COLOUR_PROPS.test(prop)) continue;
					checked++;
					const why = untraceable(value, room);
					if (why) offenders.push(`${room.id} ${theme} ${prop}: ${why}`);
				}
			}
		}
		expect(checked).toBeGreaterThan(150); // positive control: the reader found the paint
		expect(offenders).toEqual([]);
	});

	it('NEGATIVE CONTROL: the tracer refuses a colour the room does not use, and a token it does not read', () => {
		const gauntlet = launcherRoom('gauntlet')!;
		expect(untraceable('#00ff41', gauntlet)).toBeNull();
		expect(untraceable('#123456', gauntlet)).toMatch(/not in/);
		expect(untraceable('rgba(1, 2, 3, 0.4)', gauntlet)).toMatch(/not in/);
		// The plate's tokens are the Armory's own; GAUNTLET's VIEWPORT reads none of them.
		expect(untraceable('var(--plate-panel-top)', launcherRoom('armory')!)).toBeNull();
		expect(untraceable('var(--plate-panel-top)', gauntlet)).toMatch(/read by none/);
		// And the same planted value in a parsed block is caught by the block reader.
		const planted = CARDS_CSS + "\n.app-card[data-app='gauntlet'] { --rm-a8: #123456; }\n";
		expect(untraceable(cardBlock('gauntlet', 'idea', planted)['--rm-a8'], gauntlet)).toMatch(/not in/);
	});

	it('draws no colour of its own in CardArt but the Foundry pour, which is the forge\'s own', () => {
		const foundry = sourceText(launcherRoom('foundry')!.sources).toLowerCase();
		const literals = CARD_ART.replace(/<!--[\s\S]*?-->/g, '').match(/#[0-9a-f]{6}\b/gi) ?? [];
		expect(literals.length).toBeGreaterThan(5); // positive control: the seam's stops were read
		for (const h of literals) expect(foundry, h).toContain(h.toLowerCase());
		// The cover tiles are the gallery's generated covers, at the gallery's own saturation and lightness.
		expect(CARD_ART).toContain('34% 27%');
		expect(CARD_ART).toContain('40% 15%');
		expect(foundry).toContain('34% 27%');
		expect(foundry).toContain('40% 15%');
		// It does not move: the mark is what plays, once, gated.
		expect(CARD_ART).not.toMatch(/@keyframes|animation\s*:/);
	});

	it('looks like no other card: under every theme each pair differs in its ground, words, mark or face', () => {
		const near = (a: Rgb, b: Rgb) => K.deltaE2000(a, b) < 10;
		let pairs = 0;
		const same: string[] = [];
		for (const theme of THEMES) {
			const r = EVERY_APP.map((a) => [a.id, resolved(a.id, theme)] as const);
			for (let i = 0; i < r.length; i++)
				for (let j = i + 1; j < r.length; j++) {
					pairs++;
					const [a, x] = r[i];
					const [b, y] = r[j];
					const alike = near(x.ground, y.ground) && near(x.title, y.title) && near(x.icon, y.icon) && near(x.cta, y.cta) && x.titleFace === y.titleFace;
					if (alike) same.push(`${theme}: ${a} / ${b}`);
				}
		}
		expect(pairs).toBeGreaterThan(200); // positive control
		expect(same).toEqual([]);
	});

	it('follows its ROOM on Space White: a room that never changes keeps its card, a room that turns light turns its card', () => {
		const key = (x: ReturnType<typeof resolved>) => [x.ground, x.title, x.icon, x.cta].map((c) => `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`).join(' ');
		for (const room of LAUNCHER_ROOMS) {
			const idea = resolved(room.id, 'idea');
			const sw = resolved(room.id, 'space-white');
			if (room.followsTheme) {
				// Its ground turns light, as its room's does (positive direction).
				expect(K.contrast(sw.ground, K.hex('#0d1311')), `${room.id} turns light`).toBeGreaterThan(10);
			} else {
				// GAUNTLET, GREENLINE, VANGUARD, IdeaCAD, FRC: identical on every theme.
				expect(key(sw), `${room.id} on Space White`).toBe(key(idea));
				expect(key(resolved(room.id, 'matrix')), `${room.id} on Matrix`).toBe(key(idea));
				expect(cardBlock(room.id, 'space-white'), room.id).toEqual({});
				expect(cardBlock(room.id, 'matrix'), room.id).toEqual({});
			}
		}
		// Both kinds exist, so neither direction above passed empty.
		expect(LAUNCHER_ROOMS.filter((r) => r.followsTheme).length).toBeGreaterThan(3);
		expect(LAUNCHER_ROOMS.filter((r) => !r.followsTheme).map((r) => r.id).sort()).toEqual(['frc', 'gauntlet', 'greenline', 'ideacad', 'vanguard']);
	});

	it('clears 4.5:1 for every word on every card in every theme (title, its accent, description, call to action) and 3:1 for its mark', () => {
		const fails: string[] = [];
		let n = 0;
		for (const theme of THEMES)
			for (const app of EVERY_APP) {
				const x = resolved(app.id, theme);
				const check = (what: string, ink: Rgb, ground: Rgb) => {
					n++;
					const c = K.contrast(ink, ground);
					if (c < 4.5) fails.push(`${theme} ${app.id} ${what} ${c.toFixed(2)}`);
				};
				check('title', x.title, x.ground);
				if (x.accent) check('title accent', x.accent, x.ground);
				check('description', x.sub, x.ground);
				for (const g of x.ctaGrounds) check('call to action', x.cta, g);
				// The mark is a graphical object: 3:1 on its card.
				n++;
				const glyph = K.contrast(x.icon, x.ground);
				if (glyph < 3) fails.push(`${theme} ${app.id} mark ${glyph.toFixed(2)}`);
			}
		// Positive control: 14 cards x 3 themes x (title, description, call to action), and more.
		expect(n).toBeGreaterThanOrEqual(14 * 3 * 3);
		expect(fails).toEqual([]);
	});
});

describe('launcher cards: the marks', () => {
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

	it('leaves the FIRST mark exactly as FIRST draws it: the unmodified image, never animated or filtered', () => {
		const snippet = LAUNCHER_SRC.slice(LAUNCHER_SRC.indexOf('{#snippet appIcon'), LAUNCHER_SRC.indexOf('{/snippet}', LAUNCHER_SRC.indexOf('{#snippet appIcon')));
		expect(snippet).toContain('<img class="frc-icon-img" src={frcIcon} width="516" height="309"');
		const rule = LAUNCHER_CSS.slice(LAUNCHER_CSS.indexOf('.app-icon.frc-icon :global(.frc-icon-img) {'));
		const body = rule.slice(0, rule.indexOf('}'));
		expect(body).not.toMatch(/filter|animation|transform/);
		expect(cardBlock('frc')['--rm-icon-filter']).toBeUndefined();
	});
});
