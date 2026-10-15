// tests/db/cert-0260-engine.test.ts
//
// 0260, the certification ENGINE, on the whole tree with the five cert files
// applied. Every claim here would fail SILENTLY in use:
//
//   - a client reaching a table directly, or anon reaching a function;
//   - a non-admin saving, publishing, hiding, retiring or deleting a
//     certification, or granting authority ("not found", never a hint);
//   - a draft reaching the catalog or a student's cert_get;
//   - a package the shape check should fault being saved, or an incomplete
//     kit publishing;
//   - the pool's answer keys reaching anybody but an admin's pool editor;
//   - the slug reservation drifting from the TypeScript mirror.
//
// Every absence sits beside the presence that proves the instrument saw the
// data (CLAUDE.md, "Keep the suite honest").

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { startTestDb, type TestDb } from './harness';
import {
	CERT_FILES, WITH_CERT, certSql, pasteTrap, catalogFingerprint, procCount, tableSurface,
	rpcAs, rpcAnon, seedPeople, samplePackage, samplePool, publishSample, type CertPeople, type Json
} from './cert-chain';

const FILE = CERT_FILES[0];
const SQL = certSql(FILE);

/** Written out rather than read from the file: a test whose expected value comes from the file cannot fail. */
const TABLES = ['cert_settings', 'cert_certifications', 'cert_revisions', 'cert_prerequisites', 'cert_lessons', 'cert_exam_questions', 'cert_authority', 'cert_events'];
const CLIENT_FUNCTIONS = [
	'cert_is_certifier()', 'cert_my_authority()', 'cert_settings()', 'cert_settings_set(jsonb)', 'cert_catalog()', 'cert_get(text)',
	'cert_admin_list()', 'cert_admin_get(uuid)', 'cert_admin_save(uuid, jsonb, text)', 'cert_admin_publish(uuid)', 'cert_admin_hide(uuid)',
	'cert_admin_retire(uuid)', 'cert_admin_delete(uuid)', 'cert_lesson_save(uuid, text, text, text, jsonb)', 'cert_lesson_delete(uuid, text)',
	'cert_lesson_document(uuid)', 'cert_exam_pool_get(uuid)', 'cert_exam_pool_replace(uuid, jsonb)', 'cert_authority_list()',
	'cert_authority_grant(uuid, text, text)', 'cert_authority_revoke(uuid, text)'
];
const PRIVATE_FUNCTIONS = [
	'_cert_caller()', '_cert_norm(text)', '_cert_refuse(text, text)', '_cert_jt(jsonb, text)', '_cert_jint(jsonb)', '_cert_can_certify(uuid)',
	'_cert_is_certifier()', '_cert_event(text, text, text, uuid, uuid, jsonb, text)', '_cert_person_name(text)',
	'_cert_question_check(jsonb, text)', '_cert_project_check(jsonb, text, boolean)', '_cert_package_check(jsonb)',
	'_cert_publish_check(uuid)', '_cert_summary_json(uuid, text)'
];

let db: TestDb;
let people: CertPeople;

beforeAll(async () => {
	expect(FILE).toMatch(/^0260_/);
	db = await startTestDb(WITH_CERT);
	people = await seedPeople(db);
}, 600_000);

afterAll(async () => {
	await db?.stop();
});

const rpc = <T = Json>(user: { id: string }, call: string, params: unknown[] = []) => rpcAs<T>(db, user as never, call, params);

// ===========================================================================
describe('the file', () => {
	test('no paste trap, and the check finds a planted one', () => {
		expect(pasteTrap(SQL)).toEqual([]);
		expect(pasteTrap('select 1; -- a $tag$ in a comment\n')).toHaveLength(1);
	});

	test('the apply tool would send it: no refusal and no top-level DML, against a planted insert', () => {
		const scan = scanFile(SQL);
		expect(scan.findings).toEqual([]);
		expect(scan.selfManagedTransaction).toBe(false);
		expect(scan.statements).toBeGreaterThan(80);
		expect(scanFile('insert into public.cert_settings (id) values (true);').findings).toHaveLength(1);
	});

	test('the first object it creates is cert_settings, a table no earlier migration made (the deploy probe keys on it)', () => {
		const code = SQL.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
		const first = code.match(/create\s+(?:table|function|or replace function|index|unique index|type|view)\s+(?:if not exists\s+)?([\w.]+)/i);
		expect(first?.[1]).toBe('public.cert_settings');
	});

	test('the header names an undo for every table and function it creates', () => {
		const head = SQL.slice(0, SQL.indexOf('-- ===== PART A BEGIN ====='));
		expect(head).toContain('UNDO');
		for (const t of TABLES) expect(head, t).toContain(`drop table if exists public.${t};`);
		for (const f of [...CLIENT_FUNCTIONS, ...PRIVATE_FUNCTIONS]) expect(head, f).toContain(`drop function if exists public.${f};`);
	});

	test('every function it creates exists exactly once (no stray overload)', async () => {
		for (const f of [...CLIENT_FUNCTIONS, ...PRIVATE_FUNCTIONS]) {
			expect(await procCount(db, f.slice(0, f.indexOf('('))), f).toBe(1);
		}
	});

	test('re-applying the file over itself changes no catalog object', async () => {
		const before = await catalogFingerprint(db);
		await db.sql(SQL);
		expect(await catalogFingerprint(db)).toBe(before);
	});
});

// ===========================================================================
describe('the surface', () => {
	test('every table has row level security and no privilege for anon or authenticated', async () => {
		for (const t of TABLES) {
			const s = await tableSurface(db, t);
			expect(s.rls, t).toBe(true);
			expect(s.grants, t).toEqual([]);
		}
		// Positive control: the instrument sees a grant where one exists.
		expect((await tableSurface(db, 'profiles')).grants).toContain('authenticated:SELECT');
	});

	test('anon can execute none of the engine functions; authenticated can execute the client ones and none of the private ones', async () => {
		for (const f of CLIENT_FUNCTIONS) {
			const { rows } = await db.sql<{ a: boolean; b: boolean }>(
				`select has_function_privilege('anon', $1, 'execute') as a, has_function_privilege('authenticated', $1, 'execute') as b`,
				[`public.${f}`]
			);
			expect(rows[0], f).toEqual({ a: false, b: true });
		}
		for (const f of PRIVATE_FUNCTIONS) {
			const { rows } = await db.sql<{ a: boolean; b: boolean }>(
				`select has_function_privilege('anon', $1, 'execute') as a, has_function_privilege('authenticated', $1, 'execute') as b`,
				[`public.${f}`]
			);
			expect(rows[0], f).toEqual({ a: false, b: false });
		}
	});

	test('a signed-out request is refused at the grant, and a client cannot read a table', async () => {
		await expect(rpcAnon(db, 'public.cert_catalog()')).rejects.toThrow(/permission denied/i);
		await expect(rpcAnon(db, 'public.cert_settings()')).rejects.toThrow(/permission denied/i);
		await expect(db.asUser(people.ana.id, (q) => q('select * from public.cert_exam_questions'))).rejects.toThrow(/permission denied/i);
		await expect(db.asUser(people.admin.id, (q) => q('select * from public.cert_certifications'))).rejects.toThrow(/permission denied/i);
	});
});

// ===========================================================================
describe('settings', () => {
	test('the one row is seeded with the defaults and anyone signed in reads it', async () => {
		expect(await rpc(people.ana, 'public.cert_settings()')).toEqual({
			school_year_expiry: null, dormancy_days: 60, checkin_timeout_seconds: 60, release_window_minutes: 10
		});
	});

	test('only an admin writes it, ranges are checked, and the event is logged', async () => {
		expect(await rpc(people.ana, `public.cert_settings_set('{"dormancy_days": 30}'::jsonb)`)).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.certifier, `public.cert_settings_set('{"dormancy_days": 30}'::jsonb)`)).toMatchObject({ ok: false, reason: 'not_found' });
		const bad = await rpc(people.admin, `public.cert_settings_set('{"dormancy_days": 0, "release_window_minutes": 500, "school_year_expiry": "yesterday"}'::jsonb)`);
		expect(bad).toMatchObject({ ok: false, reason: 'invalid' });
		expect((bad.problems as string[]).length).toBe(3);
		const ok = await rpc(people.admin, `public.cert_settings_set('{"dormancy_days": 45, "school_year_expiry": "2027-08-16"}'::jsonb)`);
		expect(ok).toMatchObject({ ok: true, dormancy_days: 45, school_year_expiry: '2027-08-16', release_window_minutes: 10 });
		expect(await rpc(people.ana, 'public.cert_settings()')).toMatchObject({ dormancy_days: 45 });
		const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from public.cert_events where kind = 'settings.changed'`);
		expect(rows[0].n).toBe(1);
	});
});

// ===========================================================================
describe('saving, publishing and the catalog', () => {
	let draftId: string;

	test('a non-admin cannot save, and a bad package is refused with every problem named', async () => {
		expect(await rpc(people.certifier, 'public.cert_admin_save(null, $1::jsonb, null)', [JSON.stringify(samplePackage('X-1'))])).toMatchObject({ ok: false, reason: 'not_found' });
		const bad = await rpc(people.admin, 'public.cert_admin_save(null, $1::jsonb, null)', [
			JSON.stringify(samplePackage('bad code!', { level: 12, prerequisites: ['NOPE-9'], exam: { time_limit_minutes: 30, questions_per_exam: 1, topics: [{ id: 'a', name: 'A', minimum: 1 }, { id: 'a', name: 'B', minimum: 1 }] } }))
		]);
		expect(bad).toMatchObject({ ok: false, reason: 'invalid' });
		const problems = bad.problems as string[];
		expect(problems.some((p) => p.startsWith('code:'))).toBe(true);
		expect(problems.some((p) => p.startsWith('level:'))).toBe(true);
		expect(problems.some((p) => p.includes('unknown code NOPE-9'))).toBe(true);
		expect(problems.some((p) => p.includes('duplicate id a'))).toBe(true);
		expect(problems.some((p) => p.includes('minimums add up'))).toBe(true);
		const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from public.cert_certifications`);
		expect(rows[0].n).toBe(0);
	});

	test('a sound package becomes a draft with revision 1, prerequisites rewritten, and the code normalized', async () => {
		const prereq = await publishSample(db, people, 'SAFE-1', { grant: false });
		const saved = await rpc(people.admin, 'public.cert_admin_save(null, $1::jsonb, $2)', [
			JSON.stringify(samplePackage(' mill-1 ', { prerequisites: ['safe-1'], sort_order: 20, category: 'Machining' })),
			'first draft'
		]);
		expect(saved).toMatchObject({ ok: true, revision: 1 });
		draftId = saved.id as string;
		expect((saved.publish_problems as string[]).length).toBeGreaterThan(0);
		const { rows } = await db.sql<{ code: string; state: string; requires_id: string }>(
			`select c.code, c.state, p.requires_id from public.cert_certifications c left join public.cert_prerequisites p on p.certification_id = c.id where c.id = $1`,
			[draftId]
		);
		expect(rows).toEqual([{ code: 'MILL-1', state: 'draft', requires_id: prereq.id }]);
		expect(await rpc(people.admin, 'public.cert_admin_save(null, $1::jsonb, null)', [JSON.stringify(samplePackage('MILL-1'))])).toMatchObject({ ok: false, reason: 'code_taken' });
	});

	test('a draft is absent from a student catalog and cert_get, present in the admin list; publishing an incomplete kit is refused', async () => {
		const catalog = await rpc<Json[]>(people.ana, 'public.cert_catalog()');
		expect(catalog.map((c) => c.code)).toEqual(['SAFE-1']);
		expect(await rpc(people.ana, `public.cert_get('MILL-1')`)).toBeNull();
		expect(await rpc(people.ana, `public.cert_get('mill-1')`)).toBeNull();
		const list = await rpc<Json[]>(people.admin, 'public.cert_admin_list()');
		expect(list.map((c) => c.code).sort()).toEqual(['MILL-1', 'SAFE-1']);
		expect(await rpc(people.ana, 'public.cert_admin_list()')).toMatchObject({ ok: false, reason: 'not_found' });
		const publish = await rpc(people.admin, 'public.cert_admin_publish($1::uuid)', [draftId]);
		expect(publish).toMatchObject({ ok: false, reason: 'incomplete' });
		expect((publish.problems as string[]).some((p) => p.startsWith('exam pool:'))).toBe(true);
		expect(await rpc(people.certifier, 'public.cert_admin_publish($1::uuid)', [draftId])).toMatchObject({ ok: false, reason: 'not_found' });
	});

	test('the pool is validated against the current topics and replaced whole; absent rows go inactive, never away', async () => {
		const badTopic = await rpc(people.admin, 'public.cert_exam_pool_replace($1::uuid, $2::jsonb)', [draftId, JSON.stringify([{ topic: 'nope', type: 'short', prompt: 'x', answer: { accept: ['y'] } }])]);
		expect(badTopic).toMatchObject({ ok: false, reason: 'invalid' });
		expect((badTopic.problems as string[])[0]).toContain('not a topic');
		const badKey = await rpc(people.admin, 'public.cert_exam_pool_replace($1::uuid, $2::jsonb)', [draftId, JSON.stringify([{ topic: 'ppe', type: 'multiple_choice', prompt: 'x', options: [{ key: 'a', text: 'a' }, { key: 'a', text: 'b' }], answer: 'z' }])]);
		expect((badKey.problems as string[]).join(' ')).toMatch(/duplicate key a/);
		expect((badKey.problems as string[]).join(' ')).toMatch(/one of the option keys/);
		expect(await rpc(people.certifier, 'public.cert_exam_pool_replace($1::uuid, $2::jsonb)', [draftId, JSON.stringify(samplePool())])).toMatchObject({ ok: false, reason: 'not_found' });

		const first = await rpc(people.admin, 'public.cert_exam_pool_replace($1::uuid, $2::jsonb)', [draftId, JSON.stringify(samplePool(2))]);
		expect(first).toMatchObject({ ok: true, total: 4, by_topic: { ppe: 2, stops: 2 }, publish_problems: [] });
		const pool = await rpc<Json[]>(people.admin, 'public.cert_exam_pool_get($1::uuid)', [draftId]);
		expect(pool).toHaveLength(4);
		expect(pool.every((q) => 'answer' in q)).toBe(true);
		// Replace keeping two by id: the other two are deactivated, not deleted.
		const keep = pool.slice(0, 2).map((q) => ({ ...q, prompt: `${q.prompt} edited` }));
		const second = await rpc(people.admin, 'public.cert_exam_pool_replace($1::uuid, $2::jsonb)', [draftId, JSON.stringify([...keep, ...samplePool(2)])]);
		expect(second).toMatchObject({ ok: true, total: 6 });
		const { rows } = await db.sql<{ n: number; active: number }>(`select count(*)::int as n, count(*) filter (where active)::int as active from public.cert_exam_questions where certification_id = $1`, [draftId]);
		expect(rows[0]).toEqual({ n: 8, active: 6 });
		// The key reader is the admin's alone.
		expect(await rpc(people.certifier, 'public.cert_exam_pool_get($1::uuid)', [draftId])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.ana, 'public.cert_exam_pool_get($1::uuid)', [draftId])).toMatchObject({ ok: false, reason: 'not_found' });
	});

	test('publishing lands, cert_get carries the package but never a question, and a new revision keeps the old one', async () => {
		expect(await rpc(people.admin, 'public.cert_admin_publish($1::uuid)', [draftId])).toEqual({ ok: true, notify: [], sync: true });
		const got = await rpc(people.ana, `public.cert_get('mill-1')`);
		expect(got).toMatchObject({ code: 'MILL-1', state: 'published', holders_count: 0, my: { state: 'none', held: false } });
		expect((got.prerequisites as Json[])[0]).toMatchObject({ code: 'SAFE-1', held: false });
		expect(JSON.stringify(got)).not.toMatch(/"accept"|"answer":\s*"a"|e-stop/);
		expect((got.package as Json).exam).toMatchObject({ questions_per_exam: 2 });
		const saved = await rpc(people.admin, 'public.cert_admin_save($1::uuid, $2::jsonb, $3)', [draftId, JSON.stringify(samplePackage('MILL-1', { prerequisites: ['SAFE-1'], name: 'Manual Mill Level 1', sort_order: 20, category: 'Machining' })), 'rename']);
		expect(saved).toMatchObject({ ok: true, revision: 2 });
		const admin = await rpc(people.admin, 'public.cert_admin_get($1::uuid)', [draftId]);
		expect((admin.revisions as Json[]).map((r) => r.revision)).toEqual([2, 1]);
		expect(admin.name).toBe('Manual Mill Level 1');
		// The two kept rows were both PPE (the pool reader orders by topic), plus a fresh 2 + 2.
		expect(admin.pool_summary).toEqual({ total: 6, by_topic: { ppe: 4, stops: 2 } });
		expect(admin.authority).toEqual([]);
		// The code is locked once published.
		expect(await rpc(people.admin, 'public.cert_admin_save($1::uuid, $2::jsonb, null)', [draftId, JSON.stringify(samplePackage('MILL-2', { prerequisites: ['SAFE-1'] }))])).toMatchObject({ ok: false, reason: 'code_locked' });
		// A certifier reads the admin view of a certification they certify, without the authority list.
		await rpc(people.admin, 'public.cert_authority_grant($1::uuid, $2, $3)', [draftId, people.certifier.email, 'mill lead']);
		const asCertifier = await rpc(people.certifier, 'public.cert_admin_get($1::uuid)', [draftId]);
		expect(asCertifier.code).toBe('MILL-1');
		expect(asCertifier.authority).toBeNull();
		expect(await rpc(people.bystander, 'public.cert_admin_get($1::uuid)', [draftId])).toMatchObject({ ok: false, reason: 'not_found' });
	});

	test('hide goes back to draft only while nothing hangs off it; retire is final for new starts; delete only a never-published draft', async () => {
		expect(await rpc(people.certifier, 'public.cert_admin_hide($1::uuid)', [draftId])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.admin, 'public.cert_admin_hide($1::uuid)', [draftId])).toMatchObject({ ok: true });
		expect((await rpc<Json[]>(people.ana, 'public.cert_catalog()')).map((c) => c.code)).toEqual(['SAFE-1']);
		expect(await rpc(people.admin, 'public.cert_admin_retire($1::uuid)', [draftId])).toMatchObject({ ok: false, reason: 'not_published' });
		// Once published it is never deletable, even hidden back to draft.
		expect(await rpc(people.admin, 'public.cert_admin_delete($1::uuid)', [draftId])).toMatchObject({ ok: false, reason: 'not_deletable' });
		expect(await rpc(people.admin, 'public.cert_admin_publish($1::uuid)', [draftId])).toMatchObject({ ok: true });
		// A start makes it un-hideable.
		expect(await rpc(people.ana, `public.cert_start('SAFE-1')`)).toMatchObject({ ok: true });
		const safeId = (await db.sql<{ id: string }>(`select id from public.cert_certifications where code = 'SAFE-1'`)).rows[0].id;
		const hide = await rpc(people.admin, 'public.cert_admin_hide($1::uuid)', [safeId]);
		expect(hide).toMatchObject({ ok: false, reason: 'in_use', active_attempts: 1, awards: 0 });
		expect(await rpc(people.admin, 'public.cert_admin_retire($1::uuid)', [safeId])).toEqual({ ok: true, sync: true });
		expect(await rpc(people.ana, `public.cert_get('SAFE-1')`)).toBeNull();
		expect((await rpc(people.admin, `public.cert_get('SAFE-1')`)).state).toBe('retired');
		expect(await rpc(people.ben, `public.cert_start('SAFE-1')`)).toMatchObject({ ok: false, reason: 'retired' });
		// A fresh draft nobody published deletes with its revisions and pool.
		const scratch = await rpc(people.admin, 'public.cert_admin_save(null, $1::jsonb, null)', [JSON.stringify(samplePackage('TMP-1'))]);
		await rpc(people.admin, 'public.cert_exam_pool_replace($1::uuid, $2::jsonb)', [scratch.id, JSON.stringify(samplePool())]);
		expect(await rpc(people.certifier, 'public.cert_admin_delete($1::uuid)', [scratch.id])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.admin, 'public.cert_admin_delete($1::uuid)', [scratch.id])).toEqual({ ok: true });
		const { rows } = await db.sql<{ c: number; r: number; q: number }>(
			`select (select count(*) from public.cert_certifications where code = 'TMP-1')::int as c,
				(select count(*) from public.cert_revisions where certification_id = $1)::int as r,
				(select count(*) from public.cert_exam_questions where certification_id = $1)::int as q`,
			[scratch.id]
		);
		expect(rows[0]).toEqual({ c: 0, r: 0, q: 0 });
	});
});

// ===========================================================================
describe('lessons', () => {
	let certId: string;
	beforeAll(async () => {
		certId = (await db.sql<{ id: string }>(`select id from public.cert_certifications where code = 'MILL-1'`)).rows[0].id;
	});

	test('an admin upserts by slug; a student reads a published certification lesson; a draft lesson is a certifier read only', async () => {
		expect(await rpc(people.certifier, `public.cert_lesson_save($1::uuid, 'tramming', 'Tramming', '<p>x</p>', '{}'::jsonb)`, [certId])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.admin, `public.cert_lesson_save($1::uuid, 'Bad Slug', 'Tramming', '<p>x</p>', '{}'::jsonb)`, [certId])).toMatchObject({ ok: false, reason: 'invalid' });
		expect(await rpc(people.admin, `public.cert_lesson_save($1::uuid, 'tramming', 'Tramming', '<p>x</p>', '[]'::jsonb)`, [certId])).toMatchObject({ ok: false, reason: 'invalid' });
		const saved = await rpc(people.admin, `public.cert_lesson_save($1::uuid, 'tramming', 'Tramming', '<p>one</p>', '{}'::jsonb)`, [certId]);
		expect(saved).toMatchObject({ ok: true });
		const again = await rpc(people.admin, `public.cert_lesson_save($1::uuid, 'tramming', 'Tramming the head', '<p>two</p>', '{"blocks": []}'::jsonb)`, [certId]);
		expect(again.id).toBe(saved.id);
		const doc = await rpc(people.ana, 'public.cert_lesson_document($1::uuid)', [saved.id]);
		expect(doc).toMatchObject({ title: 'Tramming the head', document: '<p>two</p>', manifest: { blocks: [] } });
		expect((await rpc(people.ana, `public.cert_get('MILL-1')`)).lessons).toEqual([{ id: saved.id, slug: 'tramming', title: 'Tramming the head' }]);
		// Back to a draft (no attempts on MILL-1): the student gets null, the certifier the document.
		await rpc(people.admin, 'public.cert_admin_hide($1::uuid)', [certId]);
		expect(await rpc(people.ana, 'public.cert_lesson_document($1::uuid)', [saved.id])).toBeNull();
		expect((await rpc(people.certifier, 'public.cert_lesson_document($1::uuid)', [saved.id])).title).toBe('Tramming the head');
		expect(await rpc(people.ana, 'public.cert_lesson_document($1::uuid)', ['00000000-0000-0000-0000-000000000000'])).toBeNull();
	});

	test('a lesson the current revision names cannot be deleted; publishing needs its document', async () => {
		const withLesson = samplePackage('MILL-1', {
			prerequisites: ['SAFE-1'], sort_order: 20, category: 'Machining',
			training: { items: [{ kind: 'lesson', key: 'lesson:tramming', title: 'Tramming', slug: 'tramming' }, { kind: 'lesson', key: 'lesson:missing', title: 'Missing', slug: 'missing' }], quick_checks: [] }
		});
		expect(await rpc(people.admin, 'public.cert_admin_save($1::uuid, $2::jsonb, null)', [certId, JSON.stringify(withLesson)])).toMatchObject({ ok: true, revision: 3 });
		expect(await rpc(people.admin, `public.cert_lesson_delete($1::uuid, 'tramming')`, [certId])).toMatchObject({ ok: false, reason: 'in_use' });
		const publish = await rpc(people.admin, 'public.cert_admin_publish($1::uuid)', [certId]);
		expect(publish).toMatchObject({ ok: false, reason: 'incomplete' });
		expect((publish.problems as string[])).toEqual(['training: lesson missing has no document yet']);
		await rpc(people.admin, `public.cert_lesson_save($1::uuid, 'missing', 'Found', '<p>m</p>', '{}'::jsonb)`, [certId]);
		expect(await rpc(people.admin, 'public.cert_admin_publish($1::uuid)', [certId])).toMatchObject({ ok: true });
		expect(await rpc(people.admin, `public.cert_lesson_delete($1::uuid, 'nope')`, [certId])).toMatchObject({ ok: false, reason: 'not_found' });
	});
});

// ===========================================================================
describe('authority', () => {
	let certId: string;
	beforeAll(async () => {
		certId = (await db.sql<{ id: string }>(`select id from public.cert_certifications where code = 'MILL-1'`)).rows[0].id;
	});

	test('a grant is admin-only, Bosco Tech only, whole, and revocable; the predicates answer both ways', async () => {
		expect(await rpc(people.certifier, 'public.cert_authority_grant($1::uuid, $2, null)', [certId, people.ben.email])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.admin, `public.cert_authority_grant($1::uuid, 'someone@gmail.com', null)`, [certId])).toMatchObject({ ok: false, reason: 'invalid' });
		expect(await rpc(people.ben, 'public.cert_is_certifier()')).toBe(false);
		expect(await rpc(people.ben, 'public.cert_my_authority()')).toEqual({ admin: false, certifications: [] });
		expect(await rpc(people.admin, `public.cert_authority_grant($1::uuid, ' Ben@BoscoTech.net ', 'student lead')`, [certId])).toEqual({ ok: true });
		expect(await rpc(people.ben, 'public.cert_is_certifier()')).toBe(true);
		expect(await rpc(people.certifier, 'public.cert_is_certifier()')).toBe(true);
		expect(await rpc(people.bystander, 'public.cert_is_certifier()')).toBe(false);
		const mine = await rpc(people.ben, 'public.cert_my_authority()');
		expect(mine).toMatchObject({ admin: false });
		expect((mine.certifications as Json[]).map((c) => c.code)).toEqual(['MILL-1']);
		const adminView = await rpc(people.admin, 'public.cert_my_authority()');
		expect(adminView.admin).toBe(true);
		expect((adminView.certifications as Json[]).map((c) => c.code).sort()).toEqual(['MILL-1', 'SAFE-1']);
		const list = await rpc<Json[]>(people.admin, 'public.cert_authority_list()');
		expect(list.map((r) => `${r.code}:${r.email}`).sort()).toEqual(['MILL-1:ben@boscotech.net', 'MILL-1:cert@boscotech.edu']);
		expect(list.find((r) => r.email === people.ben.email)?.person_name).toBe('Ben Ortiz');
		expect(await rpc(people.certifier, 'public.cert_authority_list()')).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.admin, 'public.cert_authority_revoke($1::uuid, $2)', [certId, people.ben.email])).toEqual({ ok: true });
		expect(await rpc(people.admin, 'public.cert_authority_revoke($1::uuid, $2)', [certId, people.ben.email])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await rpc(people.ben, 'public.cert_is_certifier()')).toBe(false);
		const { rows } = await db.sql<{ kinds: string[] }>(`select array_agg(kind order by id) as kinds from public.cert_events where kind like 'authority.%'`);
		// Two grants in this file: the certifier on MILL-1 (publishing) and Ben here.
		expect(rows[0].kinds.filter((k) => k === 'authority.granted').length).toBe(2);
		expect(rows[0].kinds.filter((k) => k === 'authority.revoked').length).toBe(1);
	});

	test('a person is named by display_name, else full_name, never the address', async () => {
		const { rows: before } = await db.sql<{ n: string }>(`select public._cert_person_name($1) as n`, [people.ana.email]);
		expect(before[0].n).toBe('Ana Reyes');
		await db.sql(`update public.profiles set display_name = 'Reyes A.' where id = $1`, [people.ana.id]);
		const { rows: after } = await db.sql<{ n: string }>(`select public._cert_person_name($1) as n`, ['ANA@boscotech.net']);
		expect(after[0].n).toBe('Reyes A.');
		await db.sql(`update public.profiles set display_name = null where id = $1`, [people.ana.id]);
		const nobody = await createUserNoName();
		const { rows: none } = await db.sql<{ n: string | null }>(`select public._cert_person_name($1) as n`, [nobody]);
		expect(none[0].n).toBeNull();
	});
});

async function createUserNoName(): Promise<string> {
	const email = 'noname@boscotech.net';
	await db.sql(`insert into auth.users (email, raw_user_meta_data) values ($1, '{}'::jsonb)`, [email]);
	return email;
}

// ===========================================================================
describe('the slug reservation', () => {
	test('certifications is reserved, the open-lab control is not, and the predicate holds 37 names closed to clients', async () => {
		const { rows } = await db.sql<{ a: boolean; b: boolean; n: number; anon: boolean }>(
			`select public._app_short_link_reserved('certifications') as a, public._app_short_link_reserved('open-lab') as b,
				(select count(*)::int from pg_proc p, lateral regexp_matches(p.prosrc, '''([^'']*)''', 'g') m
					where p.proname = '_app_short_link_reserved' and p.pronamespace = 'public'::regnamespace) as n,
				has_function_privilege('anon', 'public._app_short_link_reserved(text)', 'execute') as anon`
		);
		expect(rows[0]).toEqual({ a: true, b: false, n: 37, anon: false });
	});
});
