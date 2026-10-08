// tests/db/feedback-edit.test.ts
//
// 0233 PART 30, FEEDBACK EDITS (report d362bfb3). An admin corrects a filed
// report's kind, message and "what you tried"; every correction is a numbered
// revision and the reporter's own row never changes. What would fail SILENTLY:
//
//   1. THE REPORTER'S ROW IS BYTE-IDENTICAL AFTER ANY NUMBER OF EDITS. The
//      table is append-only by design (0053), and an UPDATE sneaking into the
//      write path would rewrite somebody's words with nothing on screen saying
//      so, because the console shows the edited text either way.
//   2. THE CONSOLE READ ANSWERS EVERY DEPLOYED CALL AS BEFORE, plus one `edit`
//      key on every row (null when never edited). A corpus of reads is put to
//      the deployed functions, the part is applied over the same database, and
//      the corpus is put again.
//   3. NOBODY BUT AN ADMIN WRITES OR READS A REVISION: no client grant, no
//      policy, a refusal for a student with the admin call as the positive
//      control.
//   4. A BLANK OF NEWLINES IS EMPTY (the btrim trap), asserted on the REASON,
//      never as a falsy fall-through.
//   5. THE PART ITSELF: no paste trap, nothing the apply tool refuses, a
//      self-check that bites, and a second paste that moves nothing.
//
// The chain is the whole tree short of 0233; the seed goes through 0053's
// direct insert and 0170's anonymous function, the two real write paths.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import {
	PRE_0233,
	PRE_0233_COUNT,
	canExecute,
	catalogFingerprint,
	overloads,
	part0233,
	pasteTrap,
	refusal,
	tablePrivileges
} from './chain-0233';

const PART = part0233('feedback-edits');
const SQL_PART = PART ?? '';

const SUBMIT = `select public.app_feedback_submit(
	p_app => $1, p_kind => $2, p_message => $3, p_context => $4,
	p_meta => $5::jsonb, p_contact => $6, p_address_hash => $7,
	p_tried => $8, p_screenshot_path => $9
) as r`;
const NARROW_BARE = 'select public.app_feedback_admin_list() as r';
const NARROW = 'select public.app_feedback_admin_list(p_app => $1, p_limit => $2) as r';
const WIDE = 'select public.app_feedback_admin_list(p_app => $1, p_limit => $2, p_horizon => $3) as r';
const EDIT = 'select public.app_feedback_edit($1::uuid, $2, $3, $4, $5) as r';
const EDIT_SIG = 'app_feedback_edit(uuid, text, text, text, integer)';
const FAKE = '00000000-0000-4000-8000-000000000000';

type Json = Record<string, any>;

let db: TestDb;
let admin: SeededUser;
let stu: SeededUser;
let signedRow: string;
let metaTriedRow: string;
let anonRow: string;
let untouchedRow: string;
let preFingerprint: string;

type ListCase = [string, string, unknown[]];
const LIST_CASES: ListCase[] = [
	['no arguments', NARROW_BARE, []],
	['one app', NARROW, ['portal', null]],
	['a limit of one', NARROW, [null, 1]],
	['the wide form, both horizons', WIDE, [null, 500, null]],
	['the wide form, long-term', WIDE, [null, 500, 'long_term']]
];

async function list(u: SeededUser | null, sql: string, args: unknown[]): Promise<Json[] | string> {
	try {
		if (!u) return (await db.sql<{ r: Json[] }>(sql, args)).rows[0].r;
		return await db.asUser(u.id, async (q) => (await q<{ r: Json[] }>(sql, args)).rows[0].r);
	} catch (error) {
		return `raised: ${(error as Error).message}`;
	}
}
const withoutEdit = (rows: Json[] | string) =>
	typeof rows === 'string' ? rows : rows.map(({ edit: _e, ...rest }) => rest);

async function edit(
	u: SeededUser,
	id: string,
	kind: string | null,
	message: string | null,
	tried: string | null,
	base: number | null
): Promise<Json> {
	return db.asUser(u.id, async (q) => (await q<{ r: Json }>(EDIT, [id, kind, message, tried, base])).rows[0].r);
}

/** The reporter's own columns, exactly as stored. */
async function reporterRow(id: string) {
	return (
		await db.sql(
			`select user_id, app, context, kind, message, meta, contact, tried, screenshot_path,
			        status, horizon, created_at, reviewed_at, reviewed_by
			 from public.app_feedback where id = $1`,
			[id]
		)
	).rows[0];
}

const listBefore = new Map<string, Json[] | string>();
const refusalsBefore: (Json[] | string)[] = [];

beforeAll(async () => {
	db = await startTestDb(PRE_0233);
	admin = await createUser(db, 'apina@boscotech.edu', 'Owner Admin');
	stu = await createUser(db, 'stu@boscotech.net', 'Stu Dent');

	// SEEDED THROUGH THE REAL PRE-0233 PATHS.
	signedRow = await db.asUser(stu.id, async (q) => {
		const { rows } = await q<{ id: string }>(
			`insert into public.app_feedback (user_id, app, kind, message, meta, tried)
			 values ($1, 'portal', 'bug', 'the buton does nothing um when i press it', '{"route":"/"}'::jsonb, 'Reloaded.')
			 returning id`,
			[stu.id]
		);
		return rows[0].id;
	});
	// A row whose "tried" rides in meta (the pre-0170 shape the console reads as
	// a fallback): an edit's revision 0 must read it the same way.
	metaTriedRow = await db.asUser(stu.id, async (q) => {
		const { rows } = await q<{ id: string }>(
			`insert into public.app_feedback (user_id, app, kind, message, meta)
			 values ($1, 'classroom', 'idea', '  add a dark mode  ', '{"tried":"Asked a friend."}'::jsonb)
			 returning id`,
			[stu.id]
		);
		return rows[0].id;
	});
	anonRow = await db.asServiceRole(async (q) => {
		const { rows } = await q<{ r: Json }>(SUBMIT, ['portal', 'other', 'signed out, hello', null, '{}', 'ask me in 4th', 'seed-hash', null, null]);
		return rows[0].r.id;
	});
	untouchedRow = await db.asServiceRole(async (q) => {
		const { rows } = await q<{ r: Json }>(SUBMIT, ['portal', 'praise', 'nice page', null, '{"horizon":"long_term"}', null, 'seed-hash-2', null, null]);
		return rows[0].r.id;
	});

	for (const [name, sql, args] of LIST_CASES) listBefore.set(name, await list(admin, sql, args));
	refusalsBefore.push(await list(stu, NARROW_BARE, []), await list(null, NARROW_BARE, []));
	preFingerprint = await catalogFingerprint(db);
});

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the part as text', () => {
	test('the file carries the part between its markers, and the chain was not short', () => {
		expect(PART).not.toBeNull();
		expect(SQL_PART).toContain('create table if not exists public.app_feedback_edits');
		expect(PRE_0233_COUNT).toBeGreaterThan(200);
	});

	test('no paste trap, and the check finds one when one is planted', () => {
		expect(pasteTrap(SQL_PART)).toEqual([]);
		expect(pasteTrap('select 1; -- costs $5\n')).toHaveLength(1);
		expect(pasteTrap('create function f() as $fe$ select 1;\n')).toHaveLength(1);
	});

	test('the apply tool would send it: no refusal, no top-level DML, against a planted insert', () => {
		const scan = scanFile(SQL_PART);
		expect(scan.findings).toEqual([]);
		expect(scan.selfManagedTransaction).toBe(false);
		expect(scanFile('insert into public.app_feedback_edits (feedback_id) values (null);').findings).toHaveLength(1);
	});

	test('the wide read carries a body line no earlier migration has (the probe body marker)', () => {
		expect(SQL_PART).toMatch(/^\t+from public\.app_feedback_edits e$/m);
		expect(SQL_PART).not.toMatch(/information_schema/);
	});
});

// ===========================================================================
describe('the self-check bites, and a refused apply leaves nothing behind', () => {
	const MUTANTS: [string, string, string, RegExp][] = [
		[
			'a client grant left on the edits table',
			'revoke all on table public.app_feedback_edits from public, anon, authenticated, service_role;',
			'revoke all on table public.app_feedback_edits from public, anon, service_role;\ngrant select on table public.app_feedback_edits to authenticated;',
			/0233 feedback-edits: authenticated holds select on public\.app_feedback_edits/
		],
		[
			'a policy on the edits table',
			'alter table public.app_feedback_edits enable row level security;',
			'alter table public.app_feedback_edits enable row level security;\ncreate policy "open" on public.app_feedback_edits for select using (true);',
			/0233 feedback-edits: public\.app_feedback_edits carries 1 policy/
		],
		[
			'an anon grant left on the writer',
			'revoke all on function public.app_feedback_edit(uuid, text, text, text, integer)\n\tfrom public, anon, authenticated, service_role;',
			'revoke all on function public.app_feedback_edit(uuid, text, text, text, integer)\n\tfrom public, authenticated, service_role;',
			/0233 feedback-edits: anon can execute app_feedback_edit/
		]
	];

	test.each(MUTANTS)('%s', async (_name, from, to, sentence) => {
		expect(SQL_PART.split(from).length - 1, 'the mutation site must occur exactly once').toBe(1);
		const message = await refusal(() => db.sql(SQL_PART.replace(from, to)));
		expect(message).toMatch(sentence);
		expect(await catalogFingerprint(db)).toBe(preFingerprint);
	});

	test('a wide read that does not name the edits table is refused', async () => {
		// The only reader of the revisions is the lateral join; a body without it
		// is the old list re-pasted, and the self-check names it.
		const from = /\t\t\tleft join lateral \([\s\S]*?\) le on true\n/;
		expect(from.test(SQL_PART)).toBe(true);
		const mutant = SQL_PART.replace(from, '').replace(
			/\t\t\t\t-- 0233: an admin's correction[\s\S]*?end as edit\n/,
			'\t\t\t\tnull::jsonb as edit\n'
		);
		const message = await refusal(() => db.sql(mutant));
		expect(message).toMatch(/0233 feedback-edits: the wide app_feedback_admin_list does not read the edits/);
		expect(await catalogFingerprint(db)).toBe(preFingerprint);
	});
});

// ===========================================================================
describe('the apply', () => {
	beforeAll(async () => {
		await db.sql(SQL_PART);
	});

	test('the deployed reads answer the same rows plus one `edit` key, null on every row', async () => {
		expect((listBefore.get('no arguments') as Json[]).length).toBe(4);
		for (const [name, sql, args] of LIST_CASES) {
			const after = await list(admin, sql, args);
			const before = listBefore.get(name)!;
			expect(withoutEdit(after), name).toEqual(before);
			expect(typeof after, name).not.toBe('string');
			for (const row of after as Json[]) {
				expect(Object.hasOwn(row, 'edit'), name).toBe(true);
				expect(row.edit, name).toBeNull();
			}
			if (typeof before !== 'string') for (const row of before) expect(row).not.toHaveProperty('edit');
		}
	});

	test('the reads refuse a student and a missing session in the same words', async () => {
		expect([await list(stu, NARROW_BARE, []), await list(null, NARROW_BARE, [])]).toEqual(refusalsBefore);
		expect(refusalsBefore).toEqual(['raised: Only a site admin can read the feedback queue.', 'raised: You must be signed in.']);
	});
});

// ===========================================================================
describe('editing', () => {
	let reporterBefore: Json;
	let others: Json[];

	beforeAll(async () => {
		reporterBefore = await reporterRow(signedRow);
		others = await Promise.all([metaTriedRow, anonRow, untouchedRow].map(reporterRow));
	});

	test('three edits: revisions 1..3, and the reporter row reads byte-identical', async () => {
		const r1 = await edit(admin, signedRow, 'bug', 'The button does nothing when I press it.', 'Reloaded.', 0);
		expect(r1).toEqual({ ok: true, changed: true, id: signedRow, revision: 1 });
		const r2 = await edit(admin, signedRow, ' IDEA ', 'The button should do something.', null, 1);
		expect(r2).toEqual({ ok: true, changed: true, id: signedRow, revision: 2 });
		const r3 = await edit(admin, signedRow, 'bug', '  The Save button does nothing.  ', ' Reloaded twice. ', 2);
		expect(r3).toEqual({ ok: true, changed: true, id: signedRow, revision: 3 });

		const { rows } = await db.sql(
			`select revision, kind, message, tried, edited_by from public.app_feedback_edits
			 where feedback_id = $1 order by revision`,
			[signedRow]
		);
		expect(rows).toEqual([
			{ revision: 1, kind: 'bug', message: 'The button does nothing when I press it.', tried: 'Reloaded.', edited_by: 'apina@boscotech.edu' },
			{ revision: 2, kind: 'idea', message: 'The button should do something.', tried: null, edited_by: 'apina@boscotech.edu' },
			{ revision: 3, kind: 'bug', message: 'The Save button does nothing.', tried: 'Reloaded twice.', edited_by: 'apina@boscotech.edu' }
		]);
		expect(await reporterRow(signedRow)).toEqual(reporterBefore);
		// Nobody else's row moved either.
		expect(await Promise.all([metaTriedRow, anonRow, untouchedRow].map(reporterRow))).toEqual(others);
	});

	test('both read arities carry the latest revision; every other row carries edit: null', async () => {
		for (const [name, sql, args] of [LIST_CASES[0], LIST_CASES[3]]) {
			const rows = (await list(admin, sql, args)) as Json[];
			const mine = rows.find((r) => r.id === signedRow)!;
			expect(mine.message, name).toBe('the buton does nothing um when i press it');
			expect(mine.kind, name).toBe('bug');
			expect(mine.tried, name).toBe('Reloaded.');
			expect(mine.edit, name).toMatchObject({
				revision: 3,
				kind: 'bug',
				message: 'The Save button does nothing.',
				tried: 'Reloaded twice.',
				edited_by: 'apina@boscotech.edu'
			});
			expect(typeof mine.edit.edited_at, name).toBe('string');
			for (const row of rows.filter((r) => r.id !== signedRow)) {
				expect(Object.hasOwn(row, 'edit')).toBe(true);
				expect(row.edit).toBeNull();
			}
		}
	});

	test('a stale base is refused with the current revision, and writes nothing', async () => {
		expect(await edit(admin, signedRow, 'bug', 'Somebody else typed this.', null, 1)).toEqual({ ok: false, reason: 'stale', revision: 3 });
		expect(await edit(admin, signedRow, 'bug', 'Somebody else typed this.', null, null)).toEqual({ ok: false, reason: 'stale', revision: 3 });
		const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from public.app_feedback_edits where feedback_id = $1`, [signedRow]);
		expect(rows[0].n).toBe(3);
	});

	test('a retry whose first answer was lost finds its own words there: no change, not stale', async () => {
		// Revision 3 already holds exactly these words; the form that sent them
		// was opened on revision 2 and never heard back.
		expect(await edit(admin, signedRow, 'bug', 'The Save button does nothing.', 'Reloaded twice.', 2)).toEqual({
			ok: true,
			changed: false,
			id: signedRow,
			revision: 3
		});
	});

	test('an unchanged save answers changed:false and stamps nothing, against revision 0 too', async () => {
		expect(await edit(admin, signedRow, 'BUG', ' The Save button does nothing. ', 'Reloaded twice.', 3)).toEqual({
			ok: true,
			changed: false,
			id: signedRow,
			revision: 3
		});
		// Revision 0 is the reporter's own words, trimmed, with "tried" read off
		// meta exactly as the console reads it.
		expect(await edit(admin, metaTriedRow, 'idea', 'add a dark mode', 'Asked a friend.', 0)).toEqual({
			ok: true,
			changed: false,
			id: metaTriedRow,
			revision: 0
		});
		const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from public.app_feedback_edits where feedback_id in ($1, $2)`, [signedRow, metaTriedRow]);
		expect(rows[0].n).toBe(3);
		// Positive control: one changed field is a change.
		expect(await edit(admin, metaTriedRow, 'idea', 'add a dark mode', null, 0)).toEqual({ ok: true, changed: true, id: metaTriedRow, revision: 1 });
	});

	test('the refusals an admin can fix in the form, each by its reason', async () => {
		const blank = await edit(admin, anonRow, 'other', ' \n\t\n ', null, 0);
		expect(blank.reason).toBe('empty');
		expect(blank.ok).toBe(false);
		expect(await edit(admin, anonRow, 'other', null, null, 0)).toEqual({ ok: false, reason: 'empty' });
		expect(await edit(admin, anonRow, 'rant', 'ok', null, 0)).toEqual({ ok: false, reason: 'kind' });
		expect(await edit(admin, anonRow, null, 'ok', null, 0)).toEqual({ ok: false, reason: 'kind' });
		expect(await edit(admin, anonRow, 'other', 'm'.repeat(2001), null, 0)).toEqual({ ok: false, reason: 'too_long', max: 2000 });
		expect(await edit(admin, anonRow, 'other', 'ok', 't'.repeat(1001), 0)).toEqual({ ok: false, reason: 'tried_too_long', max: 1000 });
		// The edges are accepted (the positive control for both caps), and a
		// "tried" of only whitespace is no "tried" at all.
		expect(await edit(admin, anonRow, 'other', 'm'.repeat(2000), ' \n ', 0)).toMatchObject({ ok: true, changed: true, revision: 1 });
		expect(await edit(admin, anonRow, 'other', 'ok', 't'.repeat(1000), 1)).toMatchObject({ ok: true, changed: true, revision: 2 });
		const { rows } = await db.sql(`select tried from public.app_feedback_edits where feedback_id = $1 order by revision`, [anonRow]);
		expect(rows[0].tried).toBeNull();
	});

	test('misuse raises: a student, a missing session, anon and a report that does not exist', async () => {
		expect(await refusal(() => edit(stu, untouchedRow, 'bug', 'mine now', null, 0))).toBe('Only a site admin can edit feedback.');
		expect(await refusal(() => db.sql(EDIT, [untouchedRow, 'bug', 'x', null, 0]))).toBe('You must be signed in.');
		expect(await refusal(() => db.asAnon((q) => q(EDIT, [untouchedRow, 'bug', 'x', null, 0])))).toMatch(/permission denied for function/);
		expect(await refusal(() => edit(admin, FAKE, 'bug', 'x', null, 0))).toBe('That feedback does not exist.');
		const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from public.app_feedback_edits where feedback_id = $1`, [untouchedRow]);
		expect(rows[0].n).toBe(0);
		// The positive control: the same call as the admin lands.
		expect(await edit(admin, untouchedRow, 'praise', 'Nice page.', null, 0)).toMatchObject({ ok: true, changed: true, revision: 1 });
	});

	test('no client role reads or writes a revision directly', async () => {
		expect(await refusal(() => db.asUser(admin.id, (q) => q(`select * from public.app_feedback_edits`)))).toMatch(/permission denied/);
		expect(await refusal(() => db.asUser(stu.id, (q) => q(`select * from public.app_feedback_edits`)))).toMatch(/permission denied/);
		expect(
			await refusal(() =>
				db.asUser(admin.id, (q) =>
					q(`insert into public.app_feedback_edits (feedback_id, revision, kind, message, edited_by) values ($1, 9, 'bug', 'x', 'y')`, [signedRow])
				)
			)
		).toMatch(/permission denied/);
		expect(await refusal(() => db.asUser(admin.id, (q) => q(`update public.app_feedback set message = 'x' where id = $1`, [signedRow])))).toMatch(/permission denied/);
		for (const role of ['anon', 'authenticated', 'service_role']) {
			expect(await tablePrivileges(db, role, 'app_feedback_edits'), role).toEqual([]);
		}
	});
});

// ===========================================================================
describe('the catalog, and a second paste', () => {
	test('one writer, anon executes neither new thing, authenticated executes both', async () => {
		expect(await overloads(db, 'app_feedback_edit')).toBe(1);
		expect(await canExecute(db, 'anon', EDIT_SIG)).toBe(false);
		expect(await canExecute(db, 'service_role', EDIT_SIG)).toBe(false);
		expect(await canExecute(db, 'authenticated', EDIT_SIG)).toBe(true);
		for (const fn of ['app_feedback_admin_list(text, integer)', 'app_feedback_admin_list(text, integer, text)']) {
			expect(await canExecute(db, 'anon', fn), fn).toBe(false);
			expect(await canExecute(db, 'authenticated', fn), fn).toBe(true);
		}
	});

	test('the two console reads still cannot both bind: the wide has no defaults, the narrow keeps two', async () => {
		const { rows } = await db.sql<{ sig: string; d: number }>(
			`select p.oid::regprocedure::text as sig, p.pronargdefaults as d from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'app_feedback_admin_list' order by p.pronargs`
		);
		expect(rows).toEqual([
			{ sig: 'app_feedback_admin_list(text,integer)', d: 2 },
			{ sig: 'app_feedback_admin_list(text,integer,text)', d: 0 }
		]);
	});

	test('RLS is on with no policy', async () => {
		const { rows } = await db.sql(
			`select c.relrowsecurity as rls,
			        (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = 'app_feedback_edits') as policies
			 from pg_class c join pg_namespace n on n.oid = c.relnamespace
			 where n.nspname = 'public' and c.relname = 'app_feedback_edits'`
		);
		expect(rows[0]).toEqual({ rls: true, policies: 0 });
	});

	test('a second paste moves no catalog object and no row', async () => {
		const fp = await catalogFingerprint(db);
		const edits = (await db.sql(`select * from public.app_feedback_edits order by feedback_id, revision`)).rows;
		await db.sql(SQL_PART);
		expect(await catalogFingerprint(db)).toBe(fp);
		expect((await db.sql(`select * from public.app_feedback_edits order by feedback_id, revision`)).rows).toEqual(edits);
		expect(fp).not.toBe(preFingerprint);
	});
});
