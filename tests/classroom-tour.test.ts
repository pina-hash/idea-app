// tests/classroom-tour.test.ts
//
// THE CLASSROOM WALKTHROUGHS, THE LIST-WIDTH KNOB AND THE UPDATE LOG BY MONTH
// (ledger 0297, LEARN). Every guarantee here is one whose regression would be
// silent on screen:
//
//   1. A tour step that names a hook nothing renders is DROPPED by the engine,
//      so a renamed `data-testid` shortens the tour with nobody told. The sweep
//      holds every target to a real `data-testid` in `src/`.
//   2. The teacher tour is never a student's. `classroomTourFor` is the one
//      decision; each step that describes a registered action is held to that
//      action's ROLE in the registry, so a manager-only door cannot slip into
//      the student tour.
//   3. The offer is made once. `shouldOfferTour` answers only for `unseen`,
//      and the stored state is validated on read (an unknown id or state is
//      dropped, never coerced into "offer again").
//   4. The list width is clamped to what the layout supports, stored sparse
//      (the standard width is never written), and a Reset of the display group
//      takes it back.
//   5. The update log's month grouping keeps every entry exactly once.
//
// No geometry is asserted here; the browser specs own that.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	CLASSROOM_TOURS,
	STUDENT_TOUR,
	TEACHER_TOUR,
	classroomTourFor,
	resolveTourSteps,
	shouldOfferTour,
	tourModKey,
	tourStateAfter,
	tourTargets,
	type ClassroomTourStep
} from '$lib/tour/classroom-tours';
import { COMMANDS, commandById } from '$lib/shell/commands';
import {
	CLASSROOM_PREFERENCE_SCHEMA,
	CLASSROOM_TOUR_IDS,
	NAV_WIDTH_DEFAULT_REM,
	NAV_WIDTH_MAX_REM,
	NAV_WIDTH_MIN_REM,
	TOUR_STATES,
	clampNavWidth,
	defaultClassroomPreferences,
	navWidthWords,
	readClassroomPreferences,
	settingsForRole
} from '$lib/preferences/classroom';
import { MemoryPreferenceStore, compactPreferences } from '$lib/preferences/store';
import { CLASSROOM_UPDATES, monthLabel, updatesByMonth } from '$lib/classroom/updates';
import { STREAM_STATUS_LABELS } from '$lib/classroom/classroom';
import { sectionTabs } from '$lib/classroom/nav';

/* -------------------------------------------------------------------------
 * The source, read once: every `data-testid="..."` literal under src/.
 * ---------------------------------------------------------------------- */

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.(svelte|ts)$/.test(name)) out.push(p);
	}
	return out;
}
const SRC = walk(join(process.cwd(), 'src')).filter((p) => !p.includes(`${join('src', 'routes', 'dev')}`));
const TEST_IDS = new Set<string>();
for (const file of SRC) {
	const text = readFileSync(file, 'utf8');
	for (const m of text.matchAll(/data-testid="([A-Za-z0-9-]+)"/g)) TEST_IDS.add(m[1]);
	// `{testPrefix}` hooks: NotebookCapture's root is `data-testid={testPrefix}`, default `capture`.
	for (const m of text.matchAll(/testPrefix = '([a-z-]+)'/g)) TEST_IDS.add(m[1]);
}
/*
 * TWO HOOKS ARE BUILT FROM A LIST, and are expanded over that same list rather
 * than typed out: a tab is `section-tab-{t.id}` over `sectionTabs`, a status
 * chip is `stream-status-{st}` over `STREAM_STATUS_LABELS`. Each is asserted
 * to be spelled that way in its component, so a renamed template reddens here.
 */
const shell = readFileSync(join(process.cwd(), 'src/lib/classroom/ClassroomShell.svelte'), 'utf8');
const view = readFileSync(join(process.cwd(), 'src/lib/classroom/ClassView.svelte'), 'utf8');
if (shell.includes('data-testid="section-tab-{t.id}"'))
	for (const t of sectionTabs('s')) TEST_IDS.add(`section-tab-${t.id}`);
if (view.includes('data-testid="stream-status-{st}"'))
	for (const st of Object.keys(STREAM_STATUS_LABELS)) TEST_IDS.add(`stream-status-${st}`);

const idOf = (target: string) => /^\[data-testid="([^"]+)"\]$/.exec(target)?.[1] ?? null;

describe('every tour target is a real, stable hook', () => {
	const targets = tourTargets();

	it('the sweep read something (positive control): the shell and the class page hooks are there', () => {
		expect(TEST_IDS.size).toBeGreaterThan(200);
		for (const id of ['palette-trigger', 'settings-trigger', 'tour-trigger', 'stream-search', 'section-tab-live'])
			expect(TEST_IDS, id).toContain(id);
	});

	it('every target is a single data-testid selector, never a style class', () => {
		expect(targets.length).toBeGreaterThanOrEqual(15);
		for (const t of targets) expect(idOf(t), t).not.toBeNull();
	});

	it('every target names a data-testid somewhere in src/ (a renamed hook would silently drop a step)', () => {
		const missing = targets.map(idOf).filter((id) => id && !TEST_IDS.has(id));
		expect(missing).toEqual([]);
	});
});

describe('the words are written for somebody who was never shown anything', () => {
	const all: { tour: string; step: ClassroomTourStep }[] = Object.entries(CLASSROOM_TOURS).flatMap(
		([tour, steps]) => steps.map((step) => ({ tour, step }))
	);

	it('every variant is at most two sentences, carries no em dash and names no weekday', () => {
		let checked = 0;
		for (const { step } of all) {
			for (const v of step.variants) {
				checked++;
				// A sentence ends at . ! or ? followed by a capital or the end; the `?`
				// KEY named inside a sentence ("and ? to see...") is not an ending.
				const sentences = v.body.split(/[.!?](?=\s+[A-Z{]|\s*$)/).filter((s) => s.trim().length > 1);
				expect(sentences.length, `${step.id}: ${v.body}`).toBeLessThanOrEqual(2);
				expect(v.body, step.id).not.toMatch(/—/);
				expect(v.title, step.id).not.toMatch(/—/);
				expect(v.body, step.id).not.toMatch(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/);
				expect(v.body.length, step.id).toBeLessThanOrEqual(160);
			}
		}
		expect(checked).toBeGreaterThanOrEqual(20);
	});

	it('the {mod} token becomes the keyboard the reader has', () => {
		expect(tourModKey('MacIntel')).toBe('⌘');
		expect(tourModKey('Win32')).toBe('Ctrl');
		const steps = resolveTourSteps(TEACHER_TOUR, () => true, '⌘');
		const search = steps.find((s) => s.id === 'search')!;
		expect(search.body).toContain('⌘ K');
		expect(search.body).not.toContain('{mod}');
	});
});

describe('the teacher tour is never a student\'s', () => {
	it('classroomTourFor: in a class, only a manager of it gets the teacher tour', () => {
		expect(classroomTourFor({ inClass: true, canManage: true, isStaff: false, isAdmin: false })).toBe('teacher');
		expect(classroomTourFor({ inClass: true, canManage: false, isStaff: false, isAdmin: false })).toBe('student');
		// A teacher enrolled in somebody else's class is a student THERE.
		expect(classroomTourFor({ inClass: true, canManage: false, isStaff: true, isAdmin: false })).toBe('student');
		expect(classroomTourFor({ inClass: true, canManage: false, isStaff: true, isAdmin: true })).toBe('student');
	});

	it('classroomTourFor: outside a class, staff get the teacher tour and a student never does', () => {
		expect(classroomTourFor({ inClass: false, canManage: false, isStaff: true, isAdmin: false })).toBe('teacher');
		expect(classroomTourFor({ inClass: false, canManage: false, isStaff: false, isAdmin: true })).toBe('teacher');
		expect(classroomTourFor({ inClass: false, canManage: false, isStaff: false, isAdmin: false })).toBe('student');
		// canManage is the server's answer about a CLASS; with no class on screen it carries no weight.
		expect(classroomTourFor({ inClass: false, canManage: true, isStaff: false, isAdmin: false })).toBe('student');
	});

	it('every step naming a command names a real one, and its role is one the tour\'s reader holds', () => {
		let named = 0;
		for (const [tour, steps] of Object.entries(CLASSROOM_TOURS)) {
			const reader = tour === 'teacher' ? 'manager' : 'student';
			for (const step of steps) {
				if (!step.command) continue;
				named++;
				const cmd = commandById(step.command);
				expect(cmd, `${tour}/${step.id} -> ${step.command}`).not.toBeNull();
				expect(['any', reader], `${tour}/${step.id} is ${cmd!.role}`).toContain(cmd!.role);
			}
		}
		expect(named).toBeGreaterThanOrEqual(12);
	});

	it('POSITIVE CONTROL: the registry has manager-only commands the student tour could have named', () => {
		const managerOnly = COMMANDS.filter((c) => c.role === 'manager').map((c) => c.id);
		expect(managerOnly).toEqual(expect.arrayContaining(['class.live', 'class.grades', 'class.new-post']));
		const studentCommands = STUDENT_TOUR.map((s) => s.command).filter(Boolean);
		for (const id of managerOnly) expect(studentCommands).not.toContain(id);
	});

	it('the student tour points at none of the teacher-only controls, on any page', () => {
		const teacherOnlyHooks = ['new-post', 'section-tab-live', 'live-open-projector', 'section-tab-grades', 'grade-key-legend', 'mode-approve'];
		const studentTargets = STUDENT_TOUR.flatMap((s) => s.variants.map((v) => idOf(v.target)));
		for (const hook of teacherOnlyHooks) expect(studentTargets).not.toContain(hook);
		// And the teacher tour does point at them, so the list above is not empty by accident.
		const teacherTargets = TEACHER_TOUR.flatMap((s) => s.variants.map((v) => idOf(v.target)));
		for (const hook of teacherOnlyHooks) expect(teacherTargets).toContain(hook);
	});
});

describe('the steps that run are the ones on screen', () => {
	it('each concept takes its first variant that is present, and falls back to the door', () => {
		const onLive = resolveTourSteps(TEACHER_TOUR, (s) => s !== '[data-testid="section-tab-live"]');
		expect(onLive.find((s) => s.id === 'live')!.target).toBe('[data-testid="live-open-projector"]');
		const onClass = resolveTourSteps(TEACHER_TOUR, (s) => s !== '[data-testid="live-open-projector"]');
		expect(onClass.find((s) => s.id === 'live')!.target).toBe('[data-testid="section-tab-live"]');
		const grading = resolveTourSteps(TEACHER_TOUR, (s) => s === '[data-testid="grade-key-legend"]');
		expect(grading.map((s) => s.id)).toEqual(['grading']);
	});

	it('a concept with nothing on screen is left out, and no target is pointed at twice', () => {
		const present = new Set(['[data-testid="shell-menu"]', '[data-testid="stream-search"]', '[data-testid="class-strip"]']);
		const steps = resolveTourSteps(STUDENT_TOUR, (s) => present.has(s));
		expect(steps.map((s) => s.id)).toEqual(['menu', 'class-search']);
		// The class strip is class-search's SECOND variant; it is not reached because the first is present.
		const noSearch = resolveTourSteps(STUDENT_TOUR, (s) => s === '[data-testid="class-strip"]');
		expect(noSearch.map((s) => s.target)).toEqual(['[data-testid="class-strip"]']);
		const dup = resolveTourSteps(
			[
				{ id: 'a', variants: [{ target: 'x', title: 'A', body: 'a.' }] },
				{ id: 'b', variants: [{ target: 'x', title: 'B', body: 'b.' }] }
			],
			() => true
		);
		expect(dup.map((s) => s.id)).toEqual(['a']);
	});

	it('both tours end on the Tour control, so the reader knows where to find it again', () => {
		for (const steps of Object.values(CLASSROOM_TOURS)) expect(steps[steps.length - 1].command).toBe('tour.start');
	});
});

describe('the offer is made once, and the stored state is validated on read', () => {
	it('only an unseen tour is offered', () => {
		expect(TOUR_STATES).toEqual(['unseen', 'offered', 'finished', 'dismissed']);
		expect(TOUR_STATES.filter(shouldOfferTour)).toEqual(['unseen']);
	});

	it('every ending counts as seen, and only a finish reads as taken', () => {
		expect(tourStateAfter('completed')).toBe('finished');
		expect(tourStateAfter('skipped')).toBe('dismissed');
		expect(tourStateAfter('closed')).toBe('dismissed');
		for (const r of ['completed', 'skipped', 'closed'] as const) expect(shouldOfferTour(tourStateAfter(r))).toBe(false);
	});

	it('a stored state reads back per tour; an unknown id or state is dropped, never coerced into offering again', () => {
		expect(readClassroomPreferences({}).guidance.tours).toEqual({ teacher: 'unseen', student: 'unseen' });
		const p = readClassroomPreferences({
			guidance: { tours: { teacher: 'offered', student: 'finished', janitor: 'unseen' } }
		});
		expect(p.guidance.tours).toEqual({ teacher: 'offered', student: 'finished' });
		expect(readClassroomPreferences({ guidance: { tours: { teacher: 'OFFERED', student: 7 } } }).guidance.tours).toEqual({
			teacher: 'unseen',
			student: 'unseen'
		});
		expect(readClassroomPreferences({ guidance: { tours: 'offered' } }).guidance.tours).toEqual({
			teacher: 'unseen',
			student: 'unseen'
		});
		expect([...CLASSROOM_TOUR_IDS]).toEqual(Object.keys(CLASSROOM_TOURS));
	});

	it('writing "offered" through the store is one sparse group, and Reset puts the offer back', () => {
		const store = new MemoryPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA);
		const g = store.current.guidance;
		store.set('guidance', { ...g, tours: { ...g.tours, student: 'offered' } });
		expect(store.stored()).toEqual({ guidance: { tours: { teacher: 'unseen', student: 'offered' } } });
		expect(shouldOfferTour(store.current.guidance.tours.student)).toBe(false);
		expect(shouldOfferTour(store.current.guidance.tours.teacher)).toBe(true);
		store.reset('guidance');
		expect(store.stored()).toEqual({});
		expect(shouldOfferTour(store.current.guidance.tours.student)).toBe(true);
	});

	it('Settings offers the tour state to both roles (it has a reader now)', () => {
		for (const role of ['student', 'manager'] as const)
			expect(settingsForRole(role).map((g) => g.group)).toContain('guidance');
	});
});

describe('the list width knob', () => {
	it('clamps to what the layout supports, in whole rem, and the standard width stores as nothing', () => {
		expect(NAV_WIDTH_DEFAULT_REM).toBe(26);
		expect(clampNavWidth(NAV_WIDTH_DEFAULT_REM)).toBeNull();
		expect(clampNavWidth(30)).toBe(30);
		expect(clampNavWidth(30.4)).toBe(30);
		expect(clampNavWidth(2)).toBe(NAV_WIDTH_MIN_REM);
		expect(clampNavWidth(400)).toBe(NAV_WIDTH_MAX_REM);
		for (const junk of [null, undefined, '30', NaN, Infinity, {}, []]) expect(clampNavWidth(junk)).toBeNull();
	});

	it('is validated on read, stored sparse, and a Reset of the display group takes it back', () => {
		expect(readClassroomPreferences({ display: { navWidth: 'wide' } }).display.navWidth).toBeNull();
		expect(readClassroomPreferences({ display: { navWidth: 99 } }).display.navWidth).toBe(NAV_WIDTH_MAX_REM);
		const store = new MemoryPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA);
		store.set('display', { ...store.current.display, navWidth: 32 });
		expect(store.stored()).toEqual({ display: { navWidth: 32 } });
		store.set('display', { ...store.current.display, density: 'compact' });
		expect(store.stored()).toEqual({ display: { density: 'compact', navWidth: 32 } });
		store.reset('display');
		expect(store.current.display).toEqual(defaultClassroomPreferences().display);
		expect(store.stored()).toEqual({});
		const p = defaultClassroomPreferences();
		p.display.navWidth = 20;
		expect(compactPreferences(CLASSROOM_PREFERENCE_SCHEMA, p)).toEqual({ display: { navWidth: 20 } });
	});

	it('says how far from standard it is, in steps, never in a unit a student has to know', () => {
		expect(navWidthWords(null)).toBe('Standard');
		expect(navWidthWords(27)).toBe('1 step wider');
		expect(navWidthWords(22)).toBe('4 steps narrower');
	});

	it('both roles are offered it in Settings, beside density for a teacher, under one Reset', () => {
		const student = settingsForRole('student').find((g) => g.group === 'display')!;
		expect(student.settings.map((s) => s.title)).toEqual(['List width']);
		const manager = settingsForRole('manager').find((g) => g.group === 'display')!;
		expect(manager.settings.map((s) => s.title)).toEqual(['Density', 'List width']);
	});
});

describe('the update log by month', () => {
	it('keeps every entry exactly once, months newest first, entries newest first inside each', () => {
		const months = updatesByMonth();
		expect(months.length).toBeGreaterThan(1);
		const flat = months.flatMap((m) => m.entries);
		expect(flat).toHaveLength(CLASSROOM_UPDATES.length);
		expect(new Set(flat)).toEqual(new Set(CLASSROOM_UPDATES));
		for (let i = 1; i < months.length; i++) expect(months[i - 1].key > months[i].key).toBe(true);
		for (const m of months) {
			for (const e of m.entries) expect(e.date.slice(0, 7)).toBe(m.key);
			for (let i = 1; i < m.entries.length; i++) expect(m.entries[i - 1].date >= m.entries[i].date).toBe(true);
		}
	});

	it('names a month in words, fixed to en-US, and never moves an entry across a month by time zone', () => {
		expect(monthLabel('2026-09')).toBe('September 2026');
		expect(monthLabel('2026-01')).toBe('January 2026');
		const edge = updatesByMonth([
			{ date: '2026-09-01', title: 'a', body: '', tags: [] },
			{ date: '2026-08-31', title: 'b', body: '', tags: [] }
		]);
		expect(edge.map((m) => [m.key, m.entries.map((e) => e.title)])).toEqual([
			['2026-09', ['a']],
			['2026-08', ['b']]
		]);
	});
});
