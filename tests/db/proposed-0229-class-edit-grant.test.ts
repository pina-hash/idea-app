/**
 * PROPOSED 0229 -- a live class EDIT grant on an IdeaCAD document (decision 38).
 *
 * THE FILE UNDER TEST IS A PROPOSAL, NOT A MIGRATION, and this suite applies it
 * FROM ITS PROPOSED PATH. It boots the real chain through 0224 (the highest
 * migration production has), seeds the world through the real RPCs as it
 * stood BEFORE the file -- a live blade document with a personal editor and a
 * personal viewer, an archived blade document shared with a later class as a
 * VIEWER through 0214, and a teacher's own direct (solid) document -- then
 * applies the proposal over the top and asserts both directions:
 *
 *   * a student enrolled in the granted class can write through BOTH write
 *     paths: every blade concept writer, ideacad_apply_actions, the five
 *     assembly writes a personal editor has, and ideacad_save_direct_document;
 *   * a student in another class, a student not enrolled yet, and a student
 *     deactivated cannot, and the last two change answer in the SAME statement
 *     as the roster change;
 *   * the four assembly-OWNER writes stay the owner's, for a class editor
 *     exactly as for a personal editor (the proposal's decision 2);
 *   * 0214's archived-only viewer share, and every answer every seeded person
 *     got about every seeded document, is unchanged by the apply;
 *   * anon executes none of it, and a second paste changes nothing;
 *   * the undo file beside it puts every function in public back to exactly
 *     the source and ACL it had before the apply, and 0229 applies again after.
 *
 * WHEN THE PROPOSAL IS PROMOTED to supabase/migrations/, point PROPOSED at the
 * new path and keep every assertion. The chain stays pinned at 0224 because the
 * question this file answers is "does 0229 apply over what production has".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { startTestDb, createUser, type SeededUser, type TestDb } from './harness';
import { diffTrees } from '../../src/lib/ideacad/history';
import { scanFile } from '../../tools/apply-migration.mjs';

const PROPOSED = 'docs/feedback/2026-09-25/overnight/proposed/0229_ideacad_class_edit_grant.sql';
const PROPOSED_SQL = readFileSync(fileURLToPath(new URL(`../../${PROPOSED}`, import.meta.url)), 'utf8');
const UNDO = 'docs/feedback/2026-09-25/overnight/proposed/undo-0229_ideacad_class_edit_grant.sql';
const UNDO_SQL = readFileSync(fileURLToPath(new URL(`../../${UNDO}`, import.meta.url)), 'utf8');
const MIGRATION_0214 = readFileSync(
	fileURLToPath(new URL('../../supabase/migrations/0214_ideacad_document_archive.sql', import.meta.url)),
	'utf8'
);
const CHAIN = readdirSync(new URL('../../supabase/migrations', import.meta.url))
	.filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) <= 224)
	.sort();
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';
const KERNEL = 'remus-f7907f5-2.130.20';

const NEW_FUNCTIONS = [
	'public.ideacad_grant_class_edit(uuid,uuid)',
	'public.ideacad_revoke_class_edit(uuid,uuid)',
	'public.ideacad_class_edit_grants(uuid)'
] as const;
/** Called only from inside the definer functions above; no client role holds it. */
const REACH_HELPER = 'public._ideacad_class_edit_reach(uuid,uuid)';

let db: TestDb;
let teacher: SeededUser, otherTeacher: SeededUser, owner: SeededUser, classmate: SeededUser;
let peditor: SeededUser, pviewer: SeededUser, leaver: SeededUser, late: SeededUser;
let stranger: SeededUser, departed: SeededUser, nextYear: SeededUser, crossover: SeededUser;
let cast: SeededUser[];
let sectionA: string, sectionB: string, sectionC: string, sectionD: string;
let itemId: string, bladeDoc: string, bladeConcept: string, archivedDoc: string, directDoc: string;

type Corpus = Record<string, unknown>;
let corpusBefore: Corpus;
let verificationBeforeApply: 'ok' | 'not ok' | 'threw';
let aclBefore: Record<string, string | null>;
let functionsBefore: Record<string, { src: string; acl: string | null }>;

async function call<T = any>(user: SeededUser, expression: string, params: unknown[] = []): Promise<T> {
	return db.asUser(user.id, async (q) => (await q(`select ${expression} as result`, params)).rows[0].result as T);
}
async function refusal(user: SeededUser, expression: string, params: unknown[] = []): Promise<string> {
	try {
		await call(user, expression, params);
		return '';
	} catch (error) {
		return (error as Error).message;
	}
}
/** A definer-only predicate, read as a person (service_role carries the subject). */
async function predicate<T = any>(user: SeededUser, expression: string, params: unknown[] = []): Promise<T> {
	return db.asServiceRole(
		async (q) => (await q(`select ${expression} as result`, params)).rows[0].result as T,
		user.id
	);
}
async function gates(user: SeededUser, doc: string) {
	return predicate(
		user,
		`json_build_object(
			'role', public._ideacad_document_role($1::uuid),
			'read', public._ideacad_can_read_document($1::uuid),
			'write', public._ideacad_can_write_document($1::uuid),
			'direct', public._ideacad_direct_can_write($1::uuid),
			'partOwner', public._ideacad_part_owner($1::uuid),
			'partWriter', public._ideacad_part_writer($1::uuid),
			'manages', public._ideacad_manages_document($1::uuid))`,
		[doc]
	);
}
/** Ask one realtime wrapper, as one person, about one topic (0211's shape). */
async function realtime(user: SeededUser, doc: string) {
	return db.asUser(user.id, async (q) => {
		const topic = `ideacad-doc:${doc}`;
		await q(`select set_config('realtime.topic', $1, false)`, [topic]);
		const { rows } = await q<{ n: string }>(
			`select count(*) as n from realtime.messages where topic = $1 and extension = 'broadcast'`,
			[topic]
		);
		let send = false;
		try {
			await q(
				`insert into realtime.messages (topic, extension, event, private) values ($1, 'broadcast', 'probe', true)`,
				[topic]
			);
			send = true;
		} catch {
			send = false;
		}
		await q(`select set_config('realtime.topic', '', false)`);
		return { receive: Number(rows[0].n) > 0, send };
	});
}
/** Every answer every person gets about every document, in one comparable object. */
async function corpus(): Promise<Corpus> {
	const out: Corpus = {};
	for (const user of cast) {
		for (const [name, doc] of [
			['blade', bladeDoc],
			['archived', archivedDoc],
			['direct', directDoc]
		] as const) {
			out[`${user.email}|${name}|gates`] = await gates(user, doc);
			out[`${user.email}|${name}|realtime`] = await realtime(user, doc);
		}
		out[`${user.email}|sharedWithMe`] = await call(user, 'public.ideacad_shared_with_me($1::uuid)', [itemId]);
		const listed = await call<Array<Record<string, unknown>>>(user, 'public.ideacad_direct_documents()');
		out[`${user.email}|directList`] = listed.map((d) => [d.id, d.role, d.canWrite]);
	}
	return out;
}
async function acl(signature: string): Promise<string | null> {
	const { rows } = await db.sql<{ acl: string | null }>(
		`select proacl::text as acl from pg_proc where oid = $1::regprocedure`,
		[signature]
	);
	return rows[0].acl;
}
/** Every function in public, by signature: its source and its ACL. What the undo must restore. */
async function publicFunctions(): Promise<Record<string, { src: string; acl: string | null }>> {
	const { rows } = await db.sql<{ sig: string; src: string; acl: string | null }>(
		`select p.oid::regprocedure::text as sig, p.prosrc as src, p.proacl::text as acl
		 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		 where n.nspname = 'public'`
	);
	return Object.fromEntries(rows.map((r) => [r.sig, { src: r.src, acl: r.acl }]));
}
async function editGrantRows() {
	return (
		await db.sql<{ document_id: string; section_id: string; granted_by: string }>(
			`select document_id, section_id, granted_by from public.ideacad_section_edit_grants order by document_id, section_id`
		)
	).rows;
}
async function conceptRevision(conceptId: string): Promise<number> {
	return (await db.sql<{ revision: number }>('select revision from public.ideacad_concepts where id = $1', [conceptId]))
		.rows[0].revision;
}
async function openDirect(user: SeededUser, doc: string) {
	return call(user, 'public.ideacad_open_direct_document($1::uuid)', [doc]);
}
/** A title rename through the real save RPC, on whatever the document holds now. */
async function renameDirect(user: SeededUser, doc: string, title: string) {
	const opened = await db.asServiceRole(
		async (q) => (await q('select public.ideacad_open_direct_document($1::uuid) as r', [doc])).rows[0].r,
		teacher.id
	);
	const model = { ...opened.concept.features, title };
	return call(
		user,
		'public.ideacad_save_direct_document($1::uuid,$2::integer,$3::uuid,$4,$5::jsonb,$6::jsonb,$7::jsonb)',
		[
			doc,
			opened.concept.revision,
			randomUUID(),
			'Rename',
			JSON.stringify(diffTrees(opened.concept.features, model)),
			JSON.stringify(model),
			'[]'
		]
	);
}
async function saveBlade(user: SeededUser, marker: string) {
	const next = (await conceptRevision(bladeConcept)) + 1;
	return call(user, 'public.ideacad_save_concept($1::uuid, $2::jsonb, $3)', [
		bladeConcept,
		JSON.stringify({ blade: marker }),
		next
	]);
}

/** The file's own section 8, with its comment markers stripped, exactly as a person would run it. */
function verificationQuery(): string {
	const lines = PROPOSED_SQL.split('\n');
	const start = lines.indexOf('-- BEGIN VERIFICATION QUERY');
	const end = lines.indexOf('-- END VERIFICATION QUERY');
	if (start < 0 || end <= start + 1) throw new Error('0229 has no verification query between its marker lines');
	return lines
		.slice(start + 1, end)
		.map((line) => line.replace(/^-- ?/, ''))
		.join('\n');
}

/**
 * THE PASTE TRAP, checked with a planted control. A `$` inside a `--` comment,
 * or an unbalanced dollar-quote tag, breaks the Supabase editor's client-side
 * statement splitter (it cost 0194 an apply cycle). Returns what it found.
 */
function pasteTrap(sql: string): string[] {
	const found: string[] = [];
	const tags = new Map<string, number>();
	sql.split('\n').forEach((line, i) => {
		const at = line.indexOf('--');
		const code = at === -1 ? line : line.slice(0, at);
		const comment = at === -1 ? '' : line.slice(at);
		if (comment.includes('$')) found.push(`line ${i + 1}: a dollar sign in a comment`);
		for (const tag of code.match(/\$[A-Za-z_]*\$/g) ?? []) tags.set(tag, (tags.get(tag) ?? 0) + 1);
	});
	for (const [tag, n] of tags) if (n % 2 !== 0) found.push(`${tag} appears ${n} time(s)`);
	return found;
}

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...CHAIN]);

	teacher = await createUser(db, 'c29.teacher@boscotech.edu', 'Teacher Of Record');
	otherTeacher = await createUser(db, 'c29.other@boscotech.edu', 'Other Teacher');
	owner = await createUser(db, 'c29.owner@boscotech.net', 'Blade Owner');
	classmate = await createUser(db, 'c29.classmate@boscotech.net', 'Classmate');
	peditor = await createUser(db, 'c29.peditor@boscotech.net', 'Personal Editor');
	pviewer = await createUser(db, 'c29.pviewer@boscotech.net', 'Personal Viewer');
	leaver = await createUser(db, 'c29.leaver@boscotech.net', 'Leaver');
	late = await createUser(db, 'c29.late@boscotech.net', 'Late Joiner');
	stranger = await createUser(db, 'c29.stranger@boscotech.net', 'Stranger');
	departed = await createUser(db, 'c29.departed@boscotech.net', 'Departed');
	nextYear = await createUser(db, 'c29.nextyear@boscotech.net', 'Next Year');
	// In the later class AND holding a personal viewer grant on the archived
	// document: the one person whose ideacad_shared_with_me row is decided by the
	// tie-break 0229 reorders, so the corpus comparison has something to catch.
	crossover = await createUser(db, 'c29.crossover@boscotech.net', 'Crossover');
	cast = [teacher, otherTeacher, owner, classmate, peditor, pviewer, leaver, late, stranger, departed, nextYear, crossover];

	const course = await call(teacher, "public.classroom_upsert_course('IDEACAD29', 'IdeaCAD')");
	const section = async (who: SeededUser, label: string) =>
		(await call(who, 'public.classroom_upsert_section($1::uuid, $2, null, $3)', [course.course_id, label, who.email]))
			.section_id as string;
	sectionA = await section(teacher, 'Period 1');
	sectionB = await section(otherTeacher, 'Period 2');
	sectionC = await section(teacher, 'Period 3');
	sectionD = await section(teacher, 'Period 5');
	const enrol = (who: SeededUser, sectionId: string, as: SeededUser, active = true) =>
		call(as, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [sectionId, who.email, who.email, active]);
	for (const s of [owner, classmate, peditor, pviewer, leaver, departed]) await enrol(s, sectionA, teacher);
	await enrol(stranger, sectionB, otherTeacher);
	await enrol(nextYear, sectionC, teacher);
	await enrol(crossover, sectionC, teacher);

	const item = await call(
		teacher,
		"public.classroom_create_item('assignment', $1::uuid[], 'Blade', 'Build it.', 20, null, null, true, '[]'::jsonb, false)",
		[[sectionA]]
	);
	itemId = item.item_id;
	await db.sql('insert into public.classroom_postings (item_id, section_id) values ($1, $2)', [itemId, sectionC]);
	await call(teacher, "public.ideacad_set_editor($1::uuid, 'blade', $2::jsonb)", [
		itemId,
		JSON.stringify({ defaultFeatures: { blade: 'seed' } })
	]);

	// THE PRE-0229 WORLD, every row written by the real RPC that writes it.
	const opened = await call(owner, 'public.ideacad_open_document($1::uuid)', [itemId]);
	bladeDoc = opened.document.id;
	bladeConcept = opened.concepts[0].id;
	await call(owner, "public.ideacad_share_document($1::uuid, $2, 'editor')", [bladeDoc, peditor.email]);
	await call(owner, "public.ideacad_share_document($1::uuid, $2, 'viewer')", [bladeDoc, pviewer.email]);

	archivedDoc = (await call(departed, 'public.ideacad_open_document($1::uuid)', [itemId])).document.id;
	await call(departed, "public.ideacad_share_document($1::uuid, $2, 'viewer')", [archivedDoc, crossover.email]);
	await call(teacher, 'public.ideacad_set_document_archived($1::uuid, true)', [archivedDoc]);
	await call(teacher, 'public.ideacad_share_document_with_section($1::uuid, $2::uuid)', [archivedDoc, sectionC]);

	directDoc = (await call(teacher, 'public.ideacad_create_direct_document($1, $2)', ['Class bracket', KERNEL])).document
		.id;

	for (const doc of [bladeDoc, archivedDoc, directDoc]) {
		await db.sql(
			`insert into realtime.messages (topic, extension, event, private) values ($1, 'broadcast', 'seed', true)`,
			[`ideacad-doc:${doc}`]
		);
	}

	corpusBefore = await corpus();
	aclBefore = {
		role: await acl('public._ideacad_document_role(uuid)'),
		shared: await acl('public.ideacad_shared_with_me(uuid)')
	};
	functionsBefore = await publicFunctions();

	try {
		const { rows } = await db.sql<{ ok: boolean }>(verificationQuery());
		verificationBeforeApply = rows.every((r) => r.ok === true) ? 'ok' : 'not ok';
	} catch {
		verificationBeforeApply = 'threw';
	}

	// THE APPLY, from the proposed path. Its own self-check raises on failure,
	// which fails this hook with the migration's own sentence.
	await db.sql(PROPOSED_SQL);
}, 600_000);

afterAll(async () => {
	await db?.stop();
});

describe('0229 is appliable the way it would be applied', () => {
	it('tools/apply-migration.mjs would send it: nothing refused, nothing warned', () => {
		const scan = scanFile(PROPOSED_SQL);
		expect(scan.findings).toEqual([]);
		expect(scan.selfManagedTransaction).toBe(true);
		expect(scan.statements).toBeGreaterThan(10);
	});

	it('carries no paste trap, nor does its undo, and the check finds one when one is planted', () => {
		expect(pasteTrap(PROPOSED_SQL)).toEqual([]);
		expect(pasteTrap(UNDO_SQL)).toEqual([]);
		expect(pasteTrap('select 1; -- a $tag$ in a comment\n')).toHaveLength(1);
		expect(pasteTrap('create function f() as $x$ select 1;\n')).toHaveLength(1);
	});

	it('the undo is refused by the apply tool for its drop table and nothing else, so a person pastes it', () => {
		const scan = scanFile(UNDO_SQL);
		expect(scan.findings.map((f: { kind: string; what: string }) => [f.kind, f.what])).toEqual([['refuse', 'drop table']]);
		expect(scan.selfManagedTransaction).toBe(true);
	});

	it("the undo re-creates 0214's two functions verbatim, never a reconstruction", () => {
		const statement = (sql: string, head: string, tag: string) => {
			const start = sql.indexOf(head);
			const end = sql.indexOf(`${tag};`, start);
			if (start < 0 || end < 0) return null;
			return sql.slice(start, end + tag.length + 1);
		};
		for (const [head, tag] of [
			['create or replace function public._ideacad_document_role(', '$role$'],
			['create or replace function public.ideacad_shared_with_me(', '$sharedwithme$']
		]) {
			const inUndo = statement(UNDO_SQL, head, tag);
			expect(inUndo, head).not.toBeNull();
			expect(inUndo!.length).toBeGreaterThan(200);
			// The same statement as 0214's, character for character, and NOT 0229's.
			expect(inUndo).toBe(statement(MIGRATION_0214, head, tag));
			expect(inUndo).not.toBe(statement(PROPOSED_SQL, head, tag));
		}
	});

	it('its own verification query, run as written, answers ok on every row, and did not before the apply', async () => {
		const { rows } = await db.sql<{ what: string; ok: boolean }>(verificationQuery());
		expect(rows.length).toBe(9);
		expect(rows.filter((r) => r.ok !== true)).toEqual([]);
		// The control: the same query against the database BEFORE the file.
		expect(verificationBeforeApply).not.toBe('ok');
	});

	it('was applied: the table exists with RLS on, and no class table has a role column', async () => {
		const { rows } = await db.sql<{ relrowsecurity: boolean }>(
			`select relrowsecurity from pg_class where oid = 'public.ideacad_section_edit_grants'::regclass`
		);
		expect(rows).toEqual([{ relrowsecurity: true }]);
		const roleColumns = await db.sql(
			`select attrelid::regclass::text from pg_attribute
			 where attrelid in ('public.ideacad_section_edit_grants'::regclass, 'public.ideacad_section_grants'::regclass)
			   and attname = 'role' and not attisdropped`
		);
		expect(roleColumns.rows).toEqual([]);
	});
});

describe('every answer that existed before 0229 is unchanged by it', () => {
	it('answers every seeded person about every seeded document exactly as before (the gates, realtime, and both discovery reads)', async () => {
		const after = await corpus();
		expect(Object.keys(after).length).toBe(cast.length * 8);
		expect(after).toEqual(corpusBefore);
	});

	it('keeps the ACL of both replaced functions byte for byte', async () => {
		expect(await acl('public._ideacad_document_role(uuid)')).toBe(aclBefore.role);
		expect(await acl('public.ideacad_shared_with_me(uuid)')).toBe(aclBefore.shared);
		expect(aclBefore.role).not.toContain('anon=');
	});

	it('keeps 0214 archived VIEWER share: the later class reads, never writes, and a live document is still refused', async () => {
		expect(await gates(nextYear, archivedDoc)).toMatchObject({ role: 'viewer', read: true, write: false });
		const departedConcept = (
			await db.sql<{ id: string }>('select id from public.ideacad_concepts where document_id = $1 limit 1', [archivedDoc])
		).rows[0].id;
		expect(
			await refusal(nextYear, 'public.ideacad_save_concept($1::uuid, $2::jsonb, 99)', [
				departedConcept,
				JSON.stringify({ blade: 'no' })
			])
		).toContain('view-only');
		expect(
			await refusal(teacher, 'public.ideacad_share_document_with_section($1::uuid, $2::uuid)', [bladeDoc, sectionC])
		).toContain('Archive this document first');
		expect((await db.sql('select count(*)::int as n from public.ideacad_section_grants')).rows[0].n).toBe(1);
		// A personal row still beats a class VIEWER row in discovery, as in 0214.
		expect(await call(crossover, 'public.ideacad_shared_with_me($1::uuid)', [itemId])).toEqual([
			expect.objectContaining({ documentId: archivedDoc, role: 'viewer', via: 'person' })
		]);
	});

	it('refuses a class EDIT grant on the archived document, with a reason a surface can show', async () => {
		const answer = await call(teacher, 'public.ideacad_grant_class_edit($1::uuid, $2::uuid)', [archivedDoc, sectionC]);
		expect(answer).toMatchObject({ ok: false, reason: 'archived' });
		expect(await editGrantRows()).toEqual([]);
	});
});

describe('who may grant a class edit access', () => {
	it('refuses a STUDENT owner, a teacher of another class, the wrong class, an unposted class and no class', async () => {
		const cases: Array<[SeededUser, string, string | null, string]> = [
			[owner, bladeDoc, sectionA, 'not_your_class'],
			[otherTeacher, bladeDoc, sectionB, 'not_found'],
			[teacher, bladeDoc, sectionB, 'not_your_class'],
			[teacher, bladeDoc, sectionD, 'not_posted'],
			[teacher, bladeDoc, null, 'no_section'],
			[classmate, directDoc, sectionA, 'not_found'],
			[teacher, randomUUID(), sectionA, 'not_found']
		];
		for (const [who, doc, sectionId, reason] of cases) {
			const answer = await call(who, 'public.ideacad_grant_class_edit($1::uuid, $2::uuid)', [doc, sectionId]);
			expect(answer, `${who.email} on ${sectionId}`).toMatchObject({ ok: false, reason });
			expect(typeof answer.message).toBe('string');
		}
		expect(await editGrantRows()).toEqual([]);
	});

	it('refuses a trashed direct document', async () => {
		const scratch = (await call(teacher, 'public.ideacad_create_direct_document($1, $2)', ['Scratch', KERNEL])).document
			.id;
		await call(teacher, 'public.ideacad_trash_direct_document($1::uuid)', [scratch]);
		expect(await call(teacher, 'public.ideacad_grant_class_edit($1::uuid, $2::uuid)', [scratch, sectionA])).toMatchObject({
			ok: false,
			reason: 'trashed'
		});
	});

	it('admits the class teacher on a blade document and on their own direct document, and counts who it reached', async () => {
		const blade = await call(teacher, 'public.ideacad_grant_class_edit($1::uuid, $2::uuid)', [bladeDoc, sectionA]);
		expect(blade).toMatchObject({ ok: true, grant: { sectionId: sectionA, label: 'Period 1', grantedBy: teacher.email } });
		// classmate, peditor, pviewer, leaver, departed -- the owner is not counted.
		expect(blade.activeStudents).toBe(5);
		const direct = await call(teacher, 'public.ideacad_grant_class_edit($1::uuid, $2::uuid)', [directDoc, sectionA]);
		expect(direct).toMatchObject({ ok: true });
		expect(direct.activeStudents).toBe(6);
		expect((await editGrantRows()).length).toBe(2);
	});

	it('lists the grants to the owner and the teacher, and to nobody else', async () => {
		for (const who of [teacher, owner]) {
			const list = await call(who, 'public.ideacad_class_edit_grants($1::uuid)', [bladeDoc]);
			expect(list.ok).toBe(true);
			expect(list.grants).toHaveLength(1);
			// The SAME count the grant answered (5, owner excluded), under the same key.
			expect(list.grants[0]).toMatchObject({ sectionId: sectionA, label: 'Period 1', activeStudents: 5 });
		}
		for (const who of [classmate, stranger, otherTeacher]) {
			expect(await call(who, 'public.ideacad_class_edit_grants($1::uuid)', [bladeDoc])).toMatchObject({
				ok: false,
				reason: 'not_found'
			});
		}
	});

	it('shows the grant rows through RLS to the reached class and the managers, and not to anybody else', async () => {
		const visible = async (who: SeededUser) =>
			(await db.asUser(who.id, (q) => q('select document_id from public.ideacad_section_edit_grants'))).rows.length;
		expect(await visible(classmate)).toBe(2);
		expect(await visible(teacher)).toBe(2);
		expect(await visible(owner)).toBe(2);
		expect(await visible(stranger)).toBe(0);
		expect(await visible(otherTeacher)).toBe(0);
		expect(await visible(nextYear)).toBe(0);
	});

	it('shows a grant to a class the owner is NOT in to the owner through the manager arm, and counts it the same way twice', async () => {
		// Period 3 is posted and the owner is enrolled only in Period 1, so the
		// only policy arm that can show the owner this row is the document one.
		const granted = await call(teacher, 'public.ideacad_grant_class_edit($1::uuid, $2::uuid)', [bladeDoc, sectionC]);
		expect(granted).toMatchObject({ ok: true, grant: { sectionId: sectionC, label: 'Period 3' } });
		expect(granted.activeStudents).toBe(2); // nextYear, crossover
		const rowsFor = async (who: SeededUser) =>
			(
				await db.asUser(who.id, (q) =>
					q<{ section_id: string }>(
						'select section_id from public.ideacad_section_edit_grants where document_id = $1 order by section_id',
						[bladeDoc]
					)
				)
			).rows.map((r) => r.section_id);
		expect((await rowsFor(owner)).sort()).toEqual([sectionA, sectionC].sort());
		expect(await rowsFor(nextYear)).toEqual([sectionC]);
		expect(await rowsFor(classmate)).toEqual([sectionA]);
		expect(await rowsFor(stranger)).toEqual([]);
		expect(await rowsFor(otherTeacher)).toEqual([]);
		// The list answers each class with the count its grant answered.
		const list = await call(owner, 'public.ideacad_class_edit_grants($1::uuid)', [bladeDoc]);
		expect(list.grants.map((g: { label: string; activeStudents: number }) => [g.label, g.activeStudents])).toEqual([
			['Period 1', 5],
			['Period 3', granted.activeStudents]
		]);
		expect(await call(teacher, 'public.ideacad_revoke_class_edit($1::uuid, $2::uuid)', [bladeDoc, sectionC])).toEqual({
			ok: true,
			removed: 1
		});
		expect((await editGrantRows()).length).toBe(2);
		expect(await gates(nextYear, bladeDoc)).toMatchObject({ write: false });
	});
});

describe('a class editor writes a BLADE document through the first write predicate', () => {
	it('is an editor by the role, and nobody outside the class is', async () => {
		expect(await gates(classmate, bladeDoc)).toMatchObject({
			role: 'editor',
			read: true,
			write: true,
			partWriter: true,
			partOwner: false
		});
		// A personal viewer in the class is LIFTED, never held down (decision 3).
		expect(await gates(pviewer, bladeDoc)).toMatchObject({ role: 'editor', write: true });
		for (const who of [stranger, late, nextYear, otherTeacher]) {
			expect(await gates(who, bladeDoc), who.email).toMatchObject({ write: false, partWriter: false });
		}
	});

	it('runs all seven concept writers and ideacad_apply_actions', async () => {
		expect((await saveBlade(classmate, 'class save')).ok).toBe(true);
		const made = await call(classmate, 'public.ideacad_new_concept($1::uuid, $2, $3::jsonb)', [
			bladeDoc,
			'Class concept',
			JSON.stringify({ blade: 'class' })
		]);
		expect(made.document_id).toBe(bladeDoc);
		expect(
			(await call(classmate, 'public.ideacad_update_concept_meta($1::uuid, $2, $3)', [made.id, 'Renamed', 2])).name
		).toBe('Renamed');
		expect(await call(classmate, 'public.ideacad_set_active($1::uuid, $2::uuid)', [bladeDoc, made.id])).toEqual({
			ok: true
		});
		expect(
			(await call(classmate, "public.ideacad_set_prediction($1::uuid, $2::uuid, 'the class pick')", [bladeDoc, made.id]))
				.predicted_concept_id
		).toBe(made.id);
		expect((await call(classmate, 'public.ideacad_commit_concept($1::uuid)', [made.id])).committed_at).not.toBeNull();
		const next = (await conceptRevision(bladeConcept)) + 1;
		const applied = await call(classmate, 'public.ideacad_apply_actions($1::uuid, $2::jsonb, $3::jsonb, $4)', [
			bladeConcept,
			JSON.stringify([{ kind: 'set', path: '/blade', before: 'class save', after: 'class action' }]),
			JSON.stringify({ blade: 'class action' }),
			next
		]);
		expect(applied).toMatchObject({ ok: true, appended: 1 });
		const actor = await db.sql<{ actor: string }>(
			'select actor from public.ideacad_history where concept_id = $1 order by seq desc limit 1',
			[bladeConcept]
		);
		expect(actor.rows[0].actor).toBe(classmate.email);
		expect(await call(classmate, 'public.ideacad_delete_concept($1::uuid)', [made.id])).toMatchObject({ ok: true });
	});

	it('refuses the same writes to a student outside the class, one not enrolled yet, and the other class', async () => {
		for (const who of [stranger, late, nextYear]) {
			expect(await refusal(who, 'public.ideacad_save_concept($1::uuid, $2::jsonb, 9999)', [
				bladeConcept,
				JSON.stringify({ blade: 'no' })
			]), who.email).toContain('your own concept');
			expect(
				await refusal(who, 'public.ideacad_apply_actions($1::uuid, $2::jsonb, $3::jsonb, 9999)', [
					bladeConcept,
					JSON.stringify([{ kind: 'set', path: '/blade', before: 'x', after: 'y' }]),
					JSON.stringify({ blade: 'y' })
				]),
				who.email
			).toContain('your own concept');
			expect(
				await refusal(who, 'public.ideacad_new_concept($1::uuid, $2, $3::jsonb)', [bladeDoc, 'x', '{}']),
				who.email
			).toContain('your own document');
		}
		// The refused callers left nothing behind.
		expect((await db.sql('select features from public.ideacad_concepts where id = $1', [bladeConcept])).rows[0].features)
			.toEqual({ blade: 'class action' });
	});

	it('is discoverable through ideacad_shared_with_me with the role the gate answers, and the owner does not see their own', async () => {
		const mine = await call(classmate, 'public.ideacad_shared_with_me($1::uuid)', [itemId]);
		expect(mine).toEqual([expect.objectContaining({ documentId: bladeDoc, role: 'editor', via: 'class' })]);
		const lifted = await call(pviewer, 'public.ideacad_shared_with_me($1::uuid)', [itemId]);
		expect(lifted).toEqual([expect.objectContaining({ documentId: bladeDoc, role: 'editor', via: 'class' })]);
		const personal = await call(peditor, 'public.ideacad_shared_with_me($1::uuid)', [itemId]);
		expect(personal).toEqual([expect.objectContaining({ documentId: bladeDoc, role: 'editor', via: 'person' })]);
		expect(await call(owner, 'public.ideacad_shared_with_me($1::uuid)', [itemId])).toEqual([]);
		expect(await call(stranger, 'public.ideacad_shared_with_me($1::uuid)', [itemId])).toEqual([]);
		const opened = await call(classmate, 'public.ideacad_open_shared_document($1::uuid)', [bladeDoc]);
		expect(opened).toMatchObject({ role: 'editor', canWrite: true, archived: false });
	});
});

describe('on an ASSEMBLY a class editor is exactly a personal editor (decision 2)', () => {
	let part1: string, part2: string;

	it('runs the five assembly writes the part-writer predicate admits', async () => {
		const added = await call(owner, 'public.ideacad_add_part($1::uuid, $2, $3::jsonb)', [
			bladeDoc,
			'Shank',
			JSON.stringify({ blade: 'shank' })
		]);
		expect(added.ok).toBe(true);
		part2 = added.partId;
		part1 = (
			await db.sql<{ id: string }>('select id from public.ideacad_parts where document_id = $1 and id <> $2', [
				bladeDoc,
				part2
			])
		).rows[0].id;

		const claimed = await call(classmate, 'public.ideacad_claim_part($1::uuid)', [part2]);
		expect(claimed).toMatchObject({ ok: true, reason: 'claimed', heldBy: classmate.email });
		expect(await call(classmate, 'public.ideacad_beat_part($1::uuid, $2)', [part2, claimed.holdRevision])).toMatchObject({
			ok: true,
			reason: 'beating'
		});
		const concept = await call(classmate, 'public.ideacad_new_part_concept($1::uuid, $2, $3::jsonb)', [
			part2,
			'Class shank',
			JSON.stringify({ blade: 'class shank' })
		]);
		expect(concept.part_id).toBe(part2);
		expect(await call(classmate, 'public.ideacad_set_part_active($1::uuid, $2::uuid)', [part2, concept.id])).toMatchObject({
			ok: true
		});
		expect(await call(classmate, 'public.ideacad_release_part($1::uuid)', [part2])).toMatchObject({
			ok: true,
			reason: 'released'
		});
		const assembly = await call(classmate, 'public.ideacad_assembly($1::uuid)', [bladeDoc]);
		expect(assembly).toMatchObject({ isOwner: false, canWrite: true });
	});

	it('refuses the four assembly-OWNER writes to the class editor and the personal editor alike', async () => {
		const held = await call(owner, 'public.ideacad_claim_part($1::uuid)', [part1]);
		expect(held.ok).toBe(true);
		for (const who of [classmate, peditor]) {
			expect(
				await refusal(who, 'public.ideacad_add_part($1::uuid, $2, $3::jsonb)', [bladeDoc, 'Extra', '{}']),
				who.email
			).toContain('Only the owner');
			expect(
				await refusal(who, 'public.ideacad_update_part_meta($1::uuid, $2, $3)', [part2, 'Renamed', 9]),
				who.email
			).toContain('Only the owner');
			expect(
				await refusal(who, 'public.ideacad_assign_part($1::uuid, $2)', [part1, who.email]),
				who.email
			).toContain('Only the owner');
			expect(await call(who, 'public.ideacad_release_part($1::uuid)', [part1]), who.email).toMatchObject({
				ok: false,
				reason: 'not_yours',
				heldBy: owner.email
			});
		}
		// CONTROL: the owner can do all four.
		expect(await call(owner, 'public.ideacad_update_part_meta($1::uuid, $2, $3)', [part2, 'Shank', 2])).toMatchObject({
			ok: true
		});
		expect(await call(owner, 'public.ideacad_assign_part($1::uuid, $2)', [part1, classmate.email])).toMatchObject({
			ok: true,
			heldBy: classmate.email
		});
		expect(await call(owner, 'public.ideacad_release_part($1::uuid)', [part1])).toMatchObject({ ok: true });
	});

	it('refuses a student outside the class at the claim', async () => {
		expect(await refusal(stranger, 'public.ideacad_claim_part($1::uuid)', [part2])).toContain('not on this assembly');
	});
});

describe('a class editor writes a DIRECT document through the second write predicate', () => {
	it('lists it, opens it as an editor, and saves it', async () => {
		const listed = await call<Array<Record<string, unknown>>>(classmate, 'public.ideacad_direct_documents()');
		expect(listed.find((d) => d.id === directDoc)).toMatchObject({ role: 'editor', canWrite: true, isOwn: false });
		expect(await openDirect(classmate, directDoc)).toMatchObject({ role: 'editor', canWrite: true });
		const saved = await renameDirect(classmate, directDoc, 'Class bracket v2');
		expect(saved).toMatchObject({ ok: true, acceptedRevision: 2 });
		const actor = await db.sql<{ actor: string }>(
			`select h.actor from public.ideacad_history h join public.ideacad_documents d on d.active_concept_id = h.concept_id
			 where d.id = $1 order by h.seq desc limit 1`,
			[directDoc]
		);
		expect(actor.rows[0].actor).toBe(classmate.email);
	});

	it('refuses a student outside the class at the list, the open and the save', async () => {
		const listed = await call<Array<Record<string, unknown>>>(stranger, 'public.ideacad_direct_documents()');
		expect(listed.find((d) => d.id === directDoc)).toBeUndefined();
		expect(await refusal(stranger, 'public.ideacad_open_direct_document($1::uuid)', [directDoc])).toContain(
			'does not exist'
		);
		expect(await refusal(stranger, 'public.ideacad_save_direct_document($1::uuid,1,$2::uuid,$3,$4::jsonb,$5::jsonb,$6::jsonb)', [
			directDoc,
			randomUUID(),
			'x',
			'[]',
			'{}',
			'[]'
		])).toContain('cannot edit');
	});
});

describe('realtime follows the grant with no change of its own', () => {
	it('lets the class editor receive and send on both document channels, and nobody outside the class', async () => {
		for (const doc of [bladeDoc, directDoc]) {
			expect(await realtime(classmate, doc)).toEqual({ receive: true, send: true });
			expect(await realtime(stranger, doc)).toEqual({ receive: false, send: false });
			expect(await realtime(late, doc)).toEqual({ receive: false, send: false });
		}
	});
});

describe('the class is read from the roster at every write', () => {
	it('admits a student who joins the class AFTER the grant, from the statement that enrols them', async () => {
		expect(await refusal(late, 'public.ideacad_save_concept($1::uuid, $2::jsonb, 9999)', [
			bladeConcept,
			JSON.stringify({ blade: 'too early' })
		])).toContain('your own concept');
		await call(teacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [sectionA, late.email, late.email]);
		expect((await saveBlade(late, 'late save')).ok).toBe(true);
		expect(await renameDirect(late, directDoc, 'Late rename')).toMatchObject({ ok: true });
		expect(await realtime(late, directDoc)).toEqual({ receive: true, send: true });
	});

	it('shuts out a student deactivated from the class, from the statement that deactivates them', async () => {
		expect((await saveBlade(leaver, 'before leaving')).ok).toBe(true);
		expect(await renameDirect(leaver, directDoc, 'Before leaving')).toMatchObject({ ok: true });
		await call(teacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, false)', [sectionA, leaver.email, leaver.email]);
		expect(await gates(leaver, bladeDoc)).toMatchObject({ role: null, read: false, write: false, partWriter: false });
		expect(await gates(leaver, directDoc)).toMatchObject({ role: null, direct: false });
		expect(await refusal(leaver, 'public.ideacad_save_concept($1::uuid, $2::jsonb, 9999)', [
			bladeConcept,
			JSON.stringify({ blade: 'after leaving' })
		])).toContain('your own concept');
		expect(await refusal(leaver, 'public.ideacad_open_direct_document($1::uuid)', [directDoc])).toContain('does not exist');
		expect(await realtime(leaver, directDoc)).toEqual({ receive: false, send: false });
		const listed = await call<Array<Record<string, unknown>>>(leaver, 'public.ideacad_direct_documents()');
		expect(listed.find((d) => d.id === directDoc)).toBeUndefined();
	});
});

describe('an archived document keeps the class reading and refuses its writes, and restore keeps the grant', () => {
	it('on the direct document', async () => {
		await call(teacher, 'public.ideacad_set_direct_document_archived($1::uuid, true)', [directDoc]);
		expect(await gates(classmate, directDoc)).toMatchObject({ role: 'editor', read: true, direct: false });
		expect(await refusal(classmate, 'public.ideacad_save_direct_document($1::uuid,1,$2::uuid,$3,$4::jsonb,$5::jsonb,$6::jsonb)', [
			directDoc,
			randomUUID(),
			'x',
			'[]',
			'{}',
			'[]'
		])).toContain('cannot edit');
		await call(teacher, 'public.ideacad_set_direct_document_archived($1::uuid, false)', [directDoc]);
		expect(await gates(classmate, directDoc)).toMatchObject({ role: 'editor', direct: true });
		expect((await editGrantRows()).filter((r) => r.document_id === directDoc)).toHaveLength(1);
	});

	it('on the blade document', async () => {
		await call(teacher, 'public.ideacad_set_document_archived($1::uuid, true)', [bladeDoc]);
		expect(await gates(classmate, bladeDoc)).toMatchObject({ role: 'editor', read: true, write: false, partWriter: false });
		expect(await refusal(classmate, 'public.ideacad_save_concept($1::uuid, $2::jsonb, 9999)', [
			bladeConcept,
			JSON.stringify({ blade: 'archived' })
		])).toContain('your own concept');
		await call(teacher, 'public.ideacad_set_document_archived($1::uuid, false)', [bladeDoc]);
		expect(await gates(classmate, bladeDoc)).toMatchObject({ write: true });
		expect((await editGrantRows()).filter((r) => r.document_id === bladeDoc)).toHaveLength(1);
	});
});

describe('who may revoke', () => {
	it('refuses a class editor, a stranger and a teacher of another class, and removes nothing', async () => {
		for (const who of [classmate, stranger, otherTeacher]) {
			expect(await call(who, 'public.ideacad_revoke_class_edit($1::uuid, $2::uuid)', [bladeDoc, sectionA]), who.email)
				.toMatchObject({ ok: false, reason: 'not_found' });
		}
		expect(await editGrantRows()).toHaveLength(2);
	});

	it('lets the student OWNER take their class off, and the class stops writing at once', async () => {
		expect(await call(owner, 'public.ideacad_revoke_class_edit($1::uuid, $2::uuid)', [bladeDoc, sectionA])).toEqual({
			ok: true,
			removed: 1
		});
		expect(await gates(classmate, bladeDoc)).toMatchObject({ role: null, write: false });
		// The personal grants are the owner's own and did not move.
		expect(await gates(pviewer, bladeDoc)).toMatchObject({ role: 'viewer', write: false });
		expect(await gates(peditor, bladeDoc)).toMatchObject({ role: 'editor', write: true });
		// Removing what is not there is not an error.
		expect(await call(owner, 'public.ideacad_revoke_class_edit($1::uuid, $2::uuid)', [bladeDoc, sectionA])).toEqual({
			ok: true,
			removed: 0
		});
	});

	it('lets the teacher of the class revoke, and re-grant', async () => {
		expect(await call(teacher, 'public.ideacad_revoke_class_edit($1::uuid, $2::uuid)', [directDoc, sectionA])).toEqual({
			ok: true,
			removed: 1
		});
		expect(await gates(classmate, directDoc)).toMatchObject({ role: null, direct: false });
		for (const doc of [bladeDoc, directDoc]) {
			expect(await call(teacher, 'public.ideacad_grant_class_edit($1::uuid, $2::uuid)', [doc, sectionA])).toMatchObject({
				ok: true
			});
		}
		expect(await gates(classmate, directDoc)).toMatchObject({ role: 'editor', direct: true });
	});
});

describe('anon reaches none of it, and the grants are what 0166 says', () => {
	it('anon cannot execute any new function, and authenticated can', async () => {
		for (const signature of NEW_FUNCTIONS) {
			const { rows } = await db.sql<{ anon: boolean; authed: boolean }>(
				`select has_function_privilege('anon', $1, 'execute') as anon,
				        has_function_privilege('authenticated', $1, 'execute') as authed`,
				[signature]
			);
			expect(rows[0], signature).toEqual({ anon: false, authed: true });
		}
		const helper = await db.sql<{ anon: boolean; authed: boolean; service: boolean }>(
			`select has_function_privilege('anon', $1, 'execute') as anon,
			        has_function_privilege('authenticated', $1, 'execute') as authed,
			        has_function_privilege('service_role', $1, 'execute') as service`,
			[REACH_HELPER]
		);
		expect(helper.rows[0]).toEqual({ anon: false, authed: false, service: false });
		const control = await db.sql<{ anon: boolean }>(
			`select has_function_privilege('anon', 'public.app_short_link_target(text)', 'execute') as anon`
		);
		expect(control.rows[0].anon).toBe(true);
		for (const expression of [
			'public.ideacad_grant_class_edit($1::uuid, $1::uuid)',
			'public.ideacad_revoke_class_edit($1::uuid, $1::uuid)',
			'public.ideacad_class_edit_grants($1::uuid)'
		]) {
			await expect(db.asAnon((q) => q(`select ${expression}`, [bladeDoc]))).rejects.toThrow('permission denied');
		}
	});

	it('the table holds authenticated SELECT and nothing else, for anybody', async () => {
		const { rows } = await db.sql<{ role: string; priv: string }>(
			`select r.role, p.priv
			 from (values ('anon'), ('authenticated'), ('service_role')) r(role)
			 cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
			 where has_table_privilege(r.role, 'public.ideacad_section_edit_grants', p.priv)`
		);
		expect(rows).toEqual([{ role: 'authenticated', priv: 'SELECT' }]);
		await expect(
			db.asUser(classmate.id, (q) =>
				q('insert into public.ideacad_section_edit_grants (document_id, section_id, granted_by) values ($1, $2, $3)', [
					bladeDoc,
					sectionD,
					classmate.email
				])
			)
		).rejects.toThrow('permission denied');
	});
});

describe('a second paste changes nothing', () => {
	it('re-applies cleanly and every answer, row and function is where it was', async () => {
		const rowsBefore = await editGrantRows();
		const answersBefore = await corpus();
		const srcBefore = (await db.sql(`select prosrc from pg_proc where oid = 'public._ideacad_document_role(uuid)'::regprocedure`))
			.rows[0].prosrc;
		await db.sql(PROPOSED_SQL);
		expect(await editGrantRows()).toEqual(rowsBefore);
		expect(await corpus()).toEqual(answersBefore);
		expect(
			(await db.sql(`select prosrc from pg_proc where oid = 'public._ideacad_document_role(uuid)'::regprocedure`)).rows[0]
				.prosrc
		).toBe(srcBefore);
		const arity = await db.sql<{ proname: string; n: number }>(
			`select p.proname, count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public' and p.proname in
			   ('_ideacad_document_role', 'ideacad_shared_with_me', '_ideacad_class_edit_reach',
			    'ideacad_grant_class_edit', 'ideacad_revoke_class_edit', 'ideacad_class_edit_grants')
			 group by p.proname order by p.proname`
		);
		expect(arity.rows).toEqual([
			{ proname: '_ideacad_class_edit_reach', n: 1 },
			{ proname: '_ideacad_document_role', n: 1 },
			{ proname: 'ideacad_class_edit_grants', n: 1 },
			{ proname: 'ideacad_grant_class_edit', n: 1 },
			{ proname: 'ideacad_revoke_class_edit', n: 1 },
			{ proname: 'ideacad_shared_with_me', n: 1 }
		]);
		const policies = await db.sql(
			`select policyname from pg_policies where schemaname = 'public' and tablename = 'ideacad_section_edit_grants'`
		);
		expect(policies.rows).toHaveLength(1);
	});
});

describe('the undo takes 0229 back out, and only 0229', () => {
	it('restores every function in public to its pre-0229 source and ACL, drops the table, re-pastes cleanly, and 0229 applies again after it', async () => {
		// The control: with 0229 applied the snapshot differs from the one taken
		// before it, so an equality below cannot be a comparison of two nothings.
		const applied = await publicFunctions();
		expect(applied).not.toEqual(functionsBefore);
		expect(Object.keys(functionsBefore).length).toBeGreaterThan(100);

		await db.sql(UNDO_SQL);
		expect(await publicFunctions()).toEqual(functionsBefore);
		const table = await db.sql<{ t: string | null }>(`select to_regclass('public.ideacad_section_edit_grants')::text as t`);
		expect(table.rows[0].t).toBeNull();
		// 0214's viewer share lives in its own table and is untouched.
		expect((await db.sql('select count(*)::int as n from public.ideacad_section_grants')).rows[0].n).toBe(1);
		// A class editor is nobody's editor any more; a personal editor still is.
		expect(await gates(classmate, bladeDoc)).toMatchObject({ role: null, write: false });
		expect(await gates(peditor, bladeDoc)).toMatchObject({ role: 'editor', write: true });

		await db.sql(UNDO_SQL);
		expect(await publicFunctions()).toEqual(functionsBefore);

		await db.sql(PROPOSED_SQL);
		expect(await publicFunctions()).toEqual(applied);
		expect(await editGrantRows()).toEqual([]);
	});
});
