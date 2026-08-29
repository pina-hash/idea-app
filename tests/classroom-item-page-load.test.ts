// tests/classroom-item-page-load.test.ts
//
// `/classroom/[sectionId]/item/[itemId]` -- the page a student opens to READ an
// assignment and HAND IT IN -- driven as the REAL shipped `load` against a REAL
// Postgres carrying the REAL migration chain, through the PostgREST shim.
//
// WHY THIS LOAD, WHEN ITS COMPONENTS ARE ALREADY WELL COVERED. That coverage is
// exactly what makes it dangerous. AssignmentEngine, ItemDetail and SpecRenderer
// are all tested and all behave perfectly on the payload they are handed; the
// load is the only thing that decides WHICH payload that is. A defect in the
// four-rung select ladder, in the `posted_in.section_id` cross-check or in the
// spec and rubric fetch produces an empty or a wrong page with every component
// still passing its own tests. Its three sibling loads under the same section
// (+layout.server, people, grades) are driven this way already; this one was
// skipped rather than blocked.
//
// FOUR THINGS IT PINS, and every one of them fails quietly:
//
//   1. WHAT A STUDENT SEES AND WHAT A MANAGER SEES ARE DIFFERENT PAYLOADS, not
//      one payload rendered twice. The student slice (submission, responses,
//      files, approvals) is loaded ONLY for a non-manager, because for a manager
//      those same RLS policies legitimately return every student's rows; the
//      instructor material, the spec, the rubric and the working copy go the
//      other way. Absence is the mechanism on both sides, so this file asserts
//      which TABLES each load touched, not only what came back.
//
//   2. THE SECTION IN THE URL IS CROSS-CHECKED AGAINST THE ITEM'S POSTINGS. A
//      real item id framed under a class it was never posted to must read as
//      404 -- for a student AND for a teacher who manages the class in the URL.
//      Losing the `posted_in.section_id` filter would leave the page rendering
//      perfectly, under the wrong class.
//
//   3. EVERY DEGRADE RUNG ANSWERS, AND ANSWERS DIFFERENTLY. Migrations here are
//      pasted in by hand, so a deployment sitting between two of them is a real
//      state. Six chains are booted, each stopping short of a different
//      migration, and each rung is asserted BY NAME against the widest one. Two
//      defects have already hidden in a rung nothing had ever run.
//
//   4. THE FAIL-SOFT READS FAIL SOFT. The deck, the reference spec, the
//      instructor copy and the whole engine each fall to null rather than
//      taking the page down -- which is the claim the route's own comment
//      makes and which nothing had ever put to a database that lacks them.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { load as ITEM_LOAD } from '../src/routes/classroom/[sectionId]/item/[itemId]/+page.server';
import type { ClassroomItem } from '../src/lib/classroom/classroom';

// ---------------------------------------------------------------------------
// THE CHAINS. One per rung, each differing from the widest by the migrations
// named in its comment, so a difference in an answer is attributable to them.
// ---------------------------------------------------------------------------

/** Everything under the classroom that this load reads a column or table of. */
const FULL = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0069_notebook.sql',
	'0070_coin_economy.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0090_classroom_instructor_materials.sql',
	'0092_classroom_reference_specs.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0101_classroom_decks.sql',
	'0104_classroom_edit_visibility.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0110_classroom_content_revisions.sql',
	'0111_classroom_units.sql',
	'0128_classroom_instructor_copy.sql',
	'0133_classroom_storage_attachments.sql',
	// 0137 goes LAST in every chain, per the harness note: it is a sweep over
	// whatever the chain above it created.
	'0137_anon_execute_sweep.sql'
] as const;

const without = (...drop: string[]) =>
	FULL.filter((f) => !drop.some((d) => f.startsWith(d))) as unknown as string[];

/** Rung 2 of the item ladder: `unit_id` is gone, `publish_at` is still there. */
const NO_UNITS = without('0111');
/** Rung 3: `publish_at` goes with it (0110 recreates 0109's own functions). */
const NO_SCHEDULED = without('0111', '0110', '0109');
/** Rung 4, the oldest supported item read: plain `body`, nothing else. */
const NO_RICH = without('0111', '0110', '0109', '0108');
/** The deck and the instructor copy, off the ladder entirely. */
const NO_DECK_NO_COPY = without('0101', '0128');
/** 0133's storage key: the rung inside the engine's own file read. */
const NO_STORAGE = without('0133');
/** The 0085-era world: canonical items, and no assignment engine at all. */
const PRE_ENGINE = without(
	'0086',
	'0090',
	'0092',
	'0095',
	'0101',
	'0104',
	'0108',
	'0109',
	'0110',
	'0111',
	'0128',
	'0133'
);

// ---------------------------------------------------------------------------
// FIXTURE PAYLOADS, all written through the REAL RPCs.
// ---------------------------------------------------------------------------

function levels(max: number) {
	return [
		{ points: max, label: 'Complete', descriptor: 'Everything asked for is present and correct.' },
		{ points: Math.round(max / 2), label: 'Developing', descriptor: 'Some of it is present.' },
		{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
	];
}

const SPEC = {
	schemaVersion: 1,
	meta: { assignmentId: 'idea100-u1-01', title: 'Material ID Checkpoint', totalPoints: 10 },
	modules: [
		{
			id: 'm1',
			title: 'Observe',
			points: 10,
			blocks: [
				{ type: 'instructions', content: 'Look closely at the six materials.' },
				{ type: 'textField', id: 'f1', prompt: 'Explain your method.', minSentences: 1 }
			],
			rubric: [{ id: 'c1', criterion: 'Method explained', levels: levels(10) }]
		}
	]
};

const RUBRIC = [{ id: 'r1', criterion: 'Observe: method explained', levels: levels(10) }];

const REFERENCE_SPEC = {
	schemaVersion: 2,
	kind: 'reference',
	meta: { referenceId: 'ref-unit-1', title: 'Unit 1 Reference' },
	sections: [
		{ slug: 'overview', title: 'Overview', blocks: [{ type: 'instructions', content: 'Read.' }] }
	]
};

/**
 * The STORED document shape (0108): an ARRAY of typed blocks, which is what
 * `_classroom_doc_ok` gates and what the renderer walks -- not Tiptap JSON and
 * not an object with a `blocks` key. The write RPC derives `body` from it with
 * `_classroom_doc_text` and ignores the caller's `p_body`, so the plain-text
 * projection below is the same string either way and the ladder's rungs differ
 * in formatting alone, which is the claim.
 */
const BODY_DOC = [{ type: 'p', runs: [{ text: 'Bring the calipers.' }] }];

// ---------------------------------------------------------------------------
// ONE WORLD PER CHAIN, seeded by ONE function whose steps are gated on which
// migrations that chain carries -- so no chain gets a second, hand-shaped
// fixture that could disagree with the widest one about what it contains.
// ---------------------------------------------------------------------------

interface World {
	db: TestDb;
	fks: Awaited<ReturnType<typeof loadForeignKeys>>;
	teacher: SeededUser;
	otherTeacher: SeededUser;
	alice: SeededUser;
	bruno: SeededUser;
	/** The class the assignment is posted to. */
	p1: string;
	/** A class of the SAME course the assignment is NOT posted to. */
	p2: string;
	assignment: string;
	material: string;
	draft: string;
	caps: Caps;
}

interface Caps {
	engine: boolean;
	instructorMaterials: boolean;
	referenceSpecs: boolean;
	rich: boolean;
	scheduled: boolean;
	units: boolean;
	deck: boolean;
	instructorCopy: boolean;
	storage: boolean;
}

const capsOf = (chain: readonly string[]): Caps => ({
	engine: chain.some((f) => f.startsWith('0086')),
	instructorMaterials: chain.some((f) => f.startsWith('0090')),
	referenceSpecs: chain.some((f) => f.startsWith('0092')),
	rich: chain.some((f) => f.startsWith('0108')),
	scheduled: chain.some((f) => f.startsWith('0109')),
	units: chain.some((f) => f.startsWith('0111')),
	deck: chain.some((f) => f.startsWith('0101')),
	instructorCopy: chain.some((f) => f.startsWith('0128')),
	storage: chain.some((f) => f.startsWith('0133'))
});

async function buildWorld(chain: readonly string[]): Promise<World> {
	const db = await startTestDb([...chain]);
	const fks = await loadForeignKeys(db);
	const caps = capsOf(chain);

	const rpc = <T>(as: SeededUser, call: string, params: unknown[] = []) =>
		db.asUser(as.id, async (q) => (await q<{ result: T }>(`select ${call} as result`, params)).rows[0].result);

	const teacher = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	const otherTeacher = await createUser(db, 'nolan@boscotech.edu', 'N. Olan');
	const alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	const bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Okafor');

	const p1 = await createClassroomSection(db, {
		as: teacher,
		courseCode: 'ENG1H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 1',
		teacherEmail: teacher.email
	});
	const p2 = await createClassroomSection(db, {
		as: teacher,
		courseCode: 'ENG1H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 2',
		teacherEmail: teacher.email
	});
	for (const s of [p1, p2]) {
		for (const u of [alice, bruno]) {
			await enrollStudent(db, { as: teacher, sectionId: s, email: u.email, displayName: u.email });
		}
	}

	/**
	 * The wide arity carries `p_body_doc`; the pre-0108 overload has no such
	 * parameter and could not. Two call shapes, not two fixtures -- what the
	 * chain cannot store is the only thing that differs.
	 */
	const create = async (kind: string, title: string, published = true) => {
		const wide = caps.rich;
		const call = wide
			? 'public.classroom_create_item($1, $2::uuid[], $3, $4, $5, null, null, $6, $7::jsonb, false, $8::jsonb)'
			: 'public.classroom_create_item($1, $2::uuid[], $3, $4, $5, null, null, $6)';
		const params = wide
			? [kind, [p1], title, 'Bring the calipers.', kind === 'assignment' ? 10 : null, published, '[]', JSON.stringify(BODY_DOC)]
			: [kind, [p1], title, 'Bring the calipers.', kind === 'assignment' ? 10 : null, published];
		const res = await rpc<{ item_id: string }>(teacher, call, params);
		return res.item_id;
	};

	const assignment = await create('assignment', 'Material ID Checkpoint');
	const material = await create('material', 'Unit 1 Reference');
	const draft = await create('assignment', 'Not published yet', false);

	if (caps.engine) {
		await rpc(teacher, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
			assignment,
			JSON.stringify(SPEC)
		]);
		await rpc(teacher, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
			assignment,
			JSON.stringify(RUBRIC)
		]);
		// TWO students' work, so a payload that leaked one to the other has
		// something to leak. Alice's is the one her own load must carry.
		await rpc(alice, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [
			assignment,
			'f1',
			JSON.stringify({ text: 'I compared the samples by mass.' })
		]);
		await rpc(bruno, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [
			assignment,
			'f1',
			JSON.stringify({ text: 'Bruno used the scale.' })
		]);
	}

	if (caps.referenceSpecs) {
		await rpc(teacher, 'public.classroom_set_reference_spec($1::uuid, $2::jsonb)', [
			material,
			JSON.stringify(REFERENCE_SPEC)
		]);
		await rpc(teacher, 'public.classroom_set_item_public($1::uuid, $2)', [material, true]);
	}

	if (caps.instructorMaterials) {
		await rpc(teacher, 'public.classroom_set_instructor_resources($1::uuid, $2::jsonb)', [
			assignment,
			JSON.stringify([{ label: 'Answer key notes', url: 'https://example.org/key' }])
		]);
	}

	if (caps.deck) {
		// A REAL deck through the REAL 0101 RPC. Seeding one is what makes the
		// no-0101 assertion below able to fail at all: with no deck anywhere,
		// `deck: null` is the answer on every chain and the rung is asserted by
		// nothing.
		await rpc(teacher, 'public.classroom_replace_deck($1::uuid, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb)', [
			assignment,
			'Day 1',
			'index.html',
			'folder-item-load-test',
			JSON.stringify([
				{ path: 'index.html', drive_file_id: 'drive-deck-1', mime_type: 'text/html; charset=utf-8' },
				{ path: 'styles.css', drive_file_id: 'drive-deck-2', mime_type: 'text/css' }
			]),
			null,
			false,
			JSON.stringify([{ index: 0, label: 'Holding' }])
		]);
	}

	if (caps.units) {
		const course = await db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ course_id: string }>(
				'select course_id from public.classroom_sections where id = $1',
				[p1]
			);
			return rows[0].course_id;
		});
		const unit = await rpc<{ unit_id: string }>(
			teacher,
			'public.classroom_upsert_unit($1::uuid, $2, $3::uuid)',
			[course, 'Unit 1', null]
		);
		await rpc(teacher, 'public.classroom_set_item_unit($1::uuid, $2::uuid)', [
			assignment,
			unit.unit_id
		]);
	}

	return { db, fks, teacher, otherTeacher, alice, bruno, p1, p2, assignment, material, draft, caps };
}

// ---------------------------------------------------------------------------
// DRIVING THE REAL LOAD, with the tables and RPCs it touched recorded.
// ---------------------------------------------------------------------------

interface ItemLoad {
	item: ClassroomItem & { instructorAttachments?: unknown[]; instructorLinks?: unknown[] };
	deck: unknown;
	engine: { spec: unknown; rubric: unknown; responses: { student_email: string }[]; filesStorageReady: boolean } | null;
	instructorCopy: { myEmail: string; mine: unknown[]; key: unknown } | null;
	spec: unknown;
	rubric: unknown;
	referenceSpec: unknown;
}

type Outcome =
	| { kind: 'ok'; data: ItemLoad; tables: string[]; rpcs: string[] }
	| { kind: 'error'; status: number; message: string; tables: string[]; rpcs: string[] }
	| { kind: 'redirect'; status: number; location: string; tables: string[]; rpcs: string[] };

async function run(
	w: World,
	who: SeededUser | null,
	sectionId: string,
	itemId: string
): Promise<Outcome> {
	const tables: string[] = [];
	const rpcs: string[] = [];
	const base = createPostgrestShim(w.db, w.fks, who?.id ?? '');
	const supabase = {
		from(table: string) {
			tables.push(table);
			return base.from(table);
		},
		rpc(name: string, args?: Record<string, unknown>) {
			rpcs.push(name);
			return base.rpc(name, args);
		}
	};
	try {
		const data = (await (ITEM_LOAD as unknown as (e: unknown) => Promise<ItemLoad>)({
			params: { sectionId, itemId },
			locals: {
				supabase,
				claims: who ? { sub: who.id, email: who.email, role: 'authenticated' } : null
			}
		})) as ItemLoad;
		return { kind: 'ok', data, tables, rpcs };
	} catch (thrown) {
		if (isRedirect(thrown)) {
			return { kind: 'redirect', status: thrown.status, location: thrown.location, tables, rpcs };
		}
		if (isHttpError(thrown)) {
			return {
				kind: 'error',
				status: thrown.status,
				message: String((thrown.body as { message?: string })?.message ?? ''),
				tables,
				rpcs
			};
		}
		throw thrown;
	}
}

/** The happy path, or a thrown assertion naming what came back instead. */
async function ok(w: World, who: SeededUser, sectionId: string, itemId: string): Promise<Outcome & { kind: 'ok' }> {
	const got = await run(w, who, sectionId, itemId);
	if (got.kind !== 'ok') {
		throw new Error(`expected a payload, got ${got.kind} ${'status' in got ? got.status : ''}`);
	}
	return got;
}

let full: World;
let noUnits: World;
let noScheduled: World;
let noRich: World;
let noDeckNoCopy: World;
let noStorage: World;
let preEngine: World;

beforeAll(async () => {
	// Sequential rather than Promise.all: they share one cluster, and a burst of
	// migration chains against it buys nothing over running them in order.
	full = await buildWorld(FULL);
	noUnits = await buildWorld(NO_UNITS);
	noScheduled = await buildWorld(NO_SCHEDULED);
	noRich = await buildWorld(NO_RICH);
	noDeckNoCopy = await buildWorld(NO_DECK_NO_COPY);
	noStorage = await buildWorld(NO_STORAGE);
	preEngine = await buildWorld(PRE_ENGINE);
}, 600_000);

afterAll(async () => {
	for (const w of [full, noUnits, noScheduled, noRich, noDeckNoCopy, noStorage, preEngine]) {
		await w?.db?.stop();
	}
});

// ---------------------------------------------------------------------------
// 1. WHAT A STUDENT SEES
// ---------------------------------------------------------------------------
describe('a student opening the assignment', () => {
	test('gets the item, its spec and rubric through the ENGINE, and no manager slice', async () => {
		const got = await ok(full, full.alice, full.p1, full.assignment);
		expect(got.data.item.id).toBe(full.assignment);
		expect(got.data.item.title).toBe('Material ID Checkpoint');

		// The student half.
		expect(got.data.engine).not.toBeNull();
		expect(got.data.engine?.spec).toMatchObject({ schemaVersion: 1 });
		expect(got.data.engine?.rubric).toHaveLength(1);

		// The manager half, ABSENT. These four keys are what a manager's payload
		// carries, and a student's must not: `spec` and `rubric` at the top level
		// are the read-only manager view, and the working copy is 0128's.
		expect(got.data.spec).toBeNull();
		expect(got.data.rubric).toBeNull();
		expect(got.data.instructorCopy).toBeNull();
		expect(got.data.item.instructorLinks).toBeUndefined();
		expect(got.data.item.instructorAttachments).toBeUndefined();
	});

	test('carries her OWN responses and not her classmate s, with the classmate s row proved to exist', async () => {
		// The positive control first, read as the connection owner so RLS cannot
		// be what makes it look empty: Bruno's answer IS in the table.
		const all = await full.db.sql<{ student_email: string }>(
			'select student_email from public.classroom_responses where item_id = $1 order by student_email',
			[full.assignment]
		);
		expect(all.rows.map((r) => r.student_email).sort()).toEqual([
			full.alice.email,
			full.bruno.email
		]);

		const got = await ok(full, full.alice, full.p1, full.assignment);
		const emails = (got.data.engine?.responses ?? []).map((r) => r.student_email);
		expect(emails).toEqual([full.alice.email]);
		expect(emails).not.toContain(full.bruno.email);
	});

	test('never touches an instructor-only table at all', async () => {
		const got = await ok(full, full.alice, full.p1, full.assignment);
		// Absence is the mechanism: a student's payload provably cannot carry
		// what was never read. Asserted on the TABLES, so a future field that
		// happened to come back empty for RLS reasons still reddens here.
		for (const forbidden of [
			'classroom_instructor_attachments',
			'classroom_instructor_resources',
			'classroom_instructor_responses',
			'classroom_instructor_keys'
		]) {
			expect(got.tables).not.toContain(forbidden);
		}
		// The positive control for that sweep: the manager's load DOES touch all
		// four, so "not contained" is a decision and not a table nothing reads.
		const managerTables = (await ok(full, full.teacher, full.p1, full.assignment)).tables;
		for (const expected of [
			'classroom_instructor_attachments',
			'classroom_instructor_resources',
			'classroom_instructor_responses',
			'classroom_instructor_keys'
		]) {
			expect(managerTables).toContain(expected);
		}
	});

	test('cannot open a draft, and the manager can -- the same id, two answers', async () => {
		const student = await run(full, full.alice, full.p1, full.draft);
		expect(student.kind).toBe('error');
		if (student.kind === 'error') expect(student.status).toBe(404);
		expect((await ok(full, full.teacher, full.p1, full.draft)).data.item.id).toBe(full.draft);
	});

	test('a signed-out caller is redirected rather than shown anything', async () => {
		const got = await run(full, null, full.p1, full.assignment);
		if (got.kind !== 'redirect') throw new Error(`expected a redirect, got ${got.kind}`);
		expect(got.status).toBe(303);
		expect(got.location).toBe('/');
		// And it decided that BEFORE reading anything.
		expect(got.tables).toEqual([]);
		expect(got.rpcs).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 2. WHAT A MANAGER SEES
// ---------------------------------------------------------------------------
describe('a manager opening the same assignment', () => {
	test('gets the spec, the rubric, the instructor material and a working copy', async () => {
		const got = await ok(full, full.teacher, full.p1, full.assignment);
		expect(got.data.spec).toMatchObject({ schemaVersion: 1 });
		expect(got.data.rubric).toHaveLength(1);
		expect(got.data.item.instructorLinks).toHaveLength(1);
		expect(got.data.instructorCopy).not.toBeNull();
		expect(got.data.instructorCopy?.myEmail).toBe(full.teacher.email);
	});

	test('and NOT the student slice, which for a manager would be the whole class', async () => {
		const got = await ok(full, full.teacher, full.p1, full.assignment);
		// The RLS policies behind the engine legitimately return every student's
		// rows to a manager -- the grading console loads those deliberately and
		// this page never should. `engine` null is how that is guaranteed.
		expect(got.data.engine).toBeNull();
		expect(got.tables).not.toContain('classroom_responses');
		expect(got.tables).not.toContain('classroom_submissions');
		// Positive control: the student's own load reads both.
		const studentTables = (await ok(full, full.alice, full.p1, full.assignment)).tables;
		expect(studentTables).toContain('classroom_responses');
		expect(studentTables).toContain('classroom_submissions');
	});

	test('the working copy is asked for only when there is a spec to fill in', async () => {
		// An assignment with no interactive spec has no blocks to answer and the
		// save RPC refuses one, so the read is not made at all.
		const bare = await full.db.asUser(full.teacher.id, async (q) => {
			const { rows } = await q<{ result: { item_id: string } }>(
				'select public.classroom_create_item($1, $2::uuid[], $3, $4, $5, null, null, $6) as result',
				['assignment', [full.p1], 'No spec on this one', 'Just a body.', 5, true]
			);
			return rows[0].result.item_id;
		});
		const got = await ok(full, full.teacher, full.p1, bare);
		expect(got.data.spec).toBeNull();
		expect(got.data.instructorCopy).toBeNull();
		expect(got.tables).not.toContain('classroom_instructor_responses');
	});

	test('a material carries its reference spec, and the public flag only for a manager', async () => {
		const manager = await ok(full, full.teacher, full.p1, full.material);
		expect(manager.data.referenceSpec).toMatchObject({ kind: 'reference' });
		expect(manager.data.item.is_public).toBe(true);
		expect(manager.tables.filter((t) => t === 'classroom_items')).toHaveLength(2);

		const student = await ok(full, full.alice, full.p1, full.material);
		expect(student.data.referenceSpec).toMatchObject({ kind: 'reference' });
		// `is_public` is the TOGGLE's flag, not a visibility signal: the column is
		// never selected for a student, so it normalises to false on a material
		// that is genuinely public. Asserted so nobody reads a student payload's
		// false as "this material is private".
		expect(student.data.item.is_public).toBe(false);
		expect(student.tables.filter((t) => t === 'classroom_items')).toHaveLength(1);
	});

	test('an assignment asks for no reference spec at all', async () => {
		const got = await ok(full, full.teacher, full.p1, full.assignment);
		expect(got.data.referenceSpec).toBeNull();
		expect(got.tables).not.toContain('classroom_reference_specs');
	});
});

// ---------------------------------------------------------------------------
// 3. THE SECTION CROSS-CHECK
// ---------------------------------------------------------------------------
describe('an item framed under a class it was never posted to', () => {
	test('404s for a student enrolled in that other class', async () => {
		const got = await run(full, full.alice, full.p2, full.assignment);
		if (got.kind !== 'error') throw new Error(`expected a 404, got ${got.kind}`);
		expect(got.status).toBe(404);
		expect(got.message).toBe('Not found');
	});

	test('404s for the TEACHER OF RECORD of that other class', async () => {
		// Managing the section in the URL is not a licence to render an item
		// under it: the posting is what ties the two together.
		const got = await run(full, full.teacher, full.p2, full.assignment);
		if (got.kind !== 'error') throw new Error(`expected a 404, got ${got.kind}`);
		expect(got.status).toBe(404);
	});

	test('the positive control: the same id under the class it IS posted to returns', async () => {
		expect((await ok(full, full.alice, full.p1, full.assignment)).data.item.id).toBe(
			full.assignment
		);
		expect((await ok(full, full.teacher, full.p1, full.assignment)).data.item.id).toBe(
			full.assignment
		);
	});

	test('a stranger to the course 404s wherever they point it', async () => {
		for (const section of [full.p1, full.p2]) {
			const got = await run(full, full.otherTeacher, section, full.assignment);
			if (got.kind !== 'error') throw new Error(`expected a 404, got ${got.kind}`);
			expect(got.status).toBe(404);
		}
	});

	test('an item id that does not exist is the same 404 as one that is not yours', async () => {
		const missing = await run(full, full.alice, full.p1, '00000000-0000-0000-0000-000000000000');
		const notYours = await run(full, full.otherTeacher, full.p1, full.assignment);
		for (const got of [missing, notYours]) {
			if (got.kind !== 'error') throw new Error(`expected a 404, got ${got.kind}`);
			expect(got.status).toBe(404);
			expect(got.message).toBe('Not found');
		}
	});
});

// ---------------------------------------------------------------------------
// 4. THE DEGRADE RUNGS, EACH NAMED
// ---------------------------------------------------------------------------
describe('the item select ladder, rung by rung', () => {
	test('rung 1 (0111): the widest read carries unit_id, publish_at and body_doc', async () => {
		const item = (await ok(full, full.alice, full.p1, full.assignment)).data.item;
		expect(item.unit_id).toEqual(expect.any(String));
		expect(item.publish_at).toBeNull();
		expect(Array.isArray(item.body_doc)).toBe(true);
		expect(item.body_doc).toEqual(BODY_DOC);
	});

	test('rung 2 (no 0111): unit_id becomes UNDEFINED, and publish_at survives', async () => {
		const item = (await ok(noUnits, noUnits.alice, noUnits.p1, noUnits.assignment)).data.item;
		// Undefined and null are kept apart on purpose: "this read could not
		// tell" is what `classGroups` treats as unfiled, and null is a filed
		// decision. A rung that answered null would file every item as unfiled
		// while claiming to know.
		expect(item.unit_id).toBeUndefined();
		expect(item.publish_at).toBeNull();
		expect(Array.isArray(item.body_doc)).toBe(true);
		expect(item.body_doc).toEqual(BODY_DOC);
		expect(item.title).toBe('Material ID Checkpoint');
	});

	test('rung 3 (no 0109): publish_at becomes UNDEFINED, and the rich body survives', async () => {
		const item = (await ok(noScheduled, noScheduled.alice, noScheduled.p1, noScheduled.assignment))
			.data.item;
		expect(item.publish_at).toBeUndefined();
		expect(item.unit_id).toBeUndefined();
		// The rung exists so a project on 0108 alone does NOT lose its rich body
		// to add a column it does not have.
		expect(Array.isArray(item.body_doc)).toBe(true);
		expect(item.body_doc).toEqual(BODY_DOC);
	});

	test('rung 4 (no 0108): body_doc becomes UNDEFINED, and the plain body is still there', async () => {
		const item = (await ok(noRich, noRich.alice, noRich.p1, noRich.assignment)).data.item;
		expect(item.body_doc).toBeUndefined();
		expect(item.publish_at).toBeUndefined();
		expect(item.unit_id).toBeUndefined();
		// Degrading loses the FORMATTING for this read, never the body.
		expect(item.body).toBe('Bring the calipers.');
		expect(item.title).toBe('Material ID Checkpoint');
		// And the page is still a page: the engine, the spec and the rubric are
		// all on their own reads and are unaffected by the ladder.
		const got = await ok(noRich, noRich.alice, noRich.p1, noRich.assignment);
		expect(got.data.engine?.spec).toMatchObject({ schemaVersion: 1 });
	});

	test('the four rungs answer four different column sets, so none is a copy of another', async () => {
		const shape = (i: ClassroomItem) =>
			[i.body_doc === undefined, i.publish_at === undefined, i.unit_id === undefined].join('/');
		const seen = [
			shape((await ok(full, full.alice, full.p1, full.assignment)).data.item),
			shape((await ok(noUnits, noUnits.alice, noUnits.p1, noUnits.assignment)).data.item),
			shape(
				(await ok(noScheduled, noScheduled.alice, noScheduled.p1, noScheduled.assignment)).data.item
			),
			shape((await ok(noRich, noRich.alice, noRich.p1, noRich.assignment)).data.item)
		];
		expect(seen).toEqual([
			'false/false/false',
			'false/false/true',
			'false/true/true',
			'true/true/true'
		]);
		expect(new Set(seen).size).toBe(4);
	});
});

describe('the reads that fail soft', () => {
	test('no 0101: the deck is null and the rest of the page is untouched', async () => {
		const got = await ok(noDeckNoCopy, noDeckNoCopy.alice, noDeckNoCopy.p1, noDeckNoCopy.assignment);
		expect(got.data.deck).toBeNull();
		expect(got.data.item.title).toBe('Material ID Checkpoint');
		expect(got.data.engine).not.toBeNull();
		// THE POSITIVE CONTROL, and the reason a real deck is seeded at all: the
		// SAME item on the chain that carries 0101 comes back WITH one, so the
		// null above is the missing table and not an item that never had a deck.
		const wide = await ok(full, full.alice, full.p1, full.assignment);
		expect(wide.data.deck).not.toBeNull();
		expect((wide.data.deck as { title: string }).title).toBe('Day 1');
		expect(wide.tables).toContain('classroom_decks');
		expect(got.tables).toContain('classroom_decks');
	});

	test('no 0128: the manager keeps the assignment page and loses only the working copy', async () => {
		const got = await ok(
			noDeckNoCopy,
			noDeckNoCopy.teacher,
			noDeckNoCopy.p1,
			noDeckNoCopy.assignment
		);
		expect(got.data.instructorCopy).toBeNull();
		expect(got.data.spec).toMatchObject({ schemaVersion: 1 });
		expect(got.data.rubric).toHaveLength(1);
		expect(got.data.item.instructorLinks).toHaveLength(1);
	});

	test('no 0133: the engine still answers, and REPORTS that it cannot tell a picture from a CAD file', async () => {
		const narrow = await ok(noStorage, noStorage.alice, noStorage.p1, noStorage.assignment);
		expect(narrow.data.engine).not.toBeNull();
		expect(narrow.data.engine?.filesStorageReady).toBe(false);
		// The capability is REPORTED rather than assumed, which is only a claim
		// if the wide rung reports the other answer.
		const wide = await ok(full, full.alice, full.p1, full.assignment);
		expect(wide.data.engine?.filesStorageReady).toBe(true);
	});

	test('no 0086: the whole engine is null and the item still renders', async () => {
		const got = await ok(preEngine, preEngine.alice, preEngine.p1, preEngine.assignment);
		expect(got.data.engine).toBeNull();
		expect(got.data.spec).toBeNull();
		expect(got.data.rubric).toBeNull();
		expect(got.data.item.title).toBe('Material ID Checkpoint');
		expect(got.data.item.body).toBe('Bring the calipers.');
	});

	test('no 0092: a material renders with no reference spec rather than 500ing', async () => {
		const got = await ok(preEngine, preEngine.alice, preEngine.p1, preEngine.material);
		expect(got.data.referenceSpec).toBeNull();
		expect(got.data.item.kind).toBe('material');
		expect(got.data.item.title).toBe('Unit 1 Reference');
	});

	test('and the 0085-era manager page is a manager page still', async () => {
		const got = await ok(preEngine, preEngine.teacher, preEngine.p1, preEngine.assignment);
		expect(got.data.item.id).toBe(preEngine.assignment);
		expect(got.data.instructorCopy).toBeNull();
		expect(got.data.deck).toBeNull();
		// 0090 is not in this chain either, so there is no instructor material
		// read to make and the merge answers empty rather than failing.
		expect(got.data.item.instructorLinks).toEqual([]);
	});
});
