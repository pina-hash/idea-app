import { describe, expect, it } from 'vitest';
import {
	buildStudentPage,
	parseStudentOverview,
	studentAssignmentRows,
	studentAssignmentTotals,
	studentHallPassSummary,
	studentNotebook,
	studentTeams
} from '../src/lib/classroom/student-overview';
import { CLASSMATES, EMAIL, ITEMS, NOW, fixtureInputs, fixturePage } from '../src/routes/dev/classroom-student/fixture';

/**
 * ONE STUDENT'S PAGE, AS PLAIN DATA (the 2026-10-07 round). What would fail
 * SILENTLY is what is here:
 *
 *   - THE WORDS ARE THE STUDENT'S OWN. Each status is `studentWorkChip`'s, so a
 *     past-due assignment with nothing turned in says "Missing" here exactly as
 *     on the student's to-do. The expected strings are LITERALS, never derived
 *     from the function under test.
 *   - NOTHING NAMES A CLASSMATE. The grid and the team board carry the whole
 *     class; the page must carry none of it, swept over every classmate's name
 *     and address, with the student's own team names present as the positive
 *     control.
 *   - "NOT OPENED" IS EARNED. The presence verdict is printed only when presence
 *     answered, there is no row and nothing of theirs (work, or an open record)
 *     is here.
 */

const page = fixturePage('full');
const row = (id: string) => page.assignments.find((r) => r.itemId === id)!;

describe('the assignments say what the student reads', () => {
	it('each status is the chip a student sees, as literal words', () => {
		expect(row('a-bridge').chip.label).toBe('Returned · 18/20');
		expect(row('a-gear').chip.label).toBe('Complete, late');
		expect(row('a-motor').chip.label).toBe('Missing, draft saved');
		expect(row('a-safety').chip.label).toBe('Missing');
		expect(row('a-cad').chip.label).toBe('Not started');
		expect(row('a-essay').chip.label).toBe('Submitted');
	});

	it('a scheduled item nobody has touched is left out, and an item that holds their work is kept', () => {
		const ids = page.assignments.map((r) => r.itemId);
		expect(ids).not.toContain('a-next');
		expect(ids).toContain('a-old');
		expect(row('a-old').posted).toBe(false);
		expect(row('a-bridge').posted).toBe(true);
		// Materials and announcements are never assignment rows.
		expect(ids).not.toContain('m-handout');
		expect(ids).not.toContain('p-trip');
		expect(ids).toHaveLength(7);
	});

	it('due first, undated last, then by title', () => {
		expect(page.assignments.map((r) => r.itemId)).toEqual([
			'a-old',
			'a-safety',
			'a-bridge',
			'a-gear',
			'a-motor',
			'a-essay',
			'a-cad'
		]);
	});

	it('a score shows only once returned, and late is a fact about the turn-in instant', () => {
		expect(row('a-bridge').score).toBe(18);
		expect(row('a-essay').score).toBeNull();
		expect(row('a-essay').late).toBe(true);
		expect(row('a-essay').awaitingGrade).toBe(true);
		expect(row('a-bridge').late).toBe(false);
		expect(row('a-gear').late).toBe(true);
		expect(row('a-gear').awaitingGrade).toBe(true);
	});

	it('totals count, and points are over returned work only, with no percent anywhere', () => {
		expect(page.totals).toEqual({
			assigned: 7,
			done: 4,
			missing: 2,
			todo: 1,
			awaitingGrade: 2,
			returned: 2,
			pointsEarned: 27,
			pointsPossible: 40
		});
		expect(JSON.stringify(page)).not.toMatch(/percent|%"/i);
	});
});

describe('presence: a verdict is earned, never defaulted', () => {
	it('a row prints, work outranks, an open record outranks, and only silence earns Not opened', () => {
		expect(row('a-bridge').presence).toBe('row');
		// Not started, never typed, but they opened it: the open record outranks the verdict.
		expect(row('a-cad').presence).toBe('outranked');
		// Draft-only old item: work arrived, no heartbeat.
		expect(row('a-old').presence).toBe('outranked');
		// Nothing at all, and presence answered: the one verdict.
		expect(row('a-safety').presence).toBe('never-opened');
	});

	it('the same row reads Not known when the presence read could not answer', () => {
		const rows = studentAssignmentRows({
			items: ITEMS,
			submissions: [],
			completions: null,
			presence: [],
			presenceLoaded: false,
			views: [],
			email: EMAIL,
			now: NOW
		});
		expect(rows.find((r) => r.itemId === 'a-safety')!.presence).toBe('unknown');
	});

	it('working time sums the rows that exist and is null when there are none', () => {
		expect(page.workingSeconds).toBe(4800 + 2700 + 900 + 1500);
		expect(fixturePage('no-account').workingSeconds).toBeNull();
	});
});

describe('nothing on the page names a classmate', () => {
	it('every classmate name and address is absent, beside the student and their team names present', () => {
		const text = JSON.stringify(page);
		for (const c of CLASSMATES) {
			expect(text, c.name).not.toContain(c.name);
			expect(text, c.email).not.toContain(c.email);
		}
		// POSITIVE CONTROLS: the reads did carry them, and the page carries the student.
		const inputs = JSON.stringify({ grid: fixtureInputs('full').grid, board: fixtureInputs('full').board });
		for (const c of CLASSMATES) expect(inputs).toContain(c.email);
		expect(text).toContain('Ana Reyes');
		expect(page.teams.map((t) => t.teamName)).toEqual(['The Gearheads', 'Team 1']);
		expect(page.teams.map((t) => t.size)).toEqual([3, 2]);
	});

	it('studentTeams emits no member field at all', () => {
		for (const t of studentTeams(fixtureInputs('full').board, EMAIL)) {
			expect(Object.keys(t).sort()).toEqual(['createdAt', 'edited', 'label', 'posted', 'setId', 'size', 'teamName']);
		}
		expect(studentTeams({ ok: false, reason: 'unavailable' }, EMAIL)).toEqual([]);
	});

	it("the notebook is this student's row alone, with no presence pre-fill", () => {
		const nb = studentNotebook(fixtureInputs('full').grid.value, EMAIL, null)!;
		expect(nb).toMatchObject({ covered: 3, total: 4, flagged: 1, scheduled: 1, excused: 0, freeEntries: 2 });
		expect(nb.checkIns.map((c) => `${c.glyph} ${c.word}`)).toEqual([
			'✓ On time',
			'⤴ Late',
			'! Flagged',
			'– Missing',
			'» Scheduled'
		]);
		expect('presenceScore' in nb).toBe(false);
		expect(studentNotebook(fixtureInputs('full').grid.value, 'nobody@boscotech.net', null)).toBeNull();
	});
});

describe('hall passes are counts and minutes, with no threshold', () => {
	it('at a pinned set of passes: an open one counted as open, minutes floored, overrides counted', () => {
		const s = studentHallPassSummary(6, page.hallPasses!.entries);
		// 6.5 -> 6, 18.17 -> 18, 4, 11, 3; the open one adds nothing.
		expect(s).toEqual({ total: 6, shown: 6, minutesTotal: 42, longestMinutes: 18, openNow: true, overrides: 1 });
	});

	it('a truncated history says how much it holds', () => {
		expect(studentHallPassSummary(700, page.hallPasses!.entries.slice(0, 2)).shown).toBe(2);
		expect(studentHallPassSummary(700, page.hallPasses!.entries.slice(0, 2)).total).toBe(700);
	});
});

describe('the new read is parsed defensively', () => {
	it('drops a malformed pass and a coin row with no amount, keeps the rest', () => {
		const parsed = parseStudentOverview({
			section_id: 's-1',
			student_email: EMAIL,
			hall_passes: {
				total: 2,
				entries: [
					{ pass_id: 'p1', student_email: EMAIL, opened_at: '2026-10-01T17:00:00Z', closed_at: null },
					{ pass_id: 'p2', student_email: EMAIL, opened_at: 'not a time' }
				]
			},
			coins: {
				transactions: [
					{ id: 'c1', category_id: 'x', created_at: '2026-10-01T17:00:00Z', amount: 3 },
					{ id: 'c2', category_id: 'x', created_at: '2026-10-01T17:00:00Z' }
				]
			}
		})!;
		expect(parsed.hallPasses.entries.map((e) => e.pass_id)).toEqual(['p1']);
		expect(parsed.coins.transactions.map((c) => c.id)).toEqual(['c1']);
		expect(parsed.presenceLimits.retentionDays).toBe(90);
	});

	it("the function's own NULL, and anything not an object, is null", () => {
		expect(parseStudentOverview(null)).toBeNull();
		expect(parseStudentOverview([])).toBeNull();
		expect(parseStudentOverview({ section_id: 's-1' })).toBeNull();
	});

	it('the coin rows lose their kind but keep it in the lookup, and never carry a note', () => {
		expect(page.coins!.kinds).toMatchObject({ classmate_trust_violation: 'fine', highest_grade_weekly: 'award' });
		for (const r of page.coins!.rows) expect('category_kind' in r || 'note' in r || 'actor_email' in r).toBe(false);
	});

	it('an unavailable read empties exactly its own sections and says so through the sources', () => {
		const p = fixturePage('unavailable');
		expect(p.sources.overview).toBe('unavailable');
		expect(p.hallPasses).toBeNull();
		expect(p.coins).toBeNull();
		expect(p.songs).toBeNull();
		// The rest of the page is unaffected.
		expect(p.assignments).toHaveLength(7);
		expect(p.notebook).not.toBeNull();
	});

	it('buildStudentPage is pure: the same inputs give the same page', () => {
		expect(JSON.stringify(buildStudentPage(fixtureInputs('full')))).toBe(JSON.stringify(page));
		expect(studentAssignmentTotals([])).toMatchObject({ assigned: 0, todo: 0 });
	});
});
