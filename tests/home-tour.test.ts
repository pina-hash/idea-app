// tests/home-tour.test.ts
//
// THE HOME PAGE'S WALKTHROUGH (ledger 0298, report R22). Every guarantee here
// is one whose regression would be silent on screen:
//
//   1. A step that names a hook nothing renders is DROPPED by the engine, so a
//      renamed `data-tour` or `data-testid` shortens the tour with nobody told.
//      The sweep holds every target to a real hook in `src/`.
//   2. The staff tour is never a student's. `homeTourFor` is the classroom's
//      rule with no class on screen, the admin-only cards are steps only for
//      somebody the launcher shows them to, and a student never reads the
//      staff words -- both directions, each with its positive control.
//   3. Every card that renders gets a step and no other card does: the steps
//      are derived from `visibleApps`, never listed.
//   4. Somebody who finished the OLD tour is offered the new one ONCE. The
//      stamp that records the offer can never read as "older tour" again,
//      whatever the browser's clock says, or the offer would come back on
//      every visit with nothing on screen saying why.
//   5. The report step reads `REPORT_LABEL` and never types the words.
//
// No geometry is asserted here; `tools/browser-verify/routes/tour-*` own that.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	APP_TOUR_WORDS,
	HOME_TOUR_VERSION,
	SIGNIN_STEP,
	homeTourDefs,
	homeTourFor,
	homeTourPlan,
	homeTourSeenStamp,
	homeTourTargets,
	orderFlow,
	resolveHomeTour,
	type HomeTourId
} from '$lib/tour/orientation';
import { classroomTourFor } from '$lib/tour/classroom-tours';
import { PORTAL_APPS, visibleApps } from '$lib/portal-apps';
import { REPORT_LABEL, REPORT_LABEL_SHORT } from '$lib/feedback/context';

/* -------------------------------------------------------------------------
 * The source, read once: every hook literal under src/ (the /dev harnesses
 * excluded, so a hook only a harness carries cannot pass for a real one).
 * ---------------------------------------------------------------------- */

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.(svelte|ts)$/.test(name)) out.push(p);
	}
	return out;
}
const SRC = walk(join(process.cwd(), 'src')).filter((p) => !p.includes(join('src', 'routes', 'dev')));
const TOUR_HOOKS = new Set<string>();
const TEST_IDS = new Set<string>();
for (const file of SRC) {
	const text = readFileSync(file, 'utf8');
	for (const m of text.matchAll(/data-tour="([A-Za-z0-9-]+)"/g)) TOUR_HOOKS.add(m[1]);
	for (const m of text.matchAll(/data-testid="([A-Za-z0-9-]+)"/g)) TEST_IDS.add(m[1]);
}
/*
 * THE CARD HOOK IS BUILT FROM THE REGISTRY (`data-tour={app.id}`), so it is
 * expanded over that same registry rather than typed out -- and only when the
 * launcher still spells it that way, in BOTH of the card's states (a link, and
 * a reorderable tile while customizing), so a renamed template reddens here.
 */
const launcher = readFileSync(join(process.cwd(), 'src/lib/AppLauncher.svelte'), 'utf8');
// On a line of its own: an attribute in markup, never a mention in a comment.
const CARD_HOOK_SPELLINGS = launcher.match(/^\s*data-tour=\{app\.id\}\s*$/gm)?.length ?? 0;
if (CARD_HOOK_SPELLINGS >= 2) for (const a of PORTAL_APPS) TOUR_HOOKS.add(a.id);

/**
 * HOOKS A STEP MAY NAME BEFORE THIS TREE HAS THEM, each with its reason. The
 * quick note's trigger belongs to the notebook bundle built the same night
 * (ledger 0298, Tier D) on its own branch; its step is written now so the
 * tour covers it the moment both land, and until then the engine drops it.
 * Once that bundle is merged the hook is in `src/` and this entry is inert --
 * remove it then, so the sweep holds the hook like every other.
 */
const ARRIVING: Record<string, string> = {
	'qn-trigger': 'the quick note trigger, from the notebook bundle (ledger 0298, Tier D)'
};

const hookOf = (target: string): { kind: 'tour' | 'testid'; id: string } | null => {
	const m = /^\[data-(tour|testid)="([^"]+)"\]$/.exec(target);
	return m ? { kind: m[1] === 'tour' ? 'tour' : 'testid', id: m[2] } : null;
};

describe('every home tour target is a real, stable hook', () => {
	const targets = homeTourTargets();

	it('the sweep read something (positive control): the home page and launcher hooks are there', () => {
		expect(CARD_HOOK_SPELLINGS).toBe(2);
		for (const id of ['signin', 'hero', 'classes', 'apps', 'app-tools', 'tour-trigger', 'profile', 'report'])
			expect(TOUR_HOOKS, id).toContain(id);
		expect(TEST_IDS).toContain('todo-strip');
		expect(TEST_IDS.size).toBeGreaterThan(200);
	});

	it('every target is one data-tour or data-testid selector, never a style class', () => {
		expect(targets.length).toBeGreaterThanOrEqual(20);
		for (const t of targets) expect(hookOf(t), t).not.toBeNull();
	});

	it('every target names a hook somewhere in src/ (a renamed hook would silently drop a step)', () => {
		const missing = targets
			.map(hookOf)
			.filter((h) => h && !(h.kind === 'tour' ? TOUR_HOOKS : TEST_IDS).has(h.id) && !(h.id in ARRIVING))
			.map((h) => h!.id);
		expect(missing).toEqual([]);
	});

	it('an arriving hook is named by a step, so the allowance is not left over from nothing', () => {
		const ids = new Set(targets.map((t) => hookOf(t)?.id));
		for (const id of Object.keys(ARRIVING)) expect(ids, id).toContain(id);
	});

	it('the tour control is named by the word printed on it', () => {
		const home = readFileSync(join(process.cwd(), 'src/routes/+page.svelte'), 'utf8');
		const at = home.indexOf('data-tour="tour-trigger"');
		expect(at).toBeGreaterThan(0);
		// The button's own text: whatever follows the last `>` before it closes.
		const printed = home.slice(at, home.indexOf('</button>', at)).split('>').pop()!.trim();
		expect(printed).toBe('Take the tour');
		const step = homeTourDefs('student', false).find((d) => d.id === 'tour-again')!;
		expect(step.variants[0].title).toBe('Take the tour');
	});
});

describe('the words are written for somebody who was never shown anything', () => {
	const every: { tour: HomeTourId; id: string; title: string; body: string }[] = [];
	for (const tour of ['student', 'teacher'] as const)
		for (const d of homeTourDefs(tour, true)) for (const v of d.variants) every.push({ tour, id: d.id, ...v });

	it('every step is at most two sentences, carries no em dash and names no weekday', () => {
		for (const s of every) {
			const sentences = s.body.split(/[.!?](?=\s+[A-Z{]|\s*$)/).filter((x) => x.trim().length > 1);
			expect(sentences.length, `${s.tour}/${s.id}: ${s.body}`).toBeLessThanOrEqual(2);
			expect(s.body, s.id).not.toMatch(/—/);
			expect(s.title, s.id).not.toMatch(/—/);
			expect(s.body, s.id).not.toMatch(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/);
			expect(s.body.length, `${s.tour}/${s.id}`).toBeLessThanOrEqual(160);
		}
		expect(every.length).toBeGreaterThanOrEqual(40);
	});

	it('the report step reads REPORT_LABEL, and the words are never typed in the tour file', () => {
		for (const tour of ['student', 'teacher'] as const) {
			const step = homeTourDefs(tour, false).find((d) => d.id === 'report')!;
			expect(step.variants[0].title).toBe(REPORT_LABEL);
			expect(step.variants[0].body).toContain(REPORT_LABEL);
			expect(step.variants[0].body).toContain(REPORT_LABEL_SHORT);
		}
		const source = readFileSync(join(process.cwd(), 'src/lib/tour/orientation.ts'), 'utf8');
		expect(source).not.toContain(REPORT_LABEL);
	});

	it('the {mod} token becomes the keyboard the reader has', () => {
		const steps = resolveHomeTour(homeTourDefs('student', false), () => true, '⌘');
		const classroom = steps.find((s) => s.id === 'app-classroom')!;
		expect(classroom.body).toContain('⌘ K');
		expect(steps.every((s) => !s.body.includes('{mod}'))).toBe(true);
	});
});

describe('the staff tour is never a student\'s', () => {
	it('homeTourFor is classroomTourFor with no class on screen, for every viewer', () => {
		for (const isStaff of [false, true])
			for (const isAdmin of [false, true])
				expect(homeTourFor({ isStaff, isAdmin })).toBe(
					classroomTourFor({ inClass: false, canManage: false, isStaff, isAdmin })
				);
		expect(homeTourFor({ isStaff: false, isAdmin: false })).toBe('student');
		expect(homeTourFor({ isStaff: true, isAdmin: false })).toBe('teacher');
		expect(homeTourFor({ isStaff: false, isAdmin: true })).toBe('teacher');
	});

	it('a student is never shown a staff-only card, and an admin is (both directions)', () => {
		const adminOnly = PORTAL_APPS.filter((a) => a.adminOnly).map((a) => `app-${a.id}`);
		// Positive control: there ARE admin-only cards for the student tour to leave out.
		expect(adminOnly).toEqual(expect.arrayContaining(['app-coin-desk', 'app-dashboard']));
		const student = homeTourDefs('student', false).map((d) => d.id);
		for (const id of adminOnly) expect(student).not.toContain(id);
		const admin = homeTourDefs('teacher', true).map((d) => d.id);
		for (const id of adminOnly) expect(admin).toContain(id);
		// A teacher who is not an admin sees the student-facing cards only, as the launcher shows them.
		const teacher = homeTourDefs('teacher', false).map((d) => d.id);
		for (const id of adminOnly) expect(teacher).not.toContain(id);
	});

	it('a student reads the student words wherever the two differ, and a teacher the teacher words', () => {
		let split = 0;
		for (const isAdmin of [false, true]) {
			const s = homeTourDefs('student', isAdmin);
			const t = homeTourDefs('teacher', isAdmin);
			for (const d of s) {
				const other = t.find((x) => x.id === d.id);
				if (!other || other.variants[0].body === d.variants[0].body) continue;
				split++;
				const words = APP_TOUR_WORDS[d.id.replace(/^app-/, '')];
				if (words && typeof words !== 'string') {
					expect(d.variants[0].body).toBe(words.student);
					expect(other.variants[0].body).toBe(words.teacher);
				}
			}
		}
		// welcome, profile, classes, and the classroom, notebook, coins and foundry cards, per admin state.
		expect(split).toBeGreaterThanOrEqual(14);
	});
});

describe('one step per card that renders, and no other', () => {
	it('the card steps are exactly visibleApps, in its order, for both admin states', () => {
		for (const tour of ['student', 'teacher'] as const)
			for (const isAdmin of [false, true]) {
				const cards = homeTourDefs(tour, isAdmin)
					.filter((d) => d.id.startsWith('app-'))
					.map((d) => d.id.slice(4));
				expect(cards).toEqual(visibleApps(isAdmin).map((a) => a.id));
			}
	});

	it("each card step points at that card's own hook and carries the card's own title", () => {
		for (const d of homeTourDefs('teacher', true).filter((x) => x.id.startsWith('app-'))) {
			const app = PORTAL_APPS.find((a) => `app-${a.id}` === d.id)!;
			expect(d.variants[0].target).toBe(`[data-tour="${app.id}"]`);
			expect(d.variants[0].title).toBe(app.title);
		}
	});

	it('every app in the registry has tour words, and no words name an app that is not there', () => {
		const ids = new Set(PORTAL_APPS.map((a) => a.id));
		for (const key of Object.keys(APP_TOUR_WORDS)) expect(ids, key).toContain(key);
		for (const id of ids) expect(Object.keys(APP_TOUR_WORDS), id).toContain(id);
	});
});

describe('the order a reader walks', () => {
	it('opens on the welcome and closes on Report, then the tour control', () => {
		for (const tour of ['student', 'teacher'] as const) {
			const ids = homeTourDefs(tour, true).map((d) => d.id);
			expect(ids[0]).toBe('welcome');
			expect(ids.slice(-2)).toEqual(['report', 'tour-again']);
		}
	});

	it('the page body is put in page order and everything else stays where it stands', () => {
		const steps = [
			{ id: 'a', target: 'A' },
			{ id: 'b', target: 'B' },
			{ id: 'c', target: 'C' },
			{ id: 'd', target: 'D' },
			{ id: 'e', target: 'E' }
		];
		const onPage = ['D', 'A', 'C', 'B', 'E'];
		const rank = (t: string) => onPage.indexOf(t);
		const out = orderFlow(steps, new Set(['b', 'c', 'd']), (x, y) => rank(x) - rank(y));
		expect(out.map((s) => s.id)).toEqual(['a', 'd', 'c', 'b', 'e']);
		// No compare, no reordering at all.
		expect(resolveHomeTour(homeTourDefs('student', false), () => true).map((s) => s.id)).toEqual(
			homeTourDefs('student', false).map((d) => d.id)
		);
	});

	it('a student whose apps sit above their classes walks the apps first', () => {
		const defs = homeTourDefs('student', false);
		// The page as a student gets it: to-do, the app strip, the cards, then the classes.
		const onPage = [
			'[data-tour="hero"]',
			'[data-testid="todo-strip"]',
			'[data-tour="app-tools"]',
			...visibleApps(false).map((a) => `[data-tour="${a.id}"]`),
			'[data-tour="classes"]'
		];
		const rank = (t: string) => (onPage.includes(t) ? onPage.indexOf(t) : -1);
		const ids = resolveHomeTour(defs, () => true, 'Ctrl', (x, y) => rank(x) - rank(y)).map((s) => s.id);
		expect(ids.indexOf('apps')).toBeLessThan(ids.indexOf('classes'));
		expect(ids.indexOf('app-tournaments')).toBeLessThan(ids.indexOf('classes'));
		expect(ids.indexOf('todo')).toBeLessThan(ids.indexOf('apps'));
		expect(ids.slice(0, 1)).toEqual(['welcome']);
		expect(ids.slice(-2)).toEqual(['report', 'tour-again']);
	});

	it('a step whose control is not on the page is left out (the quick note on a build without one)', () => {
		const ids = resolveHomeTour(homeTourDefs('student', false), (s) => s !== '[data-testid="qn-trigger"]').map(
			(s) => s.id
		);
		expect(ids).not.toContain('note');
		expect(ids).toContain('profile');
	});

	it('the sign-in step is the one that lets a click through', () => {
		expect(SIGNIN_STEP.interactive).toBe(true);
		for (const tour of ['student', 'teacher'] as const)
			expect(homeTourDefs(tour, true).some((d) => d.variants.some((v) => v.target === SIGNIN_STEP.target))).toBe(
				false
			);
	});
});

describe('offered again once, to somebody who finished the old tour', () => {
	it('reads the stamp 0045 already stores: none runs, older offers, this version or unreadable does nothing', () => {
		expect(homeTourPlan(null)).toBe('run');
		expect(homeTourPlan(undefined)).toBeNull();
		expect(homeTourPlan('not a date')).toBeNull();
		expect(homeTourPlan('2026-07-01T00:00:00.000Z')).toBe('offer');
		// The version is the START of its day in the school's calendar (Pacific, UTC-7 that day).
		expect(HOME_TOUR_VERSION).toBe('2026-09-25');
		expect(homeTourPlan('2026-09-25T06:59:59.999Z')).toBe('offer');
		expect(homeTourPlan('2026-09-25T07:00:00.000Z')).toBeNull();
		expect(homeTourPlan('2026-10-01T15:00:00.000Z')).toBeNull();
	});

	it('the stamp the offer writes ends the offer, even from a computer whose clock is behind', () => {
		// The positive control: a stamp from before the version is exactly what offers.
		expect(homeTourPlan(new Date('2020-01-01T00:00:00Z').toISOString())).toBe('offer');
		for (const clock of ['2020-01-01T00:00:00Z', '2026-09-24T23:00:00-07:00', '2026-09-25T20:00:00Z', '2027-03-01T10:00:00Z']) {
			const stamp = homeTourSeenStamp(new Date(clock));
			expect(homeTourPlan(stamp), clock).toBeNull();
		}
		// A clock that is right is stamped as it reads, never moved.
		expect(homeTourSeenStamp(new Date('2026-09-26T16:00:00.000Z'))).toBe('2026-09-26T16:00:00.000Z');
	});

	it('the offer is mounted in the page flow under the header, and the tour itself outside the page', () => {
		const home = readFileSync(join(process.cwd(), 'src/routes/+page.svelte'), 'utf8');
		const header = home.indexOf('</header>');
		const offer = home.indexOf('<HomeTourOffer');
		const hero = home.indexOf('data-tour="hero"');
		const tour = home.indexOf('<HomeTour bind:this');
		expect(header).toBeGreaterThan(0);
		expect(offer).toBeGreaterThan(header);
		expect(offer).toBeLessThan(hero);
		expect(tour).toBeGreaterThan(hero);
	});
});
