import { describe, expect, it } from 'vitest';
import {
	buildStudentPage,
	parseStudentOverview,
	studentAssignmentRows,
	studentAssignmentTotals,
	studentHallPassSummary,
	studentNotebook,
	studentTeams,
	isStudentAssignmentSortKey,
	sortStudentAssignments,
	STUDENT_ASSIGNMENT_SORTS,
	studentWorkHref,
	slideIndex,
	stripScrollLeft
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

	it('totals count, and points are over returned work only; a percent exists only as the grade and its bars', () => {
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
		// Ledger 0392: the grade is points over RETURNED work, and nowhere else is
		// a percent derived. The control is the same walk finding exactly the two.
		expect(page.grade).toEqual({ percent: 67.5, earned: 27, possible: 40, counted: 2 });
		const { grade: _g, scoreBars: _b, ...rest } = page;
		expect(JSON.stringify(rest)).not.toMatch(/percent|%"/i);
		expect(page.scoreBars.map((b) => [b.itemId, b.percent])).toEqual([
			['a-old', 45],
			['a-bridge', 90]
		]);
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

/**
 * THE ASSIGNMENTS TABLE'S SORT (the 2026-10-15 round, report 5464ceb2). One
 * comparator behind the headers and the Sort by control; a missing value sorts
 * last in both directions; the default order is the page's own; nothing is
 * reordered in place.
 */
describe('the assignments table sorts by one comparator', () => {
	const rows = fixturePage('full').assignments;

	it('the default is the page order, reversed by direction, and never mutates the input', () => {
		const before = rows.map((r) => r.itemId);
		expect(sortStudentAssignments(rows, 'default').map((r) => r.itemId)).toEqual(before);
		expect(sortStudentAssignments(rows, 'default', 'desc').map((r) => r.itemId)).toEqual([...before].reverse());
		expect(rows.map((r) => r.itemId)).toEqual(before);
	});

	it('every key orders ascending and descending with the missing values last both ways', () => {
		for (const { id } of STUDENT_ASSIGNMENT_SORTS) {
			if (id === 'default') continue;
			const asc = sortStudentAssignments(rows, id, 'asc');
			const desc = sortStudentAssignments(rows, id, 'desc');
			expect(asc, id).toHaveLength(rows.length);
			expect(new Set(asc.map((r) => r.itemId)).size, id).toBe(rows.length);
			const value = (r: (typeof rows)[number]): number | string | null => {
				switch (id) {
					case 'title':
						return r.title.toLowerCase();
					case 'due':
						return r.dueAt ? Date.parse(r.dueAt) : null;
					case 'turnedIn':
						return r.turnedInAt ? Date.parse(r.turnedInAt) : null;
					case 'score':
						return r.score;
					case 'working':
						return r.activeSeconds;
					case 'lastTyped':
						return r.lastWorkedAt ? Date.parse(r.lastWorkedAt) : null;
					case 'lastOpened':
						return r.lastOpenedAt ? Date.parse(r.lastOpenedAt) : null;
					default:
						return 0;
				}
			};
			for (const list of [asc, desc]) {
				const present = list.filter((r) => value(r) !== null);
				const missing = list.filter((r) => value(r) === null);
				// Missing last: every present row comes before every missing one.
				expect(list.slice(0, present.length).every((r) => value(r) !== null), id).toBe(true);
				expect(list.slice(present.length).every((r) => value(r) === null), id).toBe(true);
				if (id !== 'status') {
					const sign = list === asc ? 1 : -1;
					for (let i = 1; i < present.length; i++) {
						const a = value(present[i - 1])!;
						const b = value(present[i])!;
						const cmp = typeof a === 'string' ? a.localeCompare(b as string) : (a as number) - (b as number);
						expect(cmp * sign, `${id} at ${i}`).toBeLessThanOrEqual(0);
					}
				}
				expect(missing.length + present.length).toBe(rows.length);
			}
		}
	});

	it('status reads missing first, then open work, then finished, then returned', () => {
		const rank = (r: (typeof rows)[number]) => (r.chip.missing ? 0 : !r.chip.done ? 1 : r.returned ? 3 : 2);
		const asc = sortStudentAssignments(rows, 'status').map(rank);
		expect(asc).toEqual([...asc].sort((a, b) => a - b));
		// POSITIVE CONTROL: the fixture holds more than one rank, so the order is earned.
		expect(new Set(asc).size).toBeGreaterThan(1);
	});

	it('only the offered keys are keys, so a stored or typed value cannot strand the control', () => {
		for (const { id } of STUDENT_ASSIGNMENT_SORTS) expect(isStudentAssignmentSortKey(id)).toBe(true);
		expect(isStudentAssignmentSortKey('points')).toBe(false);
		expect(isStudentAssignmentSortKey(null)).toBe(false);
	});

	it('the full-screen work address sits under the student page and encodes once', () => {
		expect(studentWorkHref('s-1', 'ana.reyes@boscotech.net', 'a-bridge')).toBe(
			'/classroom/s-1/people/ana.reyes%40boscotech.net/work/a-bridge'
		);
	});
});

// ---------------------------------------------------------------------------
// Ledger 0392: the conference dashboard's grade, its default order, and the
// gallery of their work.
// ---------------------------------------------------------------------------
import {
	notebookPhotosShown,
	studentAssignmentSortStartDir,
	studentGallery,
	studentGrade,
	STUDENT_ASSIGNMENT_DEFAULT_SORT
} from '../src/lib/classroom/student-overview';

describe('the grade', () => {
	it('is null before anything is returned, and counts only returned, scored work with points', () => {
		expect(studentGrade([])).toEqual({ percent: null, earned: 0, possible: 0, counted: 0 });
		const page = fixturePage('full');
		// Control: a submitted, ungraded row and a missing one are on the page and not counted.
		expect(page.assignments.some((r) => r.awaitingGrade && r.score === null)).toBe(true);
		expect(page.grade.counted).toBe(page.assignments.filter((r) => r.score !== null).length);
	});
});

describe('the default order is newest due first', () => {
	it('opens on due date, descending, with an undated row still last', () => {
		expect(STUDENT_ASSIGNMENT_DEFAULT_SORT).toEqual({ key: 'due', dir: 'desc' });
		const page = fixturePage('full');
		const rows = sortStudentAssignments(page.assignments, 'due', 'desc');
		const dates = rows.map((r) => (r.dueAt ? Date.parse(r.dueAt) : null));
		const dated = dates.filter((d): d is number => d !== null);
		expect(dated).toEqual([...dated].sort((a, b) => b - a));
		expect(rows[0].itemId).toBe('a-cad');
		expect(studentAssignmentSortStartDir('turnedIn')).toBe('desc');
		expect(studentAssignmentSortStartDir('title')).toBe('asc');
	});
});

describe('the gallery of their work', () => {
	it('a straightened page replaces its original, once', () => {
		const shown = notebookPhotosShown([
			{ id: 'a', entry_id: 'e', variant: 'original', sequence_order: 1 },
			{ id: 'a2', entry_id: 'e', variant: 'enhanced', sequence_order: 2 },
			{ id: 'b', entry_id: 'e', variant: 'original', sequence_order: 3 }
		]);
		expect(shown.map((p) => p.id)).toEqual(['a2', 'b']);
	});

	it('pictures only, from this student\'s own rows, newest first; a CAD file and a file on no known row are left out', () => {
		const gallery = studentGallery({
			items: ITEMS,
			submissions: [{ id: 's1', item_id: 'a-bridge' }],
			files: [
				{ id: 'f1', submission_id: 's1', filename: 'a.jpg', mime_type: 'application/octet-stream', storage_key: 's1/a.jpg', created_at: '2026-09-01T00:00:00Z' },
				{ id: 'f2', submission_id: 's1', filename: 'b.SLDPRT', mime_type: 'application/octet-stream', storage_key: 's1/b.sldprt', created_at: '2026-09-02T00:00:00Z' },
				{ id: 'f3', submission_id: 'someone-else', filename: 'c.jpg', mime_type: 'image/jpeg', storage_key: null, created_at: '2026-09-03T00:00:00Z' }
			],
			isImage: (f) => /\.(jpe?g|png)$/i.test(f.storage_key ?? f.filename),
			fileSrc: (id) => `/f/${id}`,
			photos: [
				{ id: 'p1', entry_id: 'e1', variant: 'original', sequence_order: 1, created_at: '2026-09-05T00:00:00Z' },
				// A photo on an entry that is not one of theirs: never shown.
				{ id: 'p9', entry_id: 'e-other', variant: 'original', sequence_order: 1, created_at: '2026-09-06T00:00:00Z' }
			],
			entries: new Map([['e1', { at: '2026-09-05T00:00:00Z', label: 'Day 3' }]]),
			photoSrc: (id) => `/p/${id}`,
			photoThumb: (id) => `/p/${id}?size=thumb`,
			day: () => 'x'
		});
		expect(gallery.map((g) => g.key)).toEqual(['photo:p1', 'file:f1']);
		expect(gallery[0]).toMatchObject({ source: 'notebook', caption: 'Notebook: Day 3', thumb: '/p/p1?size=thumb' });
		expect(gallery[1]).toMatchObject({ source: 'assignment', caption: 'Bridge truss lab', itemId: 'a-bridge' });
	});

	it('the fixture page carries seven pictures and no classmate', () => {
		const page = fixturePage('full');
		expect(page.gallery).toHaveLength(7);
		expect(page.sources.gallery).toBe(true);
		const text = JSON.stringify(page.gallery);
		for (const c of CLASSMATES) expect(text).not.toContain(c.email);
	});
});

import { studentUpcoming } from '../src/lib/classroom/student-overview';

describe('coming up', () => {
	it('is the work still to do with a due date ahead, soonest first, and nothing else', () => {
		const page = fixturePage('full');
		// The fixture's one undone, live assignment due after NOW is the CAD sketch.
		expect(page.upcoming.map((r) => r.itemId)).toEqual(['a-cad']);
		const base = page.assignments.find((r) => r.itemId === 'a-cad')!;
		const mk = (id: string, dueAt: string | null, over: Partial<typeof base> = {}) => ({ ...base, itemId: id, title: id, dueAt, ...over });
		const rows = [
			mk('later', '2026-10-30T06:59:00Z'),
			mk('sooner', '2026-10-09T06:59:00Z'),
			mk('done', '2026-10-08T06:59:00Z', { chip: { ...base.chip, done: true } }),
			mk('past', '2026-10-01T06:59:00Z'),
			mk('undated', null),
			mk('draft', '2026-10-10T06:59:00Z', { posted: false }),
			mk('third', '2026-10-20T06:59:00Z'),
			mk('fourth', '2026-11-20T06:59:00Z')
		];
		expect(studentUpcoming(rows, NOW).map((r) => r.itemId)).toEqual(['sooner', 'third', 'later']);
		expect(studentUpcoming(rows, NOW, 10).map((r) => r.itemId)).toEqual(['sooner', 'third', 'later', 'fourth']);
	});
});

import { GRADE_BANDS, gradeBand, gradeBandWord } from '../src/lib/classroom/student-overview';

describe('the grade band', () => {
	it('cuts at 90, 80 and 70, with a word for every band and none without a grade', () => {
		const at = [100, 90, 89.9, 80, 79.9, 70, 69.9, 0].map((p) => gradeBand(p));
		expect(at).toEqual(['excellent', 'excellent', 'good', 'good', 'fair', 'fair', 'low', 'low']);
		expect(gradeBand(null)).toBeNull();
		expect(gradeBand(Number.NaN)).toBeNull();
		expect(gradeBandWord(67.5)).toBe('Needs improvement');
		expect(gradeBandWord(null)).toBeNull();
		expect(new Set(GRADE_BANDS.map((b) => b.word)).size).toBe(GRADE_BANDS.length);
		// The fixture's grade (27 of 40) is the low band, which the harness shows.
		expect(gradeBand(fixturePage('full').grade.percent)).toBe('low');
	});
});

describe('the slideshow wraps and its strip follows (report 169b931d)', () => {
	it('Next on the last is the first and Previous on the first is the last', () => {
		expect(slideIndex(11, 11)).toBe(0);
		expect(slideIndex(-1, 11)).toBe(10);
		expect(slideIndex(5, 11)).toBe(5);
		expect(slideIndex(23, 11)).toBe(1);
		expect(slideIndex(3, 0)).toBe(0);
		expect(slideIndex(Number.NaN, 4)).toBe(0);
	});

	// The strip Mr. Pina had: 11 thumbnails of 70.4px with a 6.4px gap and 1.6px
	// of padding, in a 614px strip (measured at 1278px). Content 846, so 232 of scroll.
	const strip = { viewWidth: 614, contentWidth: 846 };
	const start = (i: number) => 1.6 + i * (70.4 + 6.4);

	it('the first picture puts the strip at its start, the last at its end, a middle one in the middle', () => {
		expect(stripScrollLeft({ ...strip, thumbStart: start(0), thumbWidth: 70.4 })).toBe(0);
		expect(stripScrollLeft({ ...strip, thumbStart: start(10), thumbWidth: 70.4 })).toBe(232);
		// Picture 6's centre is 1.6 + 5 * 76.8 + 35.2 = 420.8; minus half of 614 is 113.8.
		expect(stripScrollLeft({ ...strip, thumbStart: start(5), thumbWidth: 70.4 })).toBe(114);
	});

	it('the defect, by number: measured from the page instead of the strip, the first picture asked for the far right', () => {
		// offsetLeft against the page's offset parent read 609 for the first thumbnail at 1278px.
		expect(stripScrollLeft({ ...strip, thumbStart: 609, thumbWidth: 70.4 })).toBe(232);
		// Measured from the strip it is 1.6, which is the start.
		expect(stripScrollLeft({ ...strip, thumbStart: 1.6, thumbWidth: 70.4 })).toBe(0);
	});

	it('a strip with nothing to scroll never scrolls', () => {
		expect(stripScrollLeft({ viewWidth: 700, contentWidth: 539, thumbStart: 460, thumbWidth: 70 })).toBe(0);
	});
});
