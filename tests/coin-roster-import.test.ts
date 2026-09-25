// tests/coin-roster-import.test.ts
//
// "Import from class roster" on the coin desk (ledger 0298, feedback R12):
// the PLANNER's exclusions, each of which fails silently if it ever regresses.
//
//   * A TEACHER ENROLLED IN THEIR OWN CLASS IS NEVER IMPORTED. In a coin
//     section they would be paid Weekly Wage with every student, and nothing
//     on screen says a row is a teacher's.
//   * AN INACTIVE ENROLLMENT IS NEVER IMPORTED. `active = false` is how a
//     student who left a class is recorded.
//   * NOBODY IS MOVED. `coin_section_students` is keyed on the email alone and
//     the assign RPC overwrites, so an address already in ANOTHER coin section
//     that reached the add list would be silently taken out of that section.
//   * "CANNOT TELL" IS A REFUSAL. A roster read with no manager flag (the
//     pre-0138 rung) or a placement read that failed must stop the import, not
//     read as "nobody manages this class" or "in no coin section".
//
// The fixtures are built here by hand, not from the harness or the planner.
// The roster rows are shapes `loadSectionRoster` returns; the mixed-case and
// duplicate addresses in the normalizing case are NOT something
// `classroom_enrollments` can hold (0082's CHECK forces `lower(btrim())` and
// the primary key is per section) -- that case pins the planner's own promise
// to normalize, dedupe and sort, which the brief asked for as a defence.

import { describe, expect, it } from 'vitest';
import type { ClassroomEnrollment } from '../src/lib/classroom/classroom';
import type { RosterRead } from '../src/lib/classroom/transports';
import {
	buildRosterImportPlan,
	CANNOT_TELL_MANAGERS,
	coinEmailKey,
	planRosterImport,
	rosterImportCandidates,
	samePlannedAdds
} from '../src/lib/coin-desk/roster-import';

const SECTION = 'class-b3';

function row(email: string, extra: Partial<ClassroomEnrollment> = {}): ClassroomEnrollment {
	return {
		section_id: SECTION,
		student_email: email,
		display_name: email.split('@')[0],
		active: true,
		manages: false,
		...extra
	};
}

/** Three new students, one already here, one elsewhere, a teacher, one who left. */
function classRoster(): RosterRead {
	return {
		managesReady: true,
		rows: [
			row('cara@boscotech.net'),
			row('ana@boscotech.net'),
			row('ben@boscotech.net'),
			row('here@boscotech.net'),
			row('elsewhere@boscotech.net'),
			row('teacher@boscotech.edu', { manages: true }),
			row('left@boscotech.net', { active: false })
		]
	};
}

const PLACEMENT = new Map([
	['here@boscotech.net', 'coin-b3'],
	['elsewhere@boscotech.net', 'coin-other'],
	// Placed, but not on this class: must not affect anything.
	['stranger@boscotech.net', 'coin-b3']
]);

function planFrom(read: RosterRead, placement = PLACEMENT) {
	const c = rosterImportCandidates(read);
	if (!c.ok) throw new Error('expected candidates');
	return planRosterImport(SECTION, c, placement, 'coin-b3');
}

describe('rosterImportCandidates: who could be imported at all', () => {
	it('keeps active students and drops the teacher and the inactive row, with both counted', () => {
		const c = rosterImportCandidates(classRoster());
		expect(c.ok).toBe(true);
		if (!c.ok) return;
		// Positive control: five active student rows survive, so the two
		// exclusions below cannot pass by the list being empty.
		expect(c.emails).toEqual([
			'ana@boscotech.net',
			'ben@boscotech.net',
			'cara@boscotech.net',
			'elsewhere@boscotech.net',
			'here@boscotech.net'
		]);
		expect(c.emails).not.toContain('teacher@boscotech.edu');
		expect(c.emails).not.toContain('left@boscotech.net');
		expect(c.managers).toBe(1);
		expect(c.inactive).toBe(1);
	});

	it('refuses a roster that cannot say who manages the class (the pre-0138 rung)', () => {
		const read = classRoster();
		const degraded: RosterRead = {
			managesReady: false,
			rows: read.rows.map(({ manages: _m, ...rest }) => rest)
		};
		expect(rosterImportCandidates(degraded)).toEqual({ ok: false, reason: 'cannot_tell_managers' });
	});

	it('refuses when even ONE row carries no flag, though the read claims it could tell', () => {
		const read = classRoster();
		const { manages: _m, ...noFlag } = read.rows[0];
		expect(
			rosterImportCandidates({ managesReady: true, rows: [noFlag, ...read.rows.slice(1)] })
		).toEqual({ ok: false, reason: 'cannot_tell_managers' });
	});

	it('normalizes the way the tables store an address, then dedupes and sorts', () => {
		const c = rosterImportCandidates({
			managesReady: true,
			rows: [row(' Zed@BoscoTech.net '), row('zed@boscotech.net'), row('amy@boscotech.net')]
		});
		expect(c.ok && c.emails).toEqual(['amy@boscotech.net', 'zed@boscotech.net']);
		// `btrim` strips spaces only; a tab is not what the database would strip.
		expect(coinEmailKey('\tA@x.net ')).toBe('\ta@x.net');
	});
});

describe('planRosterImport: nobody is moved, nobody already here is re-sent', () => {
	it('adds only the addresses in no coin section', () => {
		const plan = planFrom(classRoster());
		expect(plan.add).toEqual(['ana@boscotech.net', 'ben@boscotech.net', 'cara@boscotech.net']);
		expect(plan.already).toEqual(['here@boscotech.net']);
		expect(plan.elsewhere).toEqual([{ email: 'elsewhere@boscotech.net', sectionId: 'coin-other' }]);
		// The whole guarantee in one line: nothing in the add list has a placement.
		expect(plan.add.filter((e) => PLACEMENT.has(e))).toEqual([]);
		expect(plan.add).not.toContain('teacher@boscotech.edu');
		expect(plan.add).not.toContain('left@boscotech.net');
	});

	it('with no placements at all, every active student is added (the control for the filter above)', () => {
		const plan = planFrom(classRoster(), new Map());
		expect(plan.add).toHaveLength(5);
		expect(plan.already).toEqual([]);
		expect(plan.elsewhere).toEqual([]);
	});

	it('a changed add list is a different plan, and an identical one is the same', () => {
		const a = planFrom(classRoster());
		expect(samePlannedAdds(a, planFrom(classRoster()))).toBe(true);
		const moved = new Map(PLACEMENT);
		moved.set('ana@boscotech.net', 'coin-other');
		expect(samePlannedAdds(a, planFrom(classRoster(), moved))).toBe(false);
	});
});

describe('buildRosterImportPlan: every read it depends on fails closed', () => {
	it('a failed placement read refuses rather than treating everyone as unplaced', async () => {
		const res = await buildRosterImportPlan(
			{
				loadRoster: async () => ({ ok: true, data: classRoster() }),
				readPlacement: async () => ({ ok: false, message: 'permission denied' })
			},
			SECTION,
			'coin-b3'
		);
		expect(res.ok).toBe(false);
		expect(!res.ok && res.message).toContain('permission denied');
	});

	it('a degraded roster refuses with the sentence, and never asks the coin side', async () => {
		let asked = 0;
		const res = await buildRosterImportPlan(
			{
				loadRoster: async () => ({ ok: true, data: { managesReady: false, rows: [row('a@b.net')] } }),
				readPlacement: async () => {
					asked++;
					return { ok: true, data: new Map() };
				}
			},
			SECTION,
			'coin-b3'
		);
		expect(res).toEqual({ ok: false, message: CANNOT_TELL_MANAGERS });
		expect(asked).toBe(0);
	});

	it('a healthy pair of reads plans, and asks the coin side about exactly the candidates', async () => {
		let asked: readonly string[] = [];
		const res = await buildRosterImportPlan(
			{
				loadRoster: async () => ({ ok: true, data: classRoster() }),
				readPlacement: async (emails) => {
					asked = emails;
					return { ok: true, data: PLACEMENT };
				}
			},
			SECTION,
			'coin-b3'
		);
		expect(res.ok && res.data.add).toEqual([
			'ana@boscotech.net',
			'ben@boscotech.net',
			'cara@boscotech.net'
		]);
		expect(asked).toHaveLength(5);
	});
});
