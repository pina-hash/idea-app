/**
 * The CLASSROOM half of "Import from class roster", in memory, for the
 * /dev/coin-desk harness. It stands in for `classRosterTransports` in
 * `$lib/coin-desk/roster-import.ts`: the class list is what the admin's
 * `classroom_sections` select returns, and a roster is what
 * `loadSectionRoster` returns -- `classroom_section_roster` (0138) rows with
 * the `manages` flag, or, in `degraded` mode, the pre-0138 table select with
 * no flag and `managesReady: false`.
 *
 * EVERY ROW IS ONE THE REAL READ CAN RETURN. Enrollment emails are
 * `lower(btrim())` by 0082's CHECK and unique per section, so there are no
 * mixed-case or duplicate addresses here; the normalizing is the planner's
 * defence, and the planner's unit test is where it is exercised.
 *
 * The fixture is built so one class shows every outcome at once against the
 * first coin section in the list ("eng1h-sophomore", which fake-ledger.ts
 * seeds with healthy.student and debt.student):
 *   - 27 students in no coin section      -> "Add 27 students"
 *   - healthy.student                     -> already in this coin section
 *   - pass.student (in period-3-makeup)   -> in another coin section, left there
 *   - a teacher enrolled in her own class -> not counted (manages)
 *   - a student who left                  -> not counted (inactive)
 * A second class has only students already placed ("Nobody to add"), and an
 * archived third class must never be offered.
 */

import type { ClassroomEnrollment, ClassroomSection, TxResult } from '$lib/classroom/classroom';
import type { RosterRead } from '$lib/classroom/transports';
import type { ClassRosterTransports } from '$lib/coin-desk/roster-import';

export type RosterMode = 'full' | 'degraded';

const IDEA100 = { id: 'course-idea100', code: 'IDEA 100', title: 'Intro to Engineering', active: true };
const IDEA209H = { id: 'course-idea209h', code: 'IDEA 209H', title: 'Engineering II Honors', active: true };

const CLASSES: ClassroomSection[] = [
	{
		id: 'class-idea100-b3',
		course_id: IDEA100.id,
		label: '1',
		block: '3',
		teacher_email: 'mr.teacher@boscotech.edu',
		active: true,
		course: IDEA100
	},
	{
		id: 'class-idea209h-b5',
		course_id: IDEA209H.id,
		label: '1',
		block: '5',
		teacher_email: 'mr.teacher@boscotech.edu',
		active: true,
		course: IDEA209H
	},
	{
		id: 'class-idea100-archived',
		course_id: IDEA100.id,
		label: '2',
		block: '7',
		teacher_email: 'mr.teacher@boscotech.edu',
		active: false,
		course: IDEA100
	}
];

const FIRST = ['Mara', 'Nico', 'Omar', 'Pia', 'Rafa', 'Suki', 'Theo', 'Uma', 'Vic'];
const LAST = ['Ortiz', 'Park', 'Quon'];

function enrollment(
	sectionId: string,
	email: string,
	name: string,
	extra: Partial<ClassroomEnrollment> = {}
): ClassroomEnrollment {
	return {
		section_id: sectionId,
		student_email: email,
		display_name: name,
		active: true,
		updated_at: '2026-09-01T15:00:00Z',
		manages: false,
		...extra
	};
}

function rosterFor(sectionId: string): ClassroomEnrollment[] {
	if (sectionId === 'class-idea100-b3') {
		const rows: ClassroomEnrollment[] = [];
		for (const last of LAST) {
			for (const first of FIRST) {
				rows.push(
					enrollment(sectionId, `${first}.${last}@boscotech.net`.toLowerCase(), `${last}, ${first}`)
				);
			}
		}
		rows.push(enrollment(sectionId, 'healthy.student@boscotech.net', 'Rivera, Alex'));
		rows.push(enrollment(sectionId, 'pass.student@boscotech.net', 'Diaz, Sam'));
		rows.push(enrollment(sectionId, 'mr.teacher@boscotech.edu', 'Teacher, Mr.', { manages: true }));
		rows.push(enrollment(sectionId, 'left.student@boscotech.net', 'Left, Student', { active: false }));
		return rows.sort((a, b) => a.display_name.localeCompare(b.display_name));
	}
	if (sectionId === 'class-idea209h-b5') {
		return [
			enrollment(sectionId, 'debt.student@boscotech.net', 'Kim, Jordan'),
			enrollment(sectionId, 'healthy.student@boscotech.net', 'Rivera, Alex')
		];
	}
	if (sectionId === 'class-idea100-archived') {
		return [enrollment(sectionId, 'quinn.patel@boscotech.net', 'Patel, Quinn')];
	}
	return [];
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createFakeClassRoster(mode: RosterMode): ClassRosterTransports {
	return {
		async listClasses(): Promise<TxResult<ClassroomSection[]>> {
			await wait(80);
			return { ok: true, data: CLASSES.map((c) => ({ ...c })) };
		},
		async loadRoster(sectionId: string): Promise<TxResult<RosterRead>> {
			await wait(120);
			const rows = rosterFor(sectionId);
			if (mode === 'degraded') {
				// The pre-0138 rung: the plain table select, which has no flag.
				return {
					ok: true,
					data: {
						rows: rows.map(({ manages: _manages, ...rest }) => rest),
						managesReady: false
					}
				};
			}
			return { ok: true, data: { rows, managesReady: true } };
		}
	};
}
