// tests/home-order-and-accent.test.ts
//
// TWO HOME-PAGE GUARANTEES WHOSE REGRESSION IS SILENT.
//
// 1. THE SECTION ORDER. Apps sits above Your Classes for a viewer who manages
//    any section, and below it for everyone else. A regression either way looks
//    completely ordinary on screen -- nobody holds both roles at once, and the
//    only symptom is a scroll distance nobody measures.
//
// 2. THE SHARED ACCENT. Launcher cards carry ONE accent and are told apart by
//    name, tagline and status badge (CLAUDE.md, "Launcher cards carry ONE
//    shared accent"). That rule was already written down and already broken:
//    every PORTAL_APPS entry declared a `theme`, AppLauncher wrote it onto the
//    card as an inline `--acc-primary`/`--acc-secondary`, and an inline custom
//    property beats the class rule -- so `.app-card`'s uniform token never
//    painted on a single card and nothing said so. A constant only makes the
//    right thing available; this is what stops the wrong thing coming back.
//
// SSR-ONLY, the classroom-body-render.test.ts pattern: `svelte/server`'s
// render() mounts the REAL components and hands back markup. There is no DOM
// harness here, so "which comes first" is asserted as DOCUMENT ORDER in that
// markup, which is what a screen reader and the tab order follow and therefore
// the thing actually worth pinning.

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Home from '../src/routes/+page.svelte';
import AppLauncher from '$lib/AppLauncher.svelte';
import { PORTAL_APPS, visibleApps } from '$lib/portal-apps';
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

describe('launcher cards carry ONE shared accent', () => {
	it('no app declares a per-card colour of any kind', () => {
		expect(PORTAL_APPS.length).toBeGreaterThan(5); // positive control
		const offenders = PORTAL_APPS.filter((app) =>
			Object.keys(app).some((k) => /theme|colou?r|accent|palette/i.test(k))
		).map((a) => a.id);
		expect(offenders).toEqual([]);
	});

	it('stamps no inline accent on any card, so the class rule is what paints', () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const html = render(AppLauncher as any, { props: { onRequireSignIn: () => {} } }).body;
		const cards = html.split('class="app-card').length - 1;
		// Positive control: an assertion about "no card carries X" is worthless
		// if no card rendered.
		expect(cards).toBe(visibleApps(false).length);
		expect(cards).toBeGreaterThan(5);
		expect(html).not.toContain('--acc-primary:');
		expect(html).not.toContain('--acc-secondary:');
		expect(html).not.toContain('--card-texture');
	});
});
