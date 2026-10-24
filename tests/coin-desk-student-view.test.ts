// tests/coin-desk-student-view.test.ts
//
// The pure layer under the Coin Desk's IDEA Coin V2 session-two areas
// ($lib/coin-desk/student-view, log, roles, settings-session-two).
//
// WHY THESE, when most of the desk is verified in its harness: each one fails
// SILENTLY when it is wrong.
//
//   * THE EXPORT CSV is a file somebody opens in a spreadsheet or hands to
//     Claude. A field that breaks the quoting shifts every column after it
//     with nothing on screen to say so, and a note that starts with `=` runs
//     as a formula when the file is opened. Both are asserted on built rows,
//     and the expected text is written out by hand, never produced by the
//     function under test.
//   * THE EDIT GATE (`isEditable`) decides whether an Edit control is offered;
//     a wrong answer either offers a control whose only outcome is a refusal
//     or hides a legitimate edit, and both look like ordinary rows.
//   * THE WHOLE-CLASS EMAILS are the list a bulk log charges. A duplicate in
//     two spellings charges one student twice with two ordinary rows to show
//     for it (CLAUDE.md: normalize identity keys before acting).
//   * A FORM'S "NOT READY" SENTENCE is what an aria-disabled button says; a
//     check that lets through what the database refuses is a click that
//     answers with a refusal, and one that refuses what the database takes is
//     a button nobody can press.

import { describe, expect, it } from 'vitest';
import {
	EXPORT_COLUMNS,
	exportCsv,
	exportFileName,
	isEditable,
	liveEdits,
	type DeskHistoryTxn,
	type ExportRow
} from '../src/lib/coin-desk/student-view';
import { isBulkEligible, logClasses, rosterEmails } from '../src/lib/coin-desk/log';
import { classRoleSetting, rulesPayload, rulesProblem, shownRoleDays, type RoleDay } from '../src/lib/coin-desk/roles';
import {
	fieldValue,
	placementProblem,
	roleInstructionsValue,
	SESSION_TWO_GROUPS,
	storedDays,
	withDay
} from '../src/lib/coin-desk/settings-session-two';

function row(over: Partial<ExportRow> = {}): ExportRow {
	return {
		id: 't1',
		created_at: '2026-10-12T15:00:00Z',
		email: 'ana@boscotech.net',
		name: 'Ana Reyes',
		category_id: 'above_and_beyond',
		category: 'Above and Beyond',
		kind: 'award',
		amount: 3,
		medium: 'digital',
		quantity: null,
		note: null,
		actor: 'apina@boscotech.edu',
		transfer_id: null,
		meta: {},
		...over
	};
}

describe('the staff export CSV', () => {
	it('writes the header and one line per row, CRLF-separated, in the column order', () => {
		const csv = exportCsv([row()]);
		expect(csv).toBe(
			'created_at,email,name,category_id,category,kind,amount,medium,quantity,note,actor,transfer_id,id,meta\r\n' +
				'2026-10-12T15:00:00Z,ana@boscotech.net,Ana Reyes,above_and_beyond,Above and Beyond,award,3,digital,,,apina@boscotech.edu,,t1,{}\r\n'
		);
		// Every raw field of a row is a column: nothing is dropped on the way out.
		expect(EXPORT_COLUMNS.length).toBe(14);
	});

	it('quotes a comma, a quote and a line break, and doubles the quote', () => {
		const csv = exportCsv([row({ note: 'late, "again"\nsecond line', name: 'Reyes, Ana' })]);
		const line = csv.split('\r\n')[1];
		expect(line).toContain('"Reyes, Ana"');
		expect(line).toContain('"late, ""again""\nsecond line"');
		// A positive control for the column count: unquoted, the comma in the
		// name alone would have made this line one column too long.
		expect(csv.split('\r\n')[1].startsWith('2026-10-12T15:00:00Z,ana@boscotech.net,"Reyes, Ana",')).toBe(true);
	});

	it('defuses a formula a person typed, and leaves a negative amount a number', () => {
		const csv = exportCsv([row({ note: '=HYPERLINK("x")', amount: -5, name: '@ana' })]);
		const line = csv.split('\r\n')[1];
		expect(line).toContain(`"'=HYPERLINK(""x"")"`);
		expect(line).toContain(`'@ana`);
		expect(line).toContain(',-5,');
		expect(line).not.toContain("'-5");
	});

	it('writes meta as its JSON, quoted', () => {
		const csv = exportCsv([row({ meta: { edits: 't0', old: 1, new: 2 } })]);
		expect(csv).toContain('"{""edits"":""t0"",""old"":1,""new"":2}"');
	});

	it('names a file without an address, on the day given', () => {
		expect(exportFileName('student', 'ana@boscotech.net', 'csv', '2026-10-15')).toBe('idea-coins-student-ana-2026-10-15.csv');
		expect(exportFileName('class', 'IDEA 100 Block 3', 'json', '2026-10-15')).toBe('idea-coins-class-idea-100-block-3-2026-10-15.json');
		expect(exportFileName('economy', '', 'csv', '2026-10-15')).toBe('idea-coins-economy-2026-10-15.csv');
	});
});

describe('which history rows offer an amount edit (mirroring 0250)', () => {
	const base: DeskHistoryTxn = {
		id: 'a',
		category_id: 'above_and_beyond',
		category_name: 'Above and Beyond',
		amount: 3,
		medium: 'digital',
		created_at: '2026-10-12T15:00:00Z'
	};

	it('offers it on an ordinary digital row (the positive control)', () => {
		expect(isEditable(base)).toBe(true);
	});

	it('refuses each shape 0250 refuses', () => {
		expect(isEditable({ ...base, medium: 'physical' })).toBe(false);
		expect(isEditable({ ...base, transfer_id: 'x' })).toBe(false);
		expect(isEditable({ ...base, category_id: 'reversal' })).toBe(false);
		expect(isEditable({ ...base, category_id: 'amount_correction' })).toBe(false);
		expect(isEditable({ ...base, category_id: 'payout_hold' })).toBe(false);
		expect(isEditable({ ...base, reversed: true })).toBe(false);
		expect(isEditable({ ...base, reverses: 'z' })).toBe(false);
	});

	it('counts only the edits still standing', () => {
		const t: DeskHistoryTxn = {
			...base,
			edits: [
				{ at: '2026-10-12T16:00:00Z', old: 3, new: 5, undone: true },
				{ at: '2026-10-12T17:00:00Z', old: 3, new: 4, undone: false }
			]
		};
		expect(liveEdits(t).map((e) => e.new)).toEqual([4]);
	});
});

describe('the Log area over IDEA Classroom classes', () => {
	it('normalizes, dedupes and sorts a roster before a whole-class run', () => {
		expect(
			rosterEmails([{ email: 'B@x.net ' }, { email: 'a@x.net' }, { email: 'b@x.net' }, { email: '' }, { email: 'nobody' }])
		).toEqual(['a@x.net', 'b@x.net']);
	});

	it('bulk-logs exactly the one-amount pricing models, and never the stipend or extra credit', () => {
		expect(isBulkEligible({ id: 'above_and_beyond', pricing_model: 'range' })).toBe(true);
		expect(isBulkEligible({ id: 'weekly_wage', pricing_model: 'flat' })).toBe(true);
		expect(isBulkEligible({ id: 'debt_payment', pricing_model: 'variable' })).toBe(true);
		expect(isBulkEligible({ id: 'text_printing', pricing_model: 'per_unit' })).toBe(false);
		expect(isBulkEligible({ id: 'perfect_score_graded_work', pricing_model: 'formula' })).toBe(false);
		expect(isBulkEligible({ id: 'extra_credit', pricing_model: 'per_unit' })).toBe(false);
		expect(isBulkEligible({ id: 'weekly_role_stipend', pricing_model: 'flat' })).toBe(false);
	});

	it('reads the class list from coin_fine_sections, and falls back to the scope list with no count', () => {
		expect(logClasses([{ id: 'c1', label: 'IDEA 100', students: '3' }], [])).toEqual([{ id: 'c1', label: 'IDEA 100', students: 3 }]);
		expect(logClasses(null, [{ id: 'c2', label: 'IDEA 209H' }])).toEqual([{ id: 'c2', label: 'IDEA 209H' }]);
	});
});

describe('roles (mirroring 0247)', () => {
	it("reads a class with no setting as on, cap 1", () => {
		expect(classRoleSetting({ id: 'c', label: 'C', roles: null }, 'shop_steward')).toEqual({
			role_id: 'shop_steward',
			cap: 1,
			enabled: true,
			held: 0
		});
	});

	it("checks a holder's rules against 0245's ranges", () => {
		const good = { min_gap_minutes: '45', photos_per_day: '2', window_start: '07:00', window_end: '16:00' };
		expect(rulesProblem(good)).toBeNull();
		expect(rulesProblem({ ...good, photos_per_day: '1' })).toMatch(/2 to 10/);
		expect(rulesProblem({ ...good, min_gap_minutes: '601' })).toMatch(/0 to 600/);
		expect(rulesProblem({ ...good, window_end: '06:00' })).toMatch(/end after/);
		expect(rulesProblem({ ...good, window_start: '7:00' })).toMatch(/07:00/);
		expect(rulesPayload(good)).toEqual({ min_gap_minutes: 45, photos_per_day: 2, window_start: '07:00', window_end: '16:00' });
	});

	it('shows class days, days with photos and days decided by hand, newest first', () => {
		const day = (d: string, over: Partial<RoleDay> = {}): RoleDay => ({
			day: d, photos: 0, gap_minutes: null, rules_pass: false, reason: 'no_photos', override: null,
			valid: false, status: 'none', class_day: false, photo_paths: [], ...over
		});
		const shown = shownRoleDays([
			day('2026-10-10'),
			day('2026-10-11', { photos: 1 }),
			day('2026-10-12', { class_day: true }),
			day('2026-10-13', { override: 'accepted' })
		]).map((d) => d.day);
		expect(shown).toEqual(['2026-10-13', '2026-10-12', '2026-10-11']);
	});
});

describe('the session-two settings (mirroring 0245)', () => {
	it('declares every key once', () => {
		const keys = SESSION_TWO_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
		expect(new Set(keys).size).toBe(keys.length);
		expect(keys.length).toBeGreaterThan(15);
	});

	it('turns a draft into the stored value, or says the rule', () => {
		const field = (key: string) => SESSION_TWO_GROUPS.flatMap((g) => g.fields).find((f) => f.key === key)!;
		expect(fieldValue(field('role_photos_per_day'), '3')).toEqual({ value: 3 });
		expect(fieldValue(field('role_photos_per_day'), '2.5')).toHaveProperty('problem');
		expect(fieldValue(field('chronic_debt_threshold'), '5')).toHaveProperty('problem');
		expect(fieldValue(field('chronic_debt_threshold'), '-20')).toEqual({ value: -20 });
		expect(fieldValue(field('role_window_start'), '07:30')).toEqual({ value: '07:30' });
		expect(fieldValue(field('role_window_start'), '7:30')).toHaveProperty('problem');
		expect(fieldValue(field('debt_relief_fines_since'), '2026-02-30')).toHaveProperty('problem');
		expect(fieldValue(field('background_guidance'), 'x'.repeat(4001))).toHaveProperty('problem');
	});

	it('keeps a date list sorted, unique and clean', () => {
		expect(withDay(['2026-12-18', '2026-10-01'], '2026-11-11')).toEqual(['2026-10-01', '2026-11-11', '2026-12-18']);
		expect(withDay(['2026-10-01'], '2026-10-01')).toEqual(['2026-10-01']);
		expect(storedDays(['2026-12-18', 7, 'nope', '2026-10-01'])).toEqual(['2026-10-01', '2026-12-18']);
	});

	it('checks the three placement defaults and drops an empty instruction', () => {
		expect(placementProblem(['3', '2', '1'])).toBeNull();
		expect(placementProblem(['3', '', '1'])).toMatch(/Second/);
		expect(roleInstructionsValue({ shop_steward: 'Photograph the shop.', lab_tech: '  ' })).toEqual({
			value: { shop_steward: 'Photograph the shop.' }
		});
	});
});
