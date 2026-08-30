// tests/notebook-section-reviewer-tier.test.ts
//
// 0169: the notebook SECTION REVIEWER tier. A section-scoped allowlist
// (notebook_section_reviewers, keyed (section_id, email)) grants reading and
// reviewing ONE section's notebooks -- the grid, submitted entries with their
// notes, the four verdicts, the per-student read, excusal READS -- and
// deliberately nothing else: no check-in management, no staff deletion, no
// excusal writes, no classroom surface of any kind.
//
// WHAT THIS FILE PROVES, and how each proof avoids its own trap:
//
//   * TRANSCRIPTION FIDELITY. 0169 recreates seven functions and two policies
//     from their latest applied definitions with one predicate call swapped
//     (plus, where the refusal sentence names the tiers, that sentence
//     extended). The expected value is computed MECHANICALLY: prosrc/polqual
//     captured from the database BEFORE 0169 is applied, the one substitution
//     applied in this file, and the result compared byte-for-byte against
//     what 0169 actually installed. The oracle is the pre-migration database
//     plus a spelled-out diff -- never the migration's own output.
//
//   * PRE-MIGRATION DATA. Everything is seeded through the REAL pre-0169
//     RPCs before 0169 is applied, and 0169 is applied TWICE (a re-paste is
//     ordinary and must be safe).
//
//   * BOTH DIRECTIONS ON EVERY GATE. Each denial is paired with the same call
//     succeeding for a caller who holds the capability, so a sweep that reads
//     the wrong property cannot come back green.
//
//   * MUTATION TOWARD THE DEFECT, at the end of the file because mutants
//     poison the database they run in. Each mutant opens ONE layer in the
//     PERMISSIVE direction (`select true`, `using (true)`) and the denial
//     assertion is re-run and must FLIP -- proving it depends on exactly that
//     layer. Restore is by re-applying the 0169 file text from a copy read
//     ONCE before any mutation (never `git checkout --`, which discards
//     uncommitted work and restores from HEAD, not from what was tested);
//     the copy's md5 is compared against the on-disk file after every
//     restore, and the denial is re-asserted green.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';

/** The chain the live project carries, through the sweep. */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0069_notebook.sql',
	'0070_coin_economy.sql',
	'0071_notebook_optional_label.sql',
	'0075_notebook_optional_photo.sql',
	'0078_notebook_entry_notes.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0088_notebook_folders.sql',
	'0091_notebook_pin_and_activity.sql',
	'0094_notebook_classroom_sections.sql',
	'0098_notebook_session_postings.sql',
	'0099_notebook_view_as.sql',
	'0106_notebook_instructor_student_access.sql',
	'0114_notebook_note_entry_session.sql',
	'0116_notebook_soft_delete.sql',
	'0117_notebook_soft_delete_restore.sql',
	'0118_notebook_draft_state.sql',
	'0119_notebook_note_delete.sql',
	'0121_notebook_review_acknowledged.sql',
	// LAST in the chain, the sweep. 0140 and 0169 are applied by hand AFTER it
	// below, exactly as on the real project, and both revoke for themselves.
	'0137_anon_execute_sweep.sql'
] as const;

const migration = (name: string): string =>
	readFileSync(
		fileURLToPath(new URL(`../supabase/migrations/${name}`, import.meta.url)),
		'utf8'
	);

const MIGRATION_0169 = migration('0169_notebook_section_reviewer_tier.sql');
const MIGRATION_0169_MD5 = createHash('md5').update(MIGRATION_0169).digest('hex');

/** The seven functions 0169 recreates, and the one swap each carries. */
const FUNCTION_SWAPS: Record<string, [string, string][]> = {
	notebook_get_section_grid: [
		[
			'public.classroom_manages_section(p_section_id)',
			'public.notebook_reviews_section(p_section_id)'
		],
		[
			'Only the section instructor or a site admin can view the notebook grid.',
			'Only the section instructor, a section reviewer, or a site admin can view the notebook grid.'
		]
	],
	notebook_flag_entry: [
		['public.classroom_manages_section(v_section)', 'public.notebook_reviews_section(v_section)'],
		[
			'Only the section instructor or a site admin can flag notebook entries.',
			'Only the section instructor, a section reviewer, or a site admin can flag notebook entries.'
		]
	],
	notebook_resolve_entry: [
		['public.classroom_manages_section(v_section)', 'public.notebook_reviews_section(v_section)'],
		[
			'Only the section instructor or a site admin can resolve notebook entries.',
			'Only the section instructor, a section reviewer, or a site admin can resolve notebook entries.'
		]
	],
	notebook_accept_entry: [
		[
			'public.classroom_manages_section(v_entry.section_id)',
			'public.notebook_reviews_section(v_entry.section_id)'
		],
		[
			'Only the section instructor or a site admin can review notebook entries.',
			'Only the section instructor, a section reviewer, or a site admin can review notebook entries.'
		]
	],
	notebook_unaccept_entry: [
		[
			'public.classroom_manages_section(v_entry.section_id)',
			'public.notebook_reviews_section(v_entry.section_id)'
		],
		[
			'Only the section instructor or a site admin can review notebook entries.',
			'Only the section instructor, a section reviewer, or a site admin can review notebook entries.'
		]
	],
	notebook_can_read_entry: [
		[
			'public.classroom_manages_section(e.section_id)',
			'public.notebook_reviews_section(e.section_id)'
		]
	],
	notebook_review_student_notebook: [
		[
			'public._notebook_manages_student_email(v_email)',
			'public._notebook_reviews_student_email(v_email)'
		],
		[
			"Only an instructor of one of this student''s classes, or a site admin, can open their notebook.",
			"Only an instructor or reviewer of one of this student''s classes, or a site admin, can open their notebook."
		]
	]
};

/** The notebook's own note document shape (0078). */
const doc = (text: string) => JSON.stringify([{ type: 'p', runs: [{ text }] }]);

let db: TestDb;

let owner: SeededUser; // the pinned admin (0067's admin_owner_email)
let teacherA: SeededUser; // teacher of record for P1
let teacherB: SeededUser; // teacher of record for P2 -- the other-section control
let coteacher: SeededUser; // reviewer of P1 ONLY (granted after 0169 applies)
let studentS: SeededUser; // enrolled in P1
let studentT: SeededUser; // enrolled in P2

let p1 = '';
let p2 = '';
let sessionP1 = '';
let entrySubmitted = ''; // S's turned-in entry in P1
let entryDraft = ''; // S's draft in P1 -- must stay invisible to ALL staff

/** prosrc/polqual captured BEFORE 0169 -- the transcription oracle's base. */
const beforeSrc: Record<string, string> = {};
const beforePolicy: Record<string, string> = {};
let preMigrationGridRefusal = '';

async function rpc<T>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
	const { rows } = await db.asUser(user.id, (q) =>
		q<{ result: T }>(`select ${call} as result`, params)
	);
	return rows[0].result;
}

/** Runs the call expecting a raise; returns the raised message. */
async function refusal(user: SeededUser, call: string, params: unknown[] = []): Promise<string> {
	try {
		await rpc(user, call, params);
	} catch (error) {
		return (error as Error).message;
	}
	throw new Error(`expected ${call} to be refused, and it was not`);
}

const grid = (as: SeededUser, section: string) =>
	rpc<{ students: unknown[]; cells: unknown[] }>(
		as,
		'public.notebook_get_section_grid($1, $2::integer)',
		[section, null]
	);

async function functionSource(name: string): Promise<string> {
	const { rows } = await db.sql<{ prosrc: string }>(
		`select p.prosrc from pg_proc p
		 join pg_namespace n on n.oid = p.pronamespace
		 where n.nspname = 'public' and p.proname = $1`,
		[name]
	);
	expect(rows.length).toBe(1);
	return rows[0].prosrc;
}

async function policyQual(polname: string): Promise<string> {
	const { rows } = await db.sql<{ qual: string }>(
		`select pg_get_expr(pol.polqual, pol.polrelid) as qual
		 from pg_policy pol where pol.polname = $1`,
		[polname]
	);
	expect(rows.length).toBe(1);
	return rows[0].qual;
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	await db.sql(migration('0140_notebook_scheduled_check_ins.sql'));

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacherA = await createUser(db, 'alba.record@boscotech.edu', 'Alba Record');
	teacherB = await createUser(db, 'bruno.other@boscotech.edu', 'Bruno Other');
	coteacher = await createUser(db, 'cesar.co@boscotech.edu', 'Cesar Co');
	studentS = await createUser(db, 'sofia@boscotech.net', 'Sofia Reyes');
	studentT = await createUser(db, 'tomas@boscotech.net', 'Tomas Vega');

	p1 = await createClassroomSection(db, {
		as: owner,
		courseCode: 'IDEA209H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 1',
		teacherEmail: teacherA.email
	});
	p2 = await createClassroomSection(db, {
		as: owner,
		courseCode: 'IDEA209H',
		label: 'Period 2',
		teacherEmail: teacherB.email
	});
	await enrollStudent(db, { as: teacherA, sectionId: p1, email: studentS.email, displayName: 'Sofia' });
	await enrollStudent(db, { as: teacherB, sectionId: p2, email: studentT.email, displayName: 'Tomas' });

	// EVERYTHING BELOW IS SEEDED THROUGH THE REAL PRE-0169 RPCS, BEFORE 0169
	// APPLIES: a check-in, a turned-in entry with a note, a draft, an excusal.
	const { rows: days } = await db.sql<{ past: string }>(
		`select ((now() at time zone 'America/Los_Angeles')::date - 1)::text as past`
	);
	sessionP1 = (
		await rpc<{ session_id: string }>(
			teacherA,
			'public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4)',
			[[p1], 3, days[0].past, 'Bearing teardown']
		)
	).session_id;

	entrySubmitted = (
		await rpc<{ entry_id: string }>(
			studentS,
			'public.notebook_create_entry($1, $2, $3, $4, null, null, null, true)',
			[studentS.id, 'drive-submitted', sessionP1, p1]
		)
	).entry_id;
	await rpc(studentS, 'public.notebook_add_note($1, $2::jsonb)', [
		entrySubmitted,
		doc('Torque spec measured at 12 Nm.')
	]);
	entryDraft = (
		await rpc<{ entry_id: string }>(
			studentS,
			'public.notebook_create_entry($1, $2, $3, $4, null, null, null, false)',
			[studentS.id, 'drive-draft', sessionP1, p1]
		)
	).entry_id;
	// The excusal is on the P1 STUDENT: an excusal makes its holder a grid row
	// (0118's holders branch), so excusing an outsider would widen the roster.
	await rpc(owner, 'public.notebook_admin_set_excusal($1, $2, true, $3)', [
		sessionP1,
		studentS.id,
		'family travel'
	]);

	// THE PRE-MIGRATION WORLD, on record: the co-teacher is refused the grid.
	preMigrationGridRefusal = await refusal(
		coteacher,
		'public.notebook_get_section_grid($1, $2::integer)',
		[p1, null]
	);

	// The transcription oracle's base: what the database holds BEFORE 0169.
	for (const name of Object.keys(FUNCTION_SWAPS)) {
		beforeSrc[name] = await functionSource(name);
	}
	beforePolicy['section staff read notebook entries'] = await policyQual(
		'section staff read notebook entries'
	);
	beforePolicy['notebook excusals visible to subject and staff'] = await policyQual(
		'notebook excusals visible to subject and staff'
	);

	await db.sql(MIGRATION_0169);
	// Re-pasting a migration is ordinary. The second apply must succeed whole,
	// self-check included, over a database that already carries it.
	await db.sql(MIGRATION_0169);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

describe('the world before 0169', () => {
	it('refused the co-teacher the grid, which is the defect the tier exists to end', () => {
		expect(preMigrationGridRefusal).toContain('Only the section instructor');
	});
});

describe('transcription fidelity: seven functions, two policies, one swap each', () => {
	it('every recreated function is its pre-0169 source with exactly the stated substitutions', async () => {
		for (const [name, swaps] of Object.entries(FUNCTION_SWAPS)) {
			let expected = beforeSrc[name];
			for (const [from, to] of swaps) {
				// prosrc is the raw dollar-quoted body, so the doubled quote in the
				// 0106 sentence appears exactly as written in the migration file.
				expect(expected.split(from).length, `${name}: ${from}`).toBe(2);
				expected = expected.replace(from, to);
			}
			expect(await functionSource(name), name).toBe(expected);
		}
	});

	it('both policies swapped the manage call and kept everything else', async () => {
		const entries = await policyQual('section staff read notebook entries');
		expect(entries).toBe(
			beforePolicy['section staff read notebook entries'].replace(
				'classroom_manages_section(section_id)',
				'notebook_reviews_section(section_id)'
			)
		);
		// The draft boundary and the manages-student arm survived the swap.
		expect(entries).toContain('submitted_at IS NOT NULL');
		expect(entries).toContain('notebook_manages_student');

		const excusals = await policyQual('notebook excusals visible to subject and staff');
		expect(excusals).toBe(
			beforePolicy['notebook excusals visible to subject and staff'].replace(
				'classroom_manages_section(pg.section_id)',
				'notebook_reviews_section(pg.section_id)'
			)
		);
	});
});

describe('the ACL, read from the catalog rather than from the self-check', () => {
	it('the predicate is authenticated-only; the student helper is granted to nobody', async () => {
		const { rows } = await db.sql<{ fn: string; anon: boolean; auth: boolean }>(
			`select fn,
				has_function_privilege('anon', fn, 'execute') as anon,
				has_function_privilege('authenticated', fn, 'execute') as auth
			 from unnest(array[
				'public.notebook_reviews_section(uuid)',
				'public._notebook_reviews_student_email(text)',
				'public.notebook_reviewer_grant(uuid, text, text)',
				'public.notebook_reviewer_revoke(uuid, text)',
				'public.notebook_reviewer_roster(uuid)',
				'public.notebook_reviewed_sections()'
			 ]) as fn`
		);
		const byFn = Object.fromEntries(rows.map((r) => [r.fn, r]));
		for (const r of rows) expect(r.anon, `${r.fn} anon`).toBe(false);
		expect(byFn['public.notebook_reviews_section(uuid)'].auth).toBe(true);
		expect(byFn['public._notebook_reviews_student_email(text)'].auth).toBe(false);
		expect(byFn['public.notebook_reviewed_sections()'].auth).toBe(true);
	});

	it('the roster table has no client write grant and no anon read', async () => {
		const { rows } = await db.sql<{ ins: boolean; upd: boolean; del: boolean; anonsel: boolean }>(
			`select has_table_privilege('authenticated', 'public.notebook_section_reviewers', 'insert') as ins,
				has_table_privilege('authenticated', 'public.notebook_section_reviewers', 'update') as upd,
				has_table_privilege('authenticated', 'public.notebook_section_reviewers', 'delete') as del,
				has_table_privilege('anon', 'public.notebook_section_reviewers', 'select') as anonsel`
		);
		expect(rows[0]).toEqual({ ins: false, upd: false, del: false, anonsel: false });
	});
});

describe('granting', () => {
	it('a non-admin cannot grant, and a teacher of record is a non-admin here', async () => {
		expect(
			await refusal(teacherA, 'public.notebook_reviewer_grant($1, $2)', [p1, coteacher.email])
		).toContain('Only site admins');
	});

	it('a student account and an outside address are refused whatever an admin asks', async () => {
		expect(
			await refusal(owner, 'public.notebook_reviewer_grant($1, $2)', [p1, 'kid@boscotech.net'])
		).toContain('@boscotech.edu');
		expect(
			await refusal(owner, 'public.notebook_reviewer_grant($1, $2)', [p1, 'x@gmail.com'])
		).toContain('@boscotech.edu');
	});

	it('a grant on a section that does not exist is refused', async () => {
		expect(
			await refusal(owner, 'public.notebook_reviewer_grant($1, $2)', [
				'00000000-0000-0000-0000-000000000000',
				coteacher.email
			])
		).toContain('section does not exist');
	});

	it('the admin grant lands, normalized, and the roster RPC answers admins only', async () => {
		const granted = await rpc<{ granted: boolean }>(
			owner,
			'public.notebook_reviewer_grant($1, $2, $3)',
			[p1, `  ${coteacher.email.toUpperCase()}  `, 'co-teacher of P1']
		);
		expect(granted.granted).toBe(true);
		const { rows } = await db.sql(
			`select email from public.notebook_section_reviewers where section_id = $1`,
			[p1]
		);
		expect(rows).toEqual([{ email: coteacher.email }]);

		const asAdmin = await db.asUser(owner.id, (q) =>
			q(`select * from public.notebook_reviewer_roster(null)`)
		);
		expect(asAdmin.rows.length).toBe(1);
		// A non-admin gets the empty set an empty roster gives, not an error.
		const asTeacher = await db.asUser(teacherA.id, (q) =>
			q(`select * from public.notebook_reviewer_roster(null)`)
		);
		expect(asTeacher.rows.length).toBe(0);
	});
});

describe('the widening: what a section reviewer can now do, and who still cannot', () => {
	it('notebook_reviews_section answers per section, per caller', async () => {
		expect(await rpc(coteacher, 'public.notebook_reviews_section($1)', [p1])).toBe(true);
		expect(await rpc(coteacher, 'public.notebook_reviews_section($1)', [p2])).toBe(false);
		expect(await rpc(teacherB, 'public.notebook_reviews_section($1)', [p1])).toBe(false);
		expect(await rpc(teacherA, 'public.notebook_reviews_section($1)', [p1])).toBe(true);
	});

	it('the grid opens for the reviewer of P1 and refuses everyone else, naming the tier', async () => {
		const g = await grid(coteacher, p1);
		expect(g.students.length).toBe(1);
		// Scoped: the SAME caller is refused the section next door.
		await expect(grid(coteacher, p2)).rejects.toThrow(/section reviewer/);
		// The other-section teacher is refused P1 -- the positive control on the
		// refusal is that the SAME account reads its own grid fine.
		const refusedB = await refusal(teacherB, 'public.notebook_get_section_grid($1, $2::integer)', [
			p1,
			null
		]);
		expect(refusedB).toContain('a section reviewer');
		expect((await grid(teacherB, p2)).students.length).toBe(1);
	});

	it('the reviewer reads the submitted entry and its note; the draft stays invisible to all staff', async () => {
		const asReviewer = await db.asUser(coteacher.id, (q) =>
			q(`select id from public.notebook_entries where section_id = $1`, [p1])
		);
		expect(asReviewer.rows.map((r) => r.id)).toEqual([entrySubmitted]);

		const notes = await db.asUser(coteacher.id, (q) =>
			q(`select id from public.notebook_entry_notes where entry_id = $1`, [entrySubmitted])
		);
		expect(notes.rows.length).toBe(1);

		// The draft EXISTS (its author reads it) -- the positive control that
		// makes the reviewer's zero mean "withheld", not "not there".
		const asAuthor = await db.asUser(studentS.id, (q) =>
			q(`select id from public.notebook_entries where id = $1`, [entryDraft])
		);
		expect(asAuthor.rows.length).toBe(1);

		// The other-section teacher reads nothing in P1.
		const asTeacherB = await db.asUser(teacherB.id, (q) =>
			q(`select id from public.notebook_entries where section_id = $1`, [p1])
		);
		expect(asTeacherB.rows.length).toBe(0);
	});

	it('all four verdicts work for the reviewer and refuse the other-section teacher', async () => {
		expect(
			await refusal(teacherB, 'public.notebook_flag_entry($1, $2, $3)', [
				entrySubmitted,
				'illegible',
				null
			])
		).toContain('a section reviewer');

		const flagged = await rpc<{ status: string }>(
			coteacher,
			'public.notebook_flag_entry($1, $2, $3)',
			[entrySubmitted, 'illegible', 'Please rescan page 2.']
		);
		expect(flagged.status).toBe('flagged');
		const resolved = await rpc<{ status: string }>(
			coteacher,
			'public.notebook_resolve_entry($1, $2)',
			[entrySubmitted, 'Rescan received.']
		);
		expect(resolved.status).toBe('compliant');
		const accepted = await rpc<{ reviewed_at: string | null }>(
			coteacher,
			'public.notebook_accept_entry($1)',
			[entrySubmitted]
		);
		expect(accepted.reviewed_at).not.toBeNull();
		const unaccepted = await rpc<{ reviewed_at: string | null }>(
			coteacher,
			'public.notebook_unaccept_entry($1)',
			[entrySubmitted]
		);
		expect(unaccepted.reviewed_at).toBeNull();
	});

	it('the per-student notebook opens only for students in a reviewed section', async () => {
		const payload = await rpc<{ entries: unknown[] }>(
			coteacher,
			'public.notebook_review_student_notebook($1)',
			[studentS.email]
		);
		expect(payload.entries.length).toBeGreaterThan(0);
		expect(
			await refusal(coteacher, 'public.notebook_review_student_notebook($1)', [studentT.email])
		).toContain('instructor or reviewer');
		expect(
			await refusal(teacherB, 'public.notebook_review_student_notebook($1)', [studentS.email])
		).toContain('instructor or reviewer');
	});

	it('excusal rows read for the reviewer and stay withheld from the other-section teacher', async () => {
		const asReviewer = await db.asUser(coteacher.id, (q) =>
			q(`select student_id from public.notebook_session_excusals where session_id = $1`, [
				sessionP1
			])
		);
		expect(asReviewer.rows.length).toBe(1);
		const asTeacherB = await db.asUser(teacherB.id, (q) =>
			q(`select student_id from public.notebook_session_excusals where session_id = $1`, [
				sessionP1
			])
		);
		expect(asTeacherB.rows.length).toBe(0);
	});

	it('notebook_reviewed_sections names the grant to its holder and nobody else', async () => {
		const mine = await db.asUser(coteacher.id, (q) =>
			q<{ section_id: string; label: string; course_code: string }>(
				`select section_id, label, course_code from public.notebook_reviewed_sections()`
			)
		);
		expect(mine.rows).toEqual([{ section_id: p1, label: 'Period 1', course_code: 'IDEA209H' }]);
		const theirs = await db.asUser(teacherB.id, (q) =>
			q(`select section_id from public.notebook_reviewed_sections()`)
		);
		expect(theirs.rows.length).toBe(0);
	});
});

describe('the census: what deliberately stays shut', () => {
	it('check-in management refuses the reviewer (the teacher of record seeded one above)', async () => {
		await expect(
			rpc(coteacher, 'public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4)', [
				[p1],
				3,
				'2026-01-15',
				'Reviewer-made check-in'
			])
		).rejects.toThrow(/teacher of record|instructor|admin|manage/i);
	});

	it('staff deletion refuses the reviewer and still works for the teacher of record', async () => {
		expect(
			await refusal(coteacher, 'public.notebook_staff_delete_entry($1)', [entrySubmitted])
		).toContain('not in a class you manage');
		// The same call, from the capability holder, on the same row.
		await rpc(teacherA, 'public.notebook_staff_delete_entry($1)', [entrySubmitted]);
		await rpc(teacherA, 'public.notebook_staff_restore_entry($1)', [entrySubmitted]);
	});

	it('excusal WRITES stay admin-only', async () => {
		expect(
			await refusal(coteacher, 'public.notebook_admin_set_excusal($1, $2, true, null)', [
				sessionP1,
				studentS.id
			])
		).toContain('Only a site admin');
	});

	it('no classroom reach: the shared manage predicate still answers false', async () => {
		expect(await rpc(coteacher, 'public.classroom_manages_section($1)', [p1])).toBe(false);
		expect(await rpc(teacherA, 'public.classroom_manages_section($1)', [p1])).toBe(true);
	});

	it('the manage-a-student rule did not widen, so staff deletion cannot follow the read', async () => {
		expect(await rpc(coteacher, 'public.notebook_manages_student($1)', [studentS.id])).toBe(false);
		expect(await rpc(teacherA, 'public.notebook_manages_student($1)', [studentS.id])).toBe(true);
	});

	it('no shut function picked up the reviewer predicate, with the open set as the positive control', async () => {
		const { rows: open } = await db.sql<{ n: string }>(
			`select count(*) as n from pg_proc p
			 join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public'
				and p.prosrc like '%notebook_reviews_section(%'
				and p.proname in ('notebook_get_section_grid', 'notebook_flag_entry',
					'notebook_resolve_entry', 'notebook_accept_entry', 'notebook_unaccept_entry',
					'notebook_can_read_entry')`
		);
		expect(Number(open[0].n)).toBe(6);
		const { rows: shut } = await db.sql<{ proname: string }>(
			`select p.proname from pg_proc p
			 join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public'
				and p.proname in ('notebook_admin_upsert_session', 'notebook_admin_delete_session',
					'notebook_add_session_postings', 'notebook_remove_session_posting',
					'notebook_set_session_guidance', '_notebook_manages_session',
					'notebook_link_unit_item', 'notebook_unlink_unit_item',
					'notebook_link_session_item', 'notebook_unlink_session_item',
					'notebook_staff_delete_entry', 'notebook_staff_delete_note',
					'notebook_staff_restore_entry', 'notebook_staff_restore_note',
					'notebook_admin_set_excusal', 'notebook_admin_override_entry',
					'_notebook_manages_student_email', 'notebook_manages_student',
					'_classroom_manages_section_email', 'classroom_manages_section')
				and (p.prosrc like '%notebook_reviews_section%'
					or p.prosrc like '%notebook_section_reviewers%')`
		);
		expect(shut).toEqual([]);
	});
});

describe('revocation', () => {
	it('a non-admin cannot revoke; an admin revoke closes every opened door', async () => {
		expect(
			await refusal(teacherA, 'public.notebook_reviewer_revoke($1, $2)', [p1, coteacher.email])
		).toContain('Only site admins');

		await rpc(owner, 'public.notebook_reviewer_revoke($1, $2)', [p1, coteacher.email]);
		await expect(grid(coteacher, p1)).rejects.toThrow(/section reviewer/);
		const entries = await db.asUser(coteacher.id, (q) =>
			q(`select id from public.notebook_entries where section_id = $1`, [p1])
		);
		expect(entries.rows.length).toBe(0);

		// Re-grant: the mutation proofs below run against a live grant.
		await rpc(owner, 'public.notebook_reviewer_grant($1, $2)', [p1, coteacher.email]);
		expect((await grid(coteacher, p1)).students.length).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// MUTATION PROOFS -- LAST, because each mutant opens a real hole in this
// database. Each one is the PERMISSIVE direction (the direction that
// reproduces the leak); the denial assertion above is re-run and must FLIP,
// then the layer is restored by re-applying the 0169 text captured at import
// time (never `git checkout --`), the on-disk file is md5-checked against
// that copy, and the denial is re-asserted.
// ---------------------------------------------------------------------------
describe('mutation proofs: every denial assertion is load-bearing', () => {
	const restore = async () => {
		await db.sql(MIGRATION_0169);
		const onDisk = createHash('md5')
			.update(migration('0169_notebook_section_reviewer_tier.sql'))
			.digest('hex');
		expect(onDisk).toBe(MIGRATION_0169_MD5);
	};

	it('opening notebook_reviews_section admits the other-section teacher, and the restore closes it', async () => {
		await db.sql(`create or replace function public.notebook_reviews_section(p_section_id uuid)
			returns boolean language sql stable security definer set search_path = ''
			as $$ select true $$;`);
		// The leak, reproduced: the exact call the suite asserts is refused.
		const leaked = await grid(teacherB, p1);
		expect(leaked.students.length).toBe(1);

		await restore();
		await expect(grid(teacherB, p1)).rejects.toThrow(/section reviewer/);
	});

	it('opening _notebook_reviews_student_email admits anyone to any notebook, and the restore closes it', async () => {
		await db.sql(`create or replace function public._notebook_reviews_student_email(p_email text)
			returns boolean language sql stable security definer set search_path = ''
			as $$ select true $$;`);
		const leaked = await rpc<{ entries: unknown[] }>(
			teacherB,
			'public.notebook_review_student_notebook($1)',
			[studentS.email]
		);
		expect(leaked.entries.length).toBeGreaterThan(0);

		await restore();
		expect(
			await refusal(teacherB, 'public.notebook_review_student_notebook($1)', [studentS.email])
		).toContain('instructor or reviewer');
	});

	it('a using(true) entries policy leaks the draft to staff, and the restore withholds it again', async () => {
		await db.sql(`drop policy if exists "section staff read notebook entries" on public.notebook_entries;
			create policy "section staff read notebook entries" on public.notebook_entries
			for select to authenticated using (true);`);
		const leaked = await db.asUser(teacherB.id, (q) =>
			q(`select id from public.notebook_entries where section_id = $1`, [p1])
		);
		// Both the submitted entry AND the draft: the policy was carrying the
		// draft boundary too, which is why mutating it must redden both counts.
		expect(leaked.rows.length).toBe(2);

		await restore();
		const closed = await db.asUser(teacherB.id, (q) =>
			q(`select id from public.notebook_entries where section_id = $1`, [p1])
		);
		expect(closed.rows.length).toBe(0);
		const reviewer = await db.asUser(coteacher.id, (q) =>
			q(`select id from public.notebook_entries where section_id = $1`, [p1])
		);
		expect(reviewer.rows.map((r) => r.id)).toEqual([entrySubmitted]);
	});
});
