// tests/db/html-assignment-close.test.ts
//
// CAN AN INSTRUCTOR CLOSE AN ASSIGNMENT, AND DOES THE CLOSE ACTUALLY HOLD?
// Against a REAL embedded Postgres with the REAL migration files applied
// unmodified, through the REAL RPCs, as the REAL roles (`asUser` -- SET ROLE
// authenticated with the JWT claims GUC, which is what PostgREST does).
//
// ===========================================================================
// WHAT THIS FILE IS FOR
// ===========================================================================
//
// 0198 adds `classroom_close_assignment`. It exists because nothing else in the
// schema lets an instructor put a submission into 'submitted' -- measured, and
// the census is asserted below rather than asserted about: `describe('the hole
// 0198 fills')` puts a teacher to `classroom_submit_assignment` and to a direct
// UPDATE and prints both refusals, so the claim "no path existed" is a
// measurement in this file and not a sentence in a header.
//
// THREE ITEM SHAPES, because a ported document, a spec-backed assignment and an
// item carrying BOTH are three different resolutions inside
// `classroom_save_response` and a close that worked on one of them would be a
// close that silently did nothing on the other two. Every shape is closed,
// written to, reopened and written to again.
//
// ===========================================================================
// THE HALF THAT WOULD HAVE FAILED SILENTLY
// ===========================================================================
//
// A close that a student can undo is not a close, and it does not look broken:
// the roster says closed, the state column says 'submitted', and the work lands
// anyway. `describe('a student cannot undo it')` is the assertion that bites,
// and it carries its own POSITIVE CONTROL -- the same student, on the same
// item, taking back a hand-in they genuinely made -- so "unsubmit was refused"
// cannot pass because unsubmit is broken for everybody.
//
// ===========================================================================
// WHERE THE EXPECTED VALUES COME FROM
// ===========================================================================
//
// The refusal reasons and states are read back off the database with plain
// selects and compared against strings typed here from 0086's own column
// comment (`draft`, `submitted`, `returned`). Nothing is compared against a
// value the function under test produced, and the roster comes from
// `classroom_enrollments` rather than from anything the close returned.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './harness';
import {
	assignmentLockState,
	assignmentAcceptsWork,
	assignmentLockNotice,
	ASSIGNMENT_LOCK_NOTICE
} from '../../src/lib/classroom/html-assignment/lock';
import type { HtmlAssignmentManifest } from '../../src/lib/classroom/html-assignment/manifest';
import type { SubmissionState } from '../../src/lib/classroom/assignment-spec';

/** The classroom chain through 0198, in production order. */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0090_classroom_instructor_materials.sql',
	'0092_classroom_reference_specs.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0104_classroom_edit_visibility.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0110_classroom_content_revisions.sql',
	'0122_rich_text_nested_lists.sql',
	'0133_classroom_storage_attachments.sql',
	'0134_classroom_submission_open_race.sql',
	'0135_classroom_instructor_storage_and_public_attachments.sql',
	'0137_anon_execute_sweep.sql',
	'0171_classroom_extra_credit.sql',
	'0176_classroom_item_images.sql',
	'0195_classroom_html_assignments.sql',
	'0197_classroom_html_assignment_write_gate.sql',
	'0198_classroom_close_assignment.sql'
] as const;

/**
 * The three columns that decide, typed as the CLIENT MIRROR types them so the
 * mirror can be handed a row straight off the database. `state` is
 * `SubmissionState` and not `string`: a widened type here would let a typo in a
 * literal compile and the assertion would then be about nothing.
 */
interface StoredRow {
	state: SubmissionState;
	submitted_at: string | null;
	graded_at: string | null;
}

const say = (line: string) => console.log(`    [close] ${line}`);

/** One module, one block, one criterion: the smallest legal manifest. */
function manifest(): HtmlAssignmentManifest {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Bench setup',
		course: 'IDEA100',
		points: 4,
		header: [{ id: 'who', field: 'studentName', type: 'text' }],
		modules: [
			{
				id: 'm1',
				title: 'Set the vise',
				points: 4,
				audience: 'individual',
				blocks: [{ id: 'm1-setup', field: 'setup', type: 'longText', minSentences: 1 }],
				criteria: [
					{
						id: 'm1-c',
						text: 'The setup is recorded',
						points: 4,
						levels: [
							{ points: 4, label: 'Complete', short: 'Recorded', descriptor: 'States what was done.' },
							{ points: 2, label: 'Developing', short: 'Partial', descriptor: 'States some of it.' },
							{ points: 0, label: 'Absent', short: 'None', descriptor: 'Not attempted.' }
						]
					}
				]
			}
		]
	};
}

function documentFor(m: HtmlAssignmentManifest): string {
	const fields = [
		...(m.header ?? []).map((b) => b.field),
		...m.modules.flatMap((mod) => mod.blocks.map((b) => b.field))
	];
	return [
		'<!doctype html>',
		'<html><head><title>Bench setup</title></head><body>',
		'  <form>',
		fields.map((f) => `    <input data-field="${f}">`).join('\n'),
		'  </form>',
		`  <script type="application/json" id="idea-manifest">${JSON.stringify(m)}<\/script>`,
		'</body></html>'
	].join('\n');
}

/** The companion spec: the SAME block id, so a save resolves under either. */
function companionSpec() {
	return {
		schemaVersion: 1,
		meta: { assignmentId: 'bench-1', title: 'Bench setup', totalPoints: 4 },
		modules: [
			{
				id: 'm1',
				title: 'Set the vise',
				points: 4,
				blocks: [{ type: 'textField', id: 'm1-setup', prompt: 'Set the vise', minSentences: 1 }],
				rubric: [
					{
						id: 'm1-c',
						criterion: 'The setup is recorded',
						levels: [
							{ points: 4, label: 'Complete', descriptor: 'States what was done.' },
							{ points: 2, label: 'Developing', descriptor: 'States some of it.' },
							{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
						]
					}
				]
			}
		]
	};
}

describe('0198: an instructor closes an assignment', () => {
	let db: TestDb;
	let admin: SeededUser;
	let teacher: SeededUser;
	let ana: SeededUser;
	let ben: SeededUser;
	/** A student in a DIFFERENT section, on a DIFFERENT item this teacher does
	    not manage: the negative control for the per-student review gate. */
	let otherTeacher: SeededUser;
	let cruz: SeededUser;
	let section: string;
	let otherSection: string;

	/** The three shapes. */
	let ported: string;
	let specBacked: string;
	let both: string;
	let otherItem: string;

	async function rpc<T = Record<string, unknown>>(
		user: SeededUser,
		call: string,
		params: unknown[] = []
	): Promise<T> {
		return db.asUser(user.id, async (q) => {
			const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
			return rows[0].result;
		});
	}

	/** The message an RPC RAISED, or null when it returned instead. */
	async function raised(
		user: SeededUser,
		call: string,
		params: unknown[] = []
	): Promise<string | null> {
		try {
			await rpc(user, call, params);
			return null;
		} catch (e) {
			return (e as Error).message;
		}
	}

	/** The stored row, read with a plain select as the connection owner: the
	    question here is what the COLUMN holds, not what a policy shows. */
	async function row(
		itemId: string,
		email: string
	): Promise<StoredRow | null> {
		const { rows } = await db.sql<StoredRow>(
			'select state, submitted_at, graded_at from public.classroom_submissions where item_id = $1 and student_email = $2',
			[itemId, email]
		);
		return rows[0] ?? null;
	}

	/** A student writing an answer, through the real write gate. */
	async function save(
		student: SeededUser,
		itemId: string,
		text: string
	): Promise<Record<string, unknown>> {
		return rpc(student, `public.classroom_save_response($1::uuid, 'm1-setup', $2::jsonb)`, [
			itemId,
			JSON.stringify({ text })
		]);
	}

	async function createAssignment(title: string, as: SeededUser, into: string): Promise<string> {
		const r = await rpc<{ item_id: string }>(
			as,
			`public.classroom_create_item(
				p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2,
				p_body => $3, p_points => 4, p_published => true)`,
			[[into], title, `${title} body.`]
		);
		return r.item_id;
	}

	beforeAll(async () => {
		db = await startTestDb(CHAIN);
		admin = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
		teacher = await createUser(db, 'reyes@boscotech.edu', 'A. Reyes');
		otherTeacher = await createUser(db, 'oyelaran@boscotech.edu', 'T. Oyelaran');
		ana = await createUser(db, 'ana.perez@boscotech.net', 'Ana Perez');
		ben = await createUser(db, 'ben.ortiz@boscotech.net', 'Ben Ortiz');
		cruz = await createUser(db, 'cruz.diaz@boscotech.net', 'Cruz Diaz');
		await db.sql(
			'insert into public.app_admins (email, granted_by) values ($1, $1) on conflict do nothing',
			[admin.email]
		);
		section = await createClassroomSection(db, {
			as: admin,
			courseCode: 'IDEA100',
			courseTitle: 'Introduction to Engineering',
			label: 'Period 3',
			teacherEmail: teacher.email
		});
		otherSection = await createClassroomSection(db, {
			as: admin,
			courseCode: 'IDEA209H',
			courseTitle: 'Engineering I Honors',
			label: 'Period 5',
			teacherEmail: otherTeacher.email
		});
		for (const s of [ana, ben]) {
			await enrollStudent(db, {
				as: teacher,
				sectionId: section,
				email: s.email,
				displayName: s.email
			});
		}
		await enrollStudent(db, {
			as: otherTeacher,
			sectionId: otherSection,
			email: cruz.email,
			displayName: cruz.email
		});

		ported = await createAssignment('Ported', teacher, section);
		specBacked = await createAssignment('Spec backed', teacher, section);
		both = await createAssignment('Both', teacher, section);
		otherItem = await createAssignment('Somebody else class', otherTeacher, otherSection);

		const html = documentFor(manifest());
		for (const id of [ported, both]) {
			await rpc(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [
				id,
				html,
				JSON.stringify(manifest()),
				'bench-setup.html'
			]);
		}
		for (const [id, as] of [
			[specBacked, teacher],
			[both, teacher],
			[otherItem, otherTeacher]
		] as const) {
			await rpc(as, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
				id,
				JSON.stringify(companionSpec())
			]);
		}
	});

	afterAll(async () => {
		await db?.stop();
	});

	// -----------------------------------------------------------------------
	describe('the hole 0198 fills, measured rather than asserted about', () => {
		it('has no other path by which an instructor can set submitted', async () => {
			const viaRpc = await raised(teacher, 'public.classroom_submit_assignment($1::uuid)', [
				specBacked
			]);
			say(`teacher -> classroom_submit_assignment: ${viaRpc}`);
			expect(viaRpc).toMatch(/student enrolled/i);

			const direct = await db.asUser(teacher.id, async (q) => {
				try {
					await q(`update public.classroom_submissions set state = 'submitted' where item_id = $1`, [
						specBacked
					]);
					return 'UPDATE SUCCEEDED';
				} catch (e) {
					return (e as Error).message;
				}
			});
			say(`teacher -> direct UPDATE: ${direct}`);
			expect(direct).toMatch(/permission denied/i);

			// THE CENSUS, from the catalog rather than from a grep of the tree:
			// exactly one function other than 0198's own writes the literal
			// 'submitted' against this table, and it is the student's own submit.
			// The predicate is the WRITE form. `state = 'submitted'` alone matches
			// every function that merely READS the state to refuse on it -- seven
			// of them -- which would make this assertion about nothing. `set state
			// = 'submitted'` is the assignment, and an `insert ... values` form is
			// asserted beside it so a writer that only ever inserts cannot hide.
			const { rows } = await db.sql<{ proname: string }>(
				`select p.proname
				 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public'
				   and p.prosrc like '%classroom_submissions%'
				   and (p.prosrc like '%set state = ''submitted''%'
				        or p.prosrc like '%, ''submitted'', %')
				 order by p.proname`
			);
			const names = rows.map((r) => r.proname);
			say(`functions WRITING state = 'submitted': ${names.join(', ')}`);
			expect(names).toEqual(['classroom_close_assignment', 'classroom_submit_assignment']);

			// THE POSITIVE CONTROL FOR THE PREDICATE ITSELF: the same query with
			// the read form matches strictly more, so a census that came back with
			// two cannot have come back with two because it matched nothing.
			const { rows: readers } = await db.sql<{ n: string }>(
				`select count(*)::text as n
				 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public'
				   and p.prosrc like '%classroom_submissions%'
				   and p.prosrc like '%state = ''submitted''%'`
			);
			say(`(functions merely READING that state: ${readers[0].n})`);
			expect(Number(readers[0].n)).toBeGreaterThan(names.length);
		});
	});

	// -----------------------------------------------------------------------
	describe('all three item shapes', () => {
		const shapes = () => [
			{ name: 'ported (manifest, no spec)', id: ported },
			{ name: 'spec backed (spec, no manifest)', id: specBacked },
			{ name: 'both (manifest wins)', id: both }
		];

		it('accepts work before the close, on every shape', async () => {
			for (const s of shapes()) {
				const res = await save(ana, s.id, 'The vise was square to the table.');
				say(`${s.name}: save before close -> ${JSON.stringify(res)}`);
				expect(res).toEqual({ ok: true });
			}
		});

		it('closes for one named student and refuses the write, on every shape', async () => {
			for (const s of shapes()) {
				const res = await rpc<{
					ok: boolean;
					total: number;
					changed: number;
					results: { student_email: string; ok: boolean; state?: string }[];
				}>(teacher, 'public.classroom_close_assignment($1::uuid, $2)', [s.id, ana.email]);
				say(
					`${s.name}: close(ana) -> ok=${res.ok} total=${res.total} changed=${res.changed} ` +
						`results=${JSON.stringify(res.results)}`
				);
				expect(res.ok).toBe(true);
				expect(res.total).toBe(1);
				expect(res.changed).toBe(1);

				const stored = await row(s.id, ana.email);
				say(`${s.name}: stored row -> ${JSON.stringify(stored)}`);
				expect(stored?.state).toBe('submitted');
				// THE DISCRIMINATOR. A close that stamped this would be
				// indistinguishable from a hand-in and would hand the student back
				// the unsubmit the guard exists to take away.
				expect(stored?.submitted_at).toBeNull();

				const after = await save(ana, s.id, 'Trying to keep writing.');
				say(`${s.name}: save after close -> ${JSON.stringify(after)}`);
				expect(after).toEqual({ ok: false, reason: 'locked' });
			}
		});

		it('reopens, and the write lands again, on every shape', async () => {
			for (const s of shapes()) {
				const res = await rpc<{ ok: boolean; changed: number }>(
					teacher,
					'public.classroom_close_assignment($1::uuid, $2, false)',
					[s.id, ana.email]
				);
				say(`${s.name}: reopen(ana) -> ok=${res.ok} changed=${res.changed}`);
				expect(res.changed).toBe(1);
				expect((await row(s.id, ana.email))?.state).toBe('draft');

				const after = await save(ana, s.id, 'Back to work on the vise.');
				say(`${s.name}: save after reopen -> ${JSON.stringify(after)}`);
				expect(after).toEqual({ ok: true });
			}
		});
	});

	// -----------------------------------------------------------------------
	describe('the whole class at once', () => {
		it('closes every student on the item, including one who never started', async () => {
			// BEN HAS NEVER OPENED IT. He is the case the close exists for and the
			// one a submission-row-driven implementation would silently miss: with
			// no row at all, `classroom_save_response` reads no state and accepts.
			expect(await row(ported, ben.email)).toBeNull();
			const before = await save(ben, ported, 'Starting late.');
			expect(before).toEqual({ ok: true });

			const res = await rpc<{
				ok: boolean;
				total: number;
				changed: number;
				refused: number;
				results: { student_email: string }[];
			}>(teacher, 'public.classroom_close_assignment($1::uuid)', [ported]);
			say(
				`close(all) -> ok=${res.ok} total=${res.total} changed=${res.changed} refused=${res.refused}`
			);

			// THE ROSTER COMES FROM THE ROSTER. The expected count is read off
			// `classroom_enrollments`, not off what the function reported.
			const { rows: roster } = await db.sql<{ n: string }>(
				`select count(distinct e.student_email)::text as n
				 from public.classroom_postings pg
				 join public.classroom_enrollments e on e.section_id = pg.section_id
				 where pg.item_id = $1`,
				[ported]
			);
			say(`roster says ${roster[0].n} student(s) on that item`);
			expect(res.total).toBe(Number(roster[0].n));
			expect(res.refused).toBe(0);
			expect(res.results.map((r) => r.student_email).sort()).toEqual(
				[ana.email, ben.email].sort()
			);

			for (const s of [ana, ben]) {
				expect((await row(ported, s.email))?.state).toBe('submitted');
				expect(await save(s, ported, 'One more line.')).toEqual({ ok: false, reason: 'locked' });
			}
		});

		it('leaves a student who genuinely handed in exactly as they were', async () => {
			// Ana turns the SPEC-BACKED item in herself, which stamps submitted_at.
			await rpc(teacher, 'public.classroom_close_assignment($1::uuid, $2, false)', [
				specBacked,
				ana.email
			]);
			await save(ana, specBacked, 'A full sentence about the vise.');
			const submit = await rpc<{ ok: boolean }>(ana, 'public.classroom_submit_assignment($1::uuid)', [
				specBacked
			]);
			expect(submit.ok).toBe(true);
			const handed = await row(specBacked, ana.email);
			say(`ana handed in: ${JSON.stringify(handed)}`);
			expect(handed?.submitted_at).not.toBeNull();

			const res = await rpc<{ results: { student_email: string; changed: boolean }[] }>(
				teacher,
				'public.classroom_close_assignment($1::uuid)',
				[specBacked]
			);
			const anaRow = res.results.find((r) => r.student_email === ana.email);
			say(`close(all) over a real hand-in -> ${JSON.stringify(anaRow)}`);
			expect(anaRow?.changed).toBe(false);

			const still = await row(specBacked, ana.email);
			// The stamp SURVIVES, which is what keeps her hand-in hers. Compared by
			// INSTANT: pg hands back a `Date`, so identity would fail on two
			// objects holding the same moment.
			expect(Number(new Date(still!.submitted_at!))).toBe(
				Number(new Date(handed!.submitted_at!))
			);
		});
	});

	// -----------------------------------------------------------------------
	describe('a student cannot undo it', () => {
		it('refuses unsubmit on a closed row, with a positive control on the same student', async () => {
			// THE POSITIVE CONTROL FIRST, so "unsubmit refused" cannot pass because
			// unsubmit is simply broken. Ana's hand-in on `specBacked` is real and
			// ungraded, so she may take it back.
			const control = await rpc<{ ok: boolean; state?: string; reason?: string }>(
				ana,
				'public.classroom_unsubmit_assignment($1::uuid)',
				[specBacked]
			);
			say(`CONTROL -- ana unsubmits her own hand-in: ${JSON.stringify(control)}`);
			expect(control).toEqual({ ok: true, state: 'draft' });

			// And now the close, on the same student, on the ported item.
			expect((await row(ported, ana.email))?.state).toBe('submitted');
			expect((await row(ported, ana.email))?.submitted_at).toBeNull();
			const refused = await rpc<{ ok: boolean; reason?: string }>(
				ana,
				'public.classroom_unsubmit_assignment($1::uuid)',
				[ported]
			);
			say(`ana tries to unsubmit a CLOSE: ${JSON.stringify(refused)}`);
			expect(refused).toEqual({ ok: false, reason: 'closed' });
			// And it really is still shut.
			expect((await row(ported, ana.email))?.state).toBe('submitted');
			expect(await save(ana, ported, 'Sneaking one in.')).toEqual({ ok: false, reason: 'locked' });
		});
	});

	// -----------------------------------------------------------------------
	describe('grading never locks anybody out, which is the half that needed no code', () => {
		// EVERY TEST BELOW SETS ITS OWN PRECONDITION. The describes above leave
		// Ana closed on `ported`, and a test that read whatever the last one
		// happened to leave would be asserting about an accident.
		beforeAll(async () => {
			await rpc(teacher, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
				ported,
				JSON.stringify([
					{
						id: 'm1-c',
						criterion: 'The setup is recorded',
						points: 4,
						levels: [
							{ points: 4, label: 'Complete', short: 'Recorded', descriptor: 'States what was done.' },
							{ points: 2, label: 'Developing', short: 'Partial', descriptor: 'States some of it.' },
							{ points: 0, label: 'Absent', short: 'None', descriptor: 'Not attempted.' }
						]
					}
				])
			]);
		});

		async function grade(email: string, points: number, release: boolean): Promise<string> {
			const res = await rpc<{ state: string }>(
				teacher,
				`public.classroom_grade_submission($1::uuid, $2, $3::jsonb, null, $4, '{}'::jsonb)`,
				[ported, email, JSON.stringify({ 'm1-c': points }), release]
			);
			return res.state;
		}

		it('writes returned on release and draft otherwise, and the student can keep working', async () => {
			await rpc(teacher, 'public.classroom_close_assignment($1::uuid, $2, false)', [
				ported,
				ana.email
			]);
			expect((await row(ported, ana.email))?.state).toBe('draft');

			say(`grade(release=false) -> state ${await grade(ana.email, 2, false)}`);
			expect((await row(ported, ana.email))?.state).toBe('draft');

			const released = await grade(ana.email, 4, true);
			say(`grade(release=true)  -> state ${released}`);
			expect(released).toBe('returned');

			// 0086's own definition of 'returned': graded and released, editable
			// again. A grade has never locked anybody out and 0198 must not start.
			const after = await save(ana, ported, 'Fixing what the comment said.');
			say(`save after a returned grade -> ${JSON.stringify(after)}`);
			expect(after).toEqual({ ok: true });
		});

		it('does NOT re-open a closed student on a draft grade, and DOES on a release', async () => {
			// THE INTERACTION BETWEEN THE TWO DECISIONS, STATED RATHER THAN LEFT TO
			// BE DISCOVERED. Both are Mr. Pina's, both of 2026-09-10, and they meet
			// on exactly this cell: a release writes 'returned', which is by
			// definition editable again, so it re-opens a student the instructor
			// had closed. That is why the console says grade first, then close.
			await rpc(teacher, 'public.classroom_close_assignment($1::uuid, $2)', [ported, ana.email]);
			expect((await row(ported, ana.email))?.state).toBe('submitted');

			// A DRAFT grade leaves the close alone, which is what makes "grade the
			// whole class as drafts, then release" a workflow that does not
			// repeatedly unlock people.
			say(`draft-grading a CLOSED student -> ${await grade(ana.email, 2, false)}`);
			expect((await row(ported, ana.email))?.state).toBe('submitted');
			expect(await save(ana, ported, 'Still shut.')).toEqual({ ok: false, reason: 'locked' });

			// A RELEASE re-opens.
			say(`releasing a CLOSED student   -> ${await grade(ana.email, 4, true)}`);
			expect((await row(ported, ana.email))?.state).toBe('returned');
			expect(await save(ana, ported, 'Working again after the return.')).toEqual({ ok: true });
		});
	});

	// -----------------------------------------------------------------------
	describe('the gate is per student and is the grading gate', () => {
		it('refuses a student the caller may not review, and reports rather than skipping', async () => {
			const before = (await row(ported, ana.email))?.state ?? 'none';
			const res = await rpc<{
				ok: boolean;
				total: number;
				changed: number;
				refused: number;
				results: { student_email: string; ok: boolean; reason?: string }[];
			}>(otherTeacher, 'public.classroom_close_assignment($1::uuid, $2)', [ported, ana.email]);
			say(`another section teacher closes ana on OUR item: ${JSON.stringify(res)}`);
			expect(res.refused).toBe(1);
			expect(res.changed).toBe(0);
			expect(res.results[0]).toMatchObject({ ok: false, reason: 'not_yours' });

			// A STUDENT CANNOT CALL IT AT ALL, which is the same gate seen from the
			// other side rather than a second rule.
			const asStudent = await rpc<{ total: number; refused: number }>(
				ana,
				'public.classroom_close_assignment($1::uuid, $2)',
				[ported, ana.email]
			);
			say(`ana closes her own work: ${JSON.stringify(asStudent)}`);
			expect(asStudent.refused).toBe(1);
			// NOTHING MOVED. Read back rather than assumed, and against the state
			// this test found rather than one an earlier test happened to leave.
			expect((await row(ported, ana.email))?.state).toBe(before);
		});

		it('answers not_enrolled for an address that is on no roster for the item', async () => {
			const res = await rpc<{ ok: boolean; reason: string }>(
				teacher,
				'public.classroom_close_assignment($1::uuid, $2)',
				[ported, 'nobody@boscotech.net']
			);
			say(`close a non-enrolled address: ${JSON.stringify(res)}`);
			expect(res).toMatchObject({ ok: false, reason: 'not_enrolled' });
		});
	});

	// -----------------------------------------------------------------------
	describe('the client mirror answers the stored rows', () => {
		it('reads closed, turned-in and open off real rows rather than off fixtures', async () => {
			// BOTH PRECONDITIONS SET HERE. Ben is closed and Ana is re-opened, so
			// the two rows this reads are the two states it names.
			await rpc(teacher, 'public.classroom_close_assignment($1::uuid, $2)', [ported, ben.email]);
			await rpc(teacher, 'public.classroom_close_assignment($1::uuid, $2, false)', [
				ported,
				ana.email
			]);
			const closed = await row(ported, ben.email);
			const returned = await row(ported, ana.email);
			const { rows: handedRows } = await db.sql<StoredRow>(
				`select state, submitted_at, graded_at from public.classroom_submissions
				 where state = 'submitted' and submitted_at is not null limit 1`
			);

			say(`closed row  -> ${assignmentLockState(closed)}`);
			say(`open row    -> ${assignmentLockState(returned)}`);
			expect(assignmentLockState(closed)).toBe('closed');
			expect(assignmentAcceptsWork(closed)).toBe(false);
			expect(assignmentLockNotice(closed)).toBe(ASSIGNMENT_LOCK_NOTICE.closed);

			expect(assignmentLockState(returned)).toBe('open');
			expect(assignmentAcceptsWork(returned)).toBe(true);
			expect(assignmentLockNotice(returned)).toBeNull();

			// A student with no row at all is open, which is what the write gate
			// already does with one.
			expect(assignmentLockState(null)).toBe('open');
			expect(assignmentAcceptsWork(null)).toBe(true);

			if (handedRows.length) {
				say(`a genuine hand-in -> ${assignmentLockState(handedRows[0])}`);
				expect(assignmentLockState(handedRows[0])).toBe('turned-in');
			}
		});
	});
	// -----------------------------------------------------------------------
	// THIS DESCRIBE RUNS LAST, and it has to. The second test puts the pre-0198
	// function back and manufactures a row the guard refuses, which is a
	// database state nothing after it should inherit.
	describe('the file itself', () => {
		it('re-applies over a database that already carries its own closes', async () => {
			// RE-PASTING A MIGRATION IS ORDINARY, and this one narrows an existing
			// function, so a second apply has to be able to tell a first from a
			// second. Closed rows exist on this database by now, which is exactly
			// the state a naive stored-row count would refuse to re-apply over.
			const { rows: before } = await db.sql<{ n: string }>(
				`select count(*)::text as n from public.classroom_submissions
				 where state = 'submitted' and submitted_at is null`
			);
			say(`re-apply: ${before[0].n} instructor-closed row(s) already stored`);
			expect(Number(before[0].n)).toBeGreaterThan(0);

			const sql = readFileSync(
				join(process.cwd(), 'supabase/migrations/0198_classroom_close_assignment.sql'),
				'utf8'
			);
			await db.sql(sql);
			say('re-apply: applied a second time with no error');

			// And it still works afterwards.
			const res = await rpc<{ ok: boolean }>(
				teacher,
				'public.classroom_close_assignment($1::uuid, $2)',
				[ported, ben.email]
			);
			expect(res.ok).toBe(true);
		});

		it('RAISES when a stored row would change answer -- the self-check, proved by breaking it', async () => {
			// THE NEGATIVE CONTROL. The guard above is the one assertion in this
			// file that has never fired, and a check that has never failed has not
			// been tested. So: put the pre-0198 function back, manufacture exactly
			// the row the guard is about, and apply the file over it.
			const engine = readFileSync(
				join(process.cwd(), 'supabase/migrations/0086_classroom_assignment_engine.sql'),
				'utf8'
			);
			const start = engine.indexOf(
				'create or replace function public.classroom_unsubmit_assignment(p_item_id uuid)'
			);
			const end = engine.indexOf(
				'grant execute on function public.classroom_unsubmit_assignment(uuid) to authenticated;',
				start
			);
			expect(start).toBeGreaterThan(0);
			const original = engine.slice(start, end);
			expect(original).not.toContain("'closed'");
			await db.sql(original);

			// A row in 'submitted' with no stamp and no grade: unreachable through
			// any RPC, written here directly because the point is a database that
			// somehow holds one.
			await db.sql(
				`update public.classroom_submissions
				 set state = 'submitted', submitted_at = null, graded_at = null
				 where item_id = $1 and student_email = $2`,
				[both, ben.email]
			);
			await db.sql(
				`insert into public.classroom_submissions (item_id, student_email, state)
				 values ($1, $2, 'submitted')
				 on conflict (item_id, student_email) do update set state = 'submitted', submitted_at = null, graded_at = null`,
				[both, ben.email]
			);

			const sql = readFileSync(
				join(process.cwd(), 'supabase/migrations/0198_classroom_close_assignment.sql'),
				'utf8'
			);
			let message: string | null = null;
			try {
				await db.sql(sql);
			} catch (e) {
				message = (e as Error).message;
			}
			say(`self-check over a stranded row: ${message}`);
			expect(message).toMatch(/submission row\(s\) are already in state/);
			expect(message).toMatch(/submitted_at/);

			// AND IT ROLLED BACK NOTHING IT SHOULD HAVE KEPT: the raise happens in
			// section 1, before either function is written, so the pre-0198 body is
			// still what is deployed and nothing is half applied. Restore the
			// file's end state so the database this file leaves behind is the one
			// it claims to be testing -- which needs EVERY stranded row stamped,
			// not just the one manufactured here: with the pre-0198 body back in
			// place the count is a first-apply count again, and the closes the
			// tests above placed are stranded rows by that definition too.
			await db.sql(
				`update public.classroom_submissions set submitted_at = now()
				 where state = 'submitted' and submitted_at is null`
			);
			await db.sql(sql);
			const { rows: guarded } = await db.sql<{ has: boolean }>(
				`select position('''reason'', ''closed''' in p.prosrc) > 0 as has
				 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname = 'classroom_unsubmit_assignment'`
			);
			say(`restored: guard present again = ${guarded[0].has}`);
			expect(guarded[0].has).toBe(true);
		});
	});
});
