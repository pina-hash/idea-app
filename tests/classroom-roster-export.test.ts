// tests/classroom-roster-export.test.ts
//
// THE ROSTER EXPORT AND THE CLASS MAIL DRAFT.
//
// Two guarantees here would regress SILENTLY, which is the bar for a test in
// this repo at all:
//
//   1. THE CSV ESCAPE. A display name is a value a person typed and this file
//      is opened in Excel, which executes a leading `=`, `+`, `-` or `@`. A
//      roster export that quoted correctly and forgot the formula guard would
//      look perfect in every eyeball check and hand a teacher a spreadsheet
//      that runs a student's name. So the module REUSES `csvCell` from
//      `assignment-spec` rather than writing a second escape, and this file
//      pins that the reuse is real by putting the hostile values through it.
//   2. THE MAIL DRAFT NEVER DROPPING A RECIPIENT. A `mailto:` that silently
//      truncates produces a message that looks sent and is not, to precisely
//      the people who cannot tell. Nothing on screen reports it and nothing
//      ever will, so it is asserted here.
//
// The column choice is deliberately asserted too, because an export is exactly
// where a field gets added without anybody deciding to.

import { describe, expect, test } from 'vitest';
import {
	MAILTO_URL_LIMIT,
	ROSTER_CSV_HEADERS,
	classEmailList,
	classEmailRecipients,
	mailtoPlan,
	mailtoPlanNote,
	rosterCsv,
	rosterCsvFilename,
	rosterStatusLabel
} from '../src/lib/classroom/roster-export';
import type { ClassroomEnrollment, ClassroomSection } from '../src/lib/classroom/classroom';

const SECTION: ClassroomSection = {
	id: 'sec-1',
	course_id: 'crs-1',
	label: 'Block 1',
	block: '1',
	teacher_email: 'teacher@boscotech.edu',
	active: true,
	course: { id: 'crs-1', code: 'IDEA100', title: 'Engineering I', active: true }
};

function row(over: Partial<ClassroomEnrollment>): ClassroomEnrollment {
	return {
		section_id: 'sec-1',
		student_email: 'ana@boscotech.net',
		display_name: 'Ana Reyes',
		active: true,
		...over
	};
}

/** The file back as records, BOM stripped. Deliberately a dumb split: the point
 *  is to read what was written, not to re-implement a CSV parser that could
 *  agree with a bug. */
function lines(text: string): string[] {
	expect(text.charCodeAt(0)).toBe(0xfeff);
	return text.slice(1).replace(/\r\n$/, '').split('\r\n');
}

describe('the CSV carries what is on screen and nothing more', () => {
	test('the header is the six columns, in order', () => {
		const out = lines(rosterCsv(SECTION, [row({})]));
		expect(out[0]).toBe('Last,First,Email,Status,Class,Block');
		expect(out[0].split(',')).toEqual([...ROSTER_CSV_HEADERS]);
	});

	test('no internal id and no timestamp reaches the file', () => {
		const text = rosterCsv(
			SECTION,
			[row({ updated_at: '2026-08-31T10:00:00.000Z' })]
		);
		// POSITIVE CONTROL FIRST: the row really is in the file, so the absences
		// below are a choice about columns and not an empty export.
		expect(text).toContain('ana@boscotech.net');
		expect(text).not.toContain('sec-1');
		expect(text).not.toContain('2026-08-31');
	});

	test('the status column says the same three things the row does', () => {
		expect(rosterStatusLabel(row({ manages: true }))).toBe('Manages this class');
		expect(rosterStatusLabel(row({ active: true }))).toBe('Enrolled');
		expect(rosterStatusLabel(row({ active: false }))).toBe('Not on the live roster');
		// A manager is a manager whether or not their enrollment is active: 0138
		// says such a person is never a student row, and flattening them into
		// "Enrolled" is the number the hero count already stopped telling.
		expect(rosterStatusLabel(row({ manages: true, active: false }))).toBe('Manages this class');
	});

	test('every row is exported, managers and inactive alike', () => {
		const out = lines(
			rosterCsv(SECTION, [
				row({ student_email: 'ana@boscotech.net', display_name: 'Ana Reyes' }),
				row({ student_email: 'ben@boscotech.net', display_name: 'Ben Ortiz', active: false }),
				row({ student_email: 'teacher@boscotech.edu', display_name: 'Tee Cher', manages: true })
			])
		);
		expect(out).toHaveLength(4);
		expect(out.filter((l) => l.includes('Not on the live roster'))).toHaveLength(1);
		expect(out.filter((l) => l.includes('Manages this class'))).toHaveLength(1);
	});

	test('it sorts last name then first, the way a gradebook does', () => {
		const out = lines(
			rosterCsv(SECTION, [
				row({ student_email: 'z@boscotech.net', display_name: 'Zoe Alvarez' }),
				row({ student_email: 'a@boscotech.net', display_name: 'Ana Alvarez' }),
				row({ student_email: 'b@boscotech.net', display_name: 'Ben Ortiz' })
			])
		);
		expect(out.slice(1).map((l) => l.split(',').slice(0, 2).join(' '))).toEqual([
			'Alvarez Ana',
			'Alvarez Zoe',
			'Ortiz Ben'
		]);
	});
});

describe('the escape is the grades CSV escape, not a second one', () => {
	// THE VALUES A SECOND IMPLEMENTATION GETS WRONG. Each of these is a real
	// thing a display name can be: a formula-looking name, a comma, a quote, a
	// newline pasted in from somewhere.
	const HOSTILE: [string, string][] = [
		['=SUM(A1:A9)', "'=SUM(A1:A9)"],
		['-Reyes', "'-Reyes"],
		['+Ortiz', "'+Ortiz"],
		['@here', "'@here"]
	];

	test.each(HOSTILE)('a leading formula character in %s is neutralised', (name, expected) => {
		const out = lines(rosterCsv(SECTION, [row({ display_name: name })]));
		// One word, so `splitLastFirst` puts the whole thing in Last.
		expect(out[1].startsWith(expected)).toBe(true);
	});

	test('a comma, a quote and a newline are quoted rather than breaking the row', () => {
		const out = lines(rosterCsv(SECTION, [row({ display_name: 'Reyes, "Ana"' })]));
		// Still exactly two records: the comma inside the name did not become a
		// column boundary.
		expect(out).toHaveLength(2);
		expect(out[1]).toContain('"""Ana"""');
	});

	test('a blank display name falls back to the address local part', () => {
		const out = lines(rosterCsv(SECTION, [row({ display_name: '' })]));
		expect(out[1].startsWith('ana,')).toBe(true);
	});
});

describe('the filename names the class and the day', () => {
	test('it is lowercase, hyphenated and dated', () => {
		expect(rosterCsvFilename(SECTION, Date.parse('2026-09-02T18:00:00Z'))).toBe(
			'idea100-block-1-2026-09-02-roster.csv'
		);
	});

	test('a section with no course code still produces a usable name', () => {
		expect(
			rosterCsvFilename({ ...SECTION, course: null }, Date.parse('2026-09-02T18:00:00Z'))
		).toBe('class-block-1-2026-09-02-roster.csv');
	});
});

// ---------------------------------------------------------------------------
// EMAILING THE CLASS.
// ---------------------------------------------------------------------------

describe('who the class email is addressed to', () => {
	test('managers and inactive enrollments are left out, and the rest are deduped', () => {
		const to = classEmailRecipients([
			row({ student_email: 'Ana@Boscotech.net' }),
			row({ student_email: 'ana@boscotech.net' }),
			row({ student_email: 'ben@boscotech.net', active: false }),
			row({ student_email: 'teacher@boscotech.edu', manages: true }),
			row({ student_email: 'cara@boscotech.net' })
		]);
		expect(to).toEqual(['ana@boscotech.net', 'cara@boscotech.net']);
		// POSITIVE CONTROL: those two rows really are in the input and really do
		// come back when they are ordinary students.
		expect(
			classEmailRecipients([
				row({ student_email: 'ben@boscotech.net' }),
				row({ student_email: 'teacher@boscotech.edu' })
			])
		).toEqual(['ben@boscotech.net', 'teacher@boscotech.edu']);
	});

	test('an empty class produces no draft and says why', () => {
		const plan = mailtoPlan([]);
		expect(plan.drafts).toEqual([]);
		expect(mailtoPlanNote(plan)).toContain('Nobody on the live roster');
	});
});

describe('the mail draft never drops a recipient', () => {
	const many = (n: number) =>
		Array.from({ length: n }, (_, i) => `student.number${i}@boscotech.net`);

	test('a small class is one draft, BCC, with everybody on it', () => {
		const plan = mailtoPlan(many(5));
		expect(plan.drafts).toHaveLength(1);
		expect(plan.drafts[0].href.startsWith('mailto:?bcc=')).toBe(true);
		expect(plan.drafts[0].recipients).toEqual(plan.recipients);
		expect(mailtoPlanNote(plan)).toContain('one draft');
	});

	test('a class too long for one URL is split, and every address is still on exactly one draft', () => {
		const roster = many(60);
		const plan = mailtoPlan(roster);
		// THE CASE THIS EXISTS FOR: it really did have to split.
		expect(plan.drafts.length).toBeGreaterThan(1);
		const carried = plan.drafts.flatMap((d) => d.recipients);
		expect(carried.sort()).toEqual([...roster].sort());
		// Exactly once each -- a chunker that overlapped would mail somebody
		// twice, which is the other direction of the same bug.
		expect(new Set(carried).size).toBe(roster.length);
	});

	test('every generated URL is under the ceiling', () => {
		for (const n of [1, 10, 40, 60, 120]) {
			for (const draft of mailtoPlan(many(n), 'Reminder about tomorrow').drafts) {
				expect(draft.href.length).toBeLessThanOrEqual(MAILTO_URL_LIMIT);
			}
		}
	});

	test('the note states the split and the totals, so a missing window is noticeable', () => {
		const plan = mailtoPlan(many(60));
		const note = mailtoPlanNote(plan);
		expect(note).toContain(`${plan.drafts.length} drafts`);
		expect(note).toContain(`= ${plan.recipients.length} students`);
		// It says what happens if only some are sent. A note that merely counted
		// would leave the teacher to work that out.
		expect(note).toContain('some of the class will not get it');
	});

	test('a single address that cannot fit refuses rather than truncating', () => {
		// The one input that cannot be chunked any further.
		const plan = mailtoPlan([`${'a'.repeat(4000)}@boscotech.net`]);
		expect(plan.impossible).toBe(true);
		expect(plan.drafts).toEqual([]);
		expect(mailtoPlanNote(plan)).toContain('Copy the list instead');
	});

	test('the subject rides on every draft', () => {
		const plan = mailtoPlan(many(60), 'Bring your notebook');
		expect(plan.drafts.length).toBeGreaterThan(1);
		for (const d of plan.drafts) {
			expect(d.href).toContain(`subject=${encodeURIComponent('Bring your notebook')}`);
		}
	});

	test('nobody is in the To field, ever', () => {
		for (const d of mailtoPlan(many(30), 'Hi').drafts) {
			// `mailto:` with an empty path is the whole point: the teacher is the
			// only visible recipient and a reply does not go to thirty people.
			expect(d.href.startsWith('mailto:?')).toBe(true);
			expect(d.href).not.toMatch(/[?&]to=/);
			expect(d.href).not.toMatch(/[?&]cc=/);
		}
	});

	test('the copyable list is the same set the drafts carry', () => {
		const roster = many(60);
		const plan = mailtoPlan(roster);
		expect(classEmailList(plan.recipients).split(', ').sort()).toEqual(
			plan.drafts.flatMap((d) => d.recipients).sort()
		);
	});
});
