import { describe, expect, it } from 'vitest';
import {
	STUDENT_PAGE_SECTIONS,
	STUDENT_PRINTABLE_SECTIONS,
	readStudentPageHidden,
	setStudentSectionShown,
	STUDENT_DUO_ROW_PX,
	STUDENT_DUO_STACK_PX,
	studentColumns,
	studentDuoStacks,
	studentEverySectionHidden,
	studentSectionsMenuFit,
	studentGalleryFor,
	studentHiddenCountWords,
	studentHiddenSummary,
	studentPageLayout,
	studentTileColumns,
	type StudentPrintableSection
} from '../src/lib/classroom/student-sections';
import {
	CLASSROOM_PREFERENCE_HOMES,
	CLASSROOM_PREFERENCE_SCHEMA,
	CLASSROOM_SETTINGS,
	defaultClassroomPreferences,
	readClassroomPreferences,
	settingsForRole
} from '../src/lib/preferences/classroom';
import { compactPreferences } from '../src/lib/preferences/store';

/**
 * WHICH SECTIONS OF ONE STUDENT'S PAGE A TEACHER SHOWS (ledger 0396, report
 * bd38fa25). What would fail SILENTLY is what is here:
 *
 *   - THE IDS ARE STORED, SO THEY ARE APPEND-ONLY: the shipped list is pinned
 *     as a prefix, and a stored id this build does not know is dropped rather
 *     than coerced into another section.
 *   - A HIDDEN SECTION TAKES ITS TILE WITH IT, and the grade keeps printing
 *     when the sections it used to follow are hidden rather than unticked.
 *   - THE CHOICE FOLLOWS THE ACCOUNT: an account group, stored sparse, and
 *     read back to the same value.
 */

const ALL_PRINT = Object.fromEntries(STUDENT_PRINTABLE_SECTIONS.map((id) => [id, true])) as Record<StudentPrintableSection, boolean>;
const printingWith = (off: StudentPrintableSection[]) =>
	({ ...ALL_PRINT, ...Object.fromEntries(off.map((id) => [id, false])) }) as Record<StudentPrintableSection, boolean>;

describe('the stored vocabulary', () => {
	it('the shipped ids are the head of the list, in page order (append-only)', () => {
		expect(STUDENT_PAGE_SECTIONS.map((s) => s.id).slice(0, 13)).toEqual([
			'grade',
			'upcoming',
			'gallery',
			'glance',
			'attention',
			'scores',
			'assignments',
			'notebook',
			'activity',
			'hall-passes',
			'teams',
			'coins',
			'models'
		]);
		expect(new Set(STUDENT_PAGE_SECTIONS.map((s) => s.id)).size).toBe(STUDENT_PAGE_SECTIONS.length);
		expect(new Set(STUDENT_PAGE_SECTIONS.map((s) => s.label)).size).toBe(STUDENT_PAGE_SECTIONS.length);
	});

	it('a stored list is known ids only, once each, in page order; anything else is nothing hidden', () => {
		expect(readStudentPageHidden(['coins', 'notebook', 'no-such', 'coins', 7, null, 'NOTEBOOK'])).toEqual(['notebook', 'coins']);
		expect(readStudentPageHidden('notebook')).toEqual([]);
		expect(readStudentPageHidden({ notebook: true })).toEqual([]);
		expect(readStudentPageHidden(undefined)).toEqual([]);
	});

	it('showing and hiding one section keeps the rest, in page order', () => {
		expect(setStudentSectionShown([], 'coins', false)).toEqual(['coins']);
		expect(setStudentSectionShown(['coins'], 'grade', false)).toEqual(['grade', 'coins']);
		expect(setStudentSectionShown(['grade', 'coins'], 'grade', true)).toEqual(['coins']);
		expect(setStudentSectionShown(['coins'], 'notebook', true)).toEqual(['coins']);
	});

	it('the words say how many and which, never colour alone', () => {
		expect(studentHiddenCountWords([])).toBe('');
		expect(studentHiddenCountWords(['notebook', 'coins'])).toBe('2 hidden');
		expect(studentHiddenSummary([])).toBe('Every section shown');
		expect(studentHiddenSummary(['coins', 'notebook'])).toBe('Hidden: Notebook, Coins and music');
		expect(studentHiddenSummary(STUDENT_PAGE_SECTIONS.map((s) => s.id))).toBe('Every section hidden');
	});

	it('a group of cards takes as many columns as it has cards, up to two, never fewer than one', () => {
		expect([0, 1, 2, 3, 6].map((n) => studentColumns(n))).toEqual([1, 1, 2, 2, 2]);
	});

	it('the page knows when every section is hidden, and only then', () => {
		expect(studentEverySectionHidden(STUDENT_PAGE_SECTIONS.map((s) => s.id))).toBe(true);
		expect(studentEverySectionHidden(STUDENT_PAGE_SECTIONS.map((s) => s.id).slice(1))).toBe(false);
		expect(studentEverySectionHidden([])).toBe(false);
	});
});

describe('what belongs to a section goes with it', () => {
	const gallery = [
		{ key: 'file:1', source: 'assignment' },
		{ key: 'photo:1', source: 'notebook' },
		{ key: 'file:2', source: 'assignment' },
		{ key: 'photo:2', source: 'notebook' }
	];
	it('a hidden notebook takes its photos out of Their work; a shown one keeps them, in order', () => {
		expect(studentGalleryFor(gallery, false).map((i) => i.key)).toEqual(['file:1', 'file:2']);
		// Positive control: nothing is dropped while the notebook shows.
		expect(studentGalleryFor(gallery, true).map((i) => i.key)).toEqual(['file:1', 'photo:1', 'file:2', 'photo:2']);
		expect(studentGalleryFor(gallery, true)).not.toBe(gallery);
	});
});

describe('the At a glance row shares its rows evenly', () => {
	// The row's own numbers: a 9rem (144px) tile minimum and an 8px gap.
	const cols = (tiles: number, width: number) => studentTileColumns(tiles, width, 144, 8);
	/** How a column count lays the tiles out, row by row. */
	const rowsOf = (tiles: number, c: number) =>
		Array.from({ length: Math.ceil(tiles / c) }, (_, r) => Math.min(c, tiles - r * c));

	it('seven tiles at a width that holds six are 4 + 3, never 6 + 1', () => {
		// 928px holds six 144px tiles (6 x 144 + 5 x 8 = 904) and not seven (1056).
		expect(cols(7, 928)).toBe(4);
		expect(rowsOf(7, cols(7, 928) as number)).toEqual([4, 3]);
	});

	it('it never adds a row: the count of rows is the one the width forces', () => {
		let checked = 0;
		for (let tiles = 1; tiles <= 7; tiles++) {
			for (let width = 150; width <= 1400; width += 7) {
				const fit = Math.max(1, Math.floor((width + 8) / 152));
				const forced = Math.ceil(tiles / Math.min(tiles, fit));
				const c = cols(tiles, width) as number;
				expect(Math.ceil(tiles / c)).toBe(forced);
				expect(c).toBeLessThanOrEqual(Math.min(tiles, fit));
				// The fewest columns that keep that row count, so the last row is as
				// full as an even grid allows: one column fewer would need another row.
				if (c > 1) expect(Math.ceil(tiles / (c - 1))).toBeGreaterThan(forced);
				checked++;
			}
		}
		expect(checked).toBe(7 * 179);
	});

	it('one row where they all fit, and nothing to say before a measurement', () => {
		expect(cols(7, 1376)).toBe(7);
		expect(cols(5, 600)).toBe(3);
		expect(cols(7, 0)).toBeNull();
		expect(cols(0, 900)).toBeNull();
		expect(studentTileColumns(7, 900, Number.NaN, 8)).toBeNull();
	});
});

describe('what is drawn and what is printed', () => {
	it('nothing hidden and every box ticked is the page as it shipped', () => {
		const l = studentPageLayout([], ALL_PRINT);
		expect(Object.values(l.shown).every(Boolean)).toBe(true);
		expect(Object.values(l.printed).every(Boolean)).toBe(true);
		expect(l.grade).toEqual({ shown: true, prints: true });
		expect(l.upcoming).toEqual({ shown: true, prints: true });
		expect(l.glance).toEqual({ shown: true, prints: true });
		expect(l.hero).toBe('split');
		expect(l.heroFigures).toBe(true);
		expect(l.notebookExtras).toBe(true);
	});

	it('a hidden section is off the page AND the paper, and takes its tile with it', () => {
		const l = studentPageLayout(['notebook', 'coins'], ALL_PRINT);
		expect(l.shown.notebook).toBe(false);
		expect(l.printed.notebook).toBe(false);
		expect(l.tiles.notebook).toEqual({ shown: false, prints: false });
		expect(l.tiles.coins).toEqual({ shown: false, prints: false });
		// Positive control: the tiles of shown sections are still there.
		expect(l.tiles.assignments).toEqual({ shown: true, prints: true });
		expect(l.tiles['hall-passes']).toEqual({ shown: true, prints: true });
		expect(l.notebookExtras).toBe(false);
	});

	it('a cleared print box keeps the section on screen and off the paper, as before', () => {
		const l = studentPageLayout([], printingWith(['notebook']));
		expect(l.shown.notebook).toBe(true);
		expect(l.printed.notebook).toBe(false);
		expect(l.tiles.notebook).toEqual({ shown: true, prints: false });
	});

	it('hiding At a glance takes every tile, and a row with no tile left is not drawn', () => {
		expect(studentPageLayout(['glance'], ALL_PRINT).glance).toEqual({ shown: false, prints: false });
		const onlyTiles = studentPageLayout(['assignments', 'notebook', 'hall-passes', 'coins'], ALL_PRINT);
		expect(onlyTiles.glance).toEqual({ shown: false, prints: false });
		// Positive control: one tile section left keeps the row.
		expect(studentPageLayout(['assignments', 'notebook', 'hall-passes'], ALL_PRINT).glance).toEqual({ shown: true, prints: true });
	});

	it('the grade follows Scores and Assignments while either is on the page, and stands alone when both are hidden', () => {
		expect(studentPageLayout([], printingWith(['scores', 'assignments'])).grade).toEqual({ shown: true, prints: false });
		expect(studentPageLayout([], printingWith(['scores'])).grade).toEqual({ shown: true, prints: true });
		expect(studentPageLayout(['assignments'], printingWith(['scores'])).grade).toEqual({ shown: true, prints: false });
		expect(studentPageLayout(['scores', 'assignments'], printingWith(['scores', 'assignments'])).grade).toEqual({ shown: true, prints: true });
		expect(studentPageLayout(['grade'], ALL_PRINT).grade).toEqual({ shown: false, prints: false });
	});

	it('Coming up follows Assignments, and stands alone when Assignments is hidden', () => {
		expect(studentPageLayout([], printingWith(['assignments'])).upcoming).toEqual({ shown: true, prints: false });
		expect(studentPageLayout(['assignments'], printingWith(['assignments'])).upcoming).toEqual({ shown: true, prints: true });
		expect(studentPageLayout(['upcoming'], ALL_PRINT).upcoming).toEqual({ shown: false, prints: false });
	});

	it('hiding the pictures puts the top in one column', () => {
		expect(studentPageLayout(['gallery'], ALL_PRINT).hero).toBe('solo');
		expect(studentPageLayout(['gallery', 'grade'], ALL_PRINT).hero).toBe('solo');
		expect(studentPageLayout(['gallery', 'grade', 'upcoming'], ALL_PRINT).hero).toBe('solo');
	});

	it('hiding a figure beside the pictures moves the pictures under the identity, so no column is left short', () => {
		// Every combination of the two figures with the pictures shown.
		expect(studentPageLayout([], ALL_PRINT).hero).toBe('split');
		expect(studentPageLayout(['grade'], ALL_PRINT).hero).toBe('stack');
		expect(studentPageLayout(['upcoming'], ALL_PRINT).hero).toBe('stack');
		expect(studentPageLayout(['grade', 'upcoming'], ALL_PRINT).hero).toBe('stack');
		// Sections outside the top card never move it.
		expect(studentPageLayout(['notebook', 'coins', 'scores', 'glance'], ALL_PRINT).hero).toBe('split');
		// The figure column is there exactly while one of the two is.
		expect(studentPageLayout(['grade'], ALL_PRINT).heroFigures).toBe(true);
		expect(studentPageLayout(['upcoming'], ALL_PRINT).heroFigures).toBe(true);
		expect(studentPageLayout(['grade', 'upcoming'], ALL_PRINT).heroFigures).toBe(false);
	});
});

describe('Needs attention and Scores share a line only while about the same height (polish round)', () => {
	it('the harness page (four late or missing, two notebook rows, two scores) stacks; one late piece and one notebook row beside two scores does not', () => {
		// The figures the decision runs on are the measured two-column rows'
		// (polish round C: a check-in's date sits under its words, as an
		// assignment's does, so the two rows are one height).
		expect(STUDENT_DUO_ROW_PX).toEqual({ attention: 77, checkIn: 77, score: 31, empty: 30 });
		expect(studentDuoStacks({ attention: 4, checkIns: 2, scores: 2 })).toBe(true);
		expect(studentDuoStacks({ attention: 4, checkIns: 0, scores: 2 })).toBe(true);
		// 77 + 154 = 231 against 62: 169px apart, measured 169px (332 against 163) at 960.
		expect(studentDuoStacks({ attention: 1, checkIns: 2, scores: 2 })).toBe(true);
		// 77 + 77 = 154 against 62: 92px apart, measured 92px (255 against 163) at 960.
		expect(studentDuoStacks({ attention: 1, checkIns: 1, scores: 2 })).toBe(false);
		expect(studentDuoStacks({ attention: 1, checkIns: 0, scores: 3 })).toBe(false);
	});
	it('it is symmetric: a long Scores beside an all-clear Needs attention stacks too', () => {
		expect(studentDuoStacks({ attention: 0, checkIns: 0, scores: 8 })).toBe(true);
		expect(studentDuoStacks({ attention: 0, checkIns: 0, scores: 0 })).toBe(false);
		expect(studentDuoStacks({ attention: 0, checkIns: 0, scores: 2 })).toBe(false);
	});
	it('the line is 100px: 92px apart stays side by side, 107px apart stacks', () => {
		expect(STUDENT_DUO_STACK_PX).toBe(100);
		// 2 x 77 + 77 = 231 against 4 x 31 = 124: 107 apart.
		expect(studentDuoStacks({ attention: 2, checkIns: 1, scores: 4 })).toBe(true);
		// 2 x 77 = 154 against 2 x 31 = 62: 92 apart.
		expect(studentDuoStacks({ attention: 0, checkIns: 2, scores: 2 })).toBe(false);
	});
	it('a count that is not a count is none', () => {
		expect(studentDuoStacks({ attention: Number.NaN, checkIns: -3, scores: 0 })).toBe(false);
	});
});

describe('the Sections menu fits beside its key with no floor (polish round)', () => {
	// The parts measured on the open panel at 960x600 (a 260px panel holding a
	// 101px list): 110px of heading, padding, gaps and footer, the note's 49px
	// with its margin and gap, 44px rows.
	const parts = { chrome: 110, note: 49, row: 44 };
	it('a 960x600 window with the key mid-screen (260px each side) takes the larger room, not a 300px floor', () => {
		expect(studentSectionsMenuFit({ above: 260, under: 260, ...parts })).toEqual({ room: 260, tight: false, short: 0, least: 154 });
		expect(studentSectionsMenuFit({ above: 120, under: 300, ...parts }).room).toBe(300);
	});
	it('short of the note and two rows (247px here), the note steps out of sight; with room for both it stays', () => {
		expect(studentSectionsMenuFit({ above: 247, under: 10, ...parts }).tight).toBe(false);
		expect(studentSectionsMenuFit({ above: 246, under: 10, ...parts }).tight).toBe(true);
		expect(studentSectionsMenuFit({ above: 200, under: 190, ...parts }).tight).toBe(true);
	});
	it('not even one row on either side says how far opening has to scroll, and never caps under the least panel', () => {
		const f = studentSectionsMenuFit({ above: 120, under: 130, ...parts });
		expect(f.short).toBe(24);
		expect(f.room).toBe(154);
		expect(studentSectionsMenuFit({ above: 154, under: 0, ...parts }).short).toBe(0);
	});
});

describe('the choice lives in the classroom store, on the account', () => {
	it('is an account group, stored sparse, and read back validated', () => {
		expect(CLASSROOM_PREFERENCE_HOMES.studentPage).toBe('account');
		expect(CLASSROOM_PREFERENCE_SCHEMA.groups).toContain('studentPage');
		expect(defaultClassroomPreferences().studentPage).toEqual({ hidden: [] });
		const p = defaultClassroomPreferences();
		expect(compactPreferences(CLASSROOM_PREFERENCE_SCHEMA, p)).toEqual({});
		p.studentPage.hidden = ['notebook', 'coins'];
		expect(compactPreferences(CLASSROOM_PREFERENCE_SCHEMA, p)).toEqual({ studentPage: { hidden: ['notebook', 'coins'] } });
		expect(readClassroomPreferences({ studentPage: { hidden: ['coins', 'bogus', 'notebook'] } }).studentPage).toEqual({ hidden: ['notebook', 'coins'] });
		expect(readClassroomPreferences({ studentPage: 'all' }).studentPage).toEqual({ hidden: [] });
	});

	it('Settings reads it out to a teacher and never to a student', () => {
		const setting = CLASSROOM_SETTINGS.find((s) => s.group === 'studentPage');
		expect(setting && 'summary' in setting ? setting.summary(readClassroomPreferences({ studentPage: { hidden: ['coins'] } }), 'manager') : null).toBe('Hidden: Coins and music');
		expect(settingsForRole('manager').map((g) => g.group)).toContain('studentPage');
		expect(settingsForRole('student').map((g) => g.group)).not.toContain('studentPage');
	});
});
