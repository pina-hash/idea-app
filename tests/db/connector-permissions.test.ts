// tests/db/connector-permissions.test.ts
//
// THE CONNECTOR CAN NEVER EXCEED WHAT THE ACCOUNT CAN DO (docs/connector/
// DESIGN.md section 5). For EVERY write entry in the registry:
//
//   - as a student, as a teacher who is not an admin, and signed out, the call
//     through connector_call raises exactly the refusal the direct call raises,
//     compared text for text (and where a direct call would succeed, the
//     connector refuses and writes nothing);
//   - as the admin, the direct call and the connector call write identical rows
//     in every connector_log_tables table apart from ids and timestamps. The
//     connector's audit row is the only extra, and it is not a log table.
//
// Each case runs inside a transaction that is rolled back, so the direct call
// and the connector call start from the same database. The rows are judged by
// a before/after diff of every log table read as the connection owner, an
// instrument that shares nothing with 0270's own rows-written read.
//
// A write entry with no SAMPLE below fails the suite: a new write the registry
// gains is a write this file has to be told how to call.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { connectorWorld, logDiff, logSnapshot, normalizeRow, type ConnectorWorld } from './connector-fixture';
import { registryRows, schemaOf } from '../../src/lib/server/connector/registry';
import { stageHtmlDocument } from '../../src/lib/classroom/html-assignment/store';

let w: ConnectorWorld;
const HTML = readFileSync(fileURLToPath(new URL('../fixtures/hx-smoke-test.html', import.meta.url)), 'utf8');
const ADMIN_REFUSAL = 'The IDEA Website connector is for site admins.';

type Args = Record<string, unknown>;

async function asAdminRpc(fn: string, args: Args): Promise<Record<string, unknown>> {
	const r = await w.backend.rpc<Record<string, unknown>>(await w.backend.mintSession({ id: w.admin.id, email: w.admin.email }), fn, args);
	if (r.error) throw new Error(`${fn}: ${r.error.message}`);
	return r.data ?? {};
}

async function newItem(title: string, points: number | null = 10): Promise<string> {
	const r = await asAdminRpc('classroom_create_item', { p_kind: 'assignment', p_section_ids: [w.block2], p_title: title, p_body: '', p_points: points });
	return r.item_id as string;
}

const LEVELS = [
	{ label: 'Full', short: 'Full', points: 4, descriptor: 'All of it.' },
	{ label: 'Some', short: 'Some', points: 2, descriptor: 'Some of it.' },
	{ label: 'None', short: 'None', points: 0, descriptor: 'None of it.' }
];

/** How to call each write entry so that the ADMIN's call succeeds. */
const SAMPLES: Record<string, () => Promise<Args>> = {
	coin_log_transaction: async () => ({ p_email: w.students.mateo, p_category_id: 'correct_answer_in_class', p_note: 'permission test' }),
	coin_reverse_transaction: async () => {
		const r = await asAdminRpc('coin_log_transaction', { p_email: w.students.leo, p_category_id: 'correct_answer_in_class', p_note: 'to reverse' });
		return { p_transaction_id: r.transaction_id, p_note: 'reversing' };
	},
	classroom_create_item: async () => ({ p_kind: 'assignment', p_section_ids: [w.block2], p_title: 'Permission item', p_body: '', p_points: 5 }),
	classroom_update_item: async () => ({ p_id: await newItem('Update me'), p_title: 'Updated', p_body: 'new text', p_points: 7 }),
	classroom_delete_item: async () => ({ p_id: await newItem('Delete me') }),
	classroom_set_published: async () => ({ p_item_id: await newItem('Hide me'), p_published: false }),
	classroom_set_item_pinned: async () => ({ p_item_id: await newItem('Pin me'), p_pinned: true }),
	classroom_set_rubric: async () => ({ p_item_id: await newItem('Rubric me', 4), p_criteria: [{ id: 'accuracy', criterion: 'Accuracy', points: 4, levels: LEVELS }] }),
	classroom_set_html_assignment: async () => {
		const staged = stageHtmlDocument('perm.html', HTML).staged!;
		return { p_item_id: await newItem('Document me'), p_document: HTML, p_manifest: staged.manifest, p_filename: 'perm.html' };
	},
	classroom_restore_revision: async () => {
		const id = await newItem('Revise me');
		await asAdminRpc('classroom_update_item', { p_id: id, p_title: 'Revised', p_body: '', p_points: 10 });
		const rev = await w.db.sql<{ id: string }>(`select id from public.classroom_content_revisions where item_id = $1`, [id]);
		return { p_revision_id: rev.rows[0].id };
	},
	classroom_grade_direct: async () => ({ p_item_id: await newItem('Grade me'), p_student_email: w.students.mateo, p_score: 6, p_comment: 'good', p_return: true, p_extra_credit: null }),
	classroom_revoke_grade: async () => {
		const id = await newItem('Revoke me');
		await asAdminRpc('classroom_grade_direct', { p_item_id: id, p_student_email: w.students.mateo, p_score: 5, p_comment: 'x', p_return: true, p_extra_credit: null });
		return { p_item_id: id, p_student_email: w.students.mateo };
	},
	classroom_restore_grade: async () => {
		const id = await newItem('Restore me');
		await asAdminRpc('classroom_grade_direct', { p_item_id: id, p_student_email: w.students.mateo, p_score: 5, p_comment: 'x', p_return: true, p_extra_credit: null });
		await asAdminRpc('classroom_revoke_grade', { p_item_id: id, p_student_email: w.students.mateo });
		return { p_item_id: id, p_student_email: w.students.mateo };
	},
	classroom_feedback_post: async () => ({ p_item_id: await newItem('Feedback me'), p_student_email: w.students.mateo, p_block_id: null, p_file_id: null, p_body: 'Cite the datasheet.', p_marks: null }),
	classroom_feedback_remove: async () => {
		const r = await asAdminRpc('classroom_feedback_post', { p_item_id: await newItem('Unfeedback me'), p_student_email: w.students.mateo, p_block_id: null, p_file_id: null, p_body: 'remove me', p_marks: null });
		return { p_thread_id: (r.thread as { id: string }).id };
	},
	classroom_quick_post_create: async () => ({ p_section_ids: [w.block2], p_body: 'Shop closed.', p_expires_at: new Date(Date.now() + 86_400_000).toISOString() }),
	classroom_quick_post_take_down: async () => {
		const r = await asAdminRpc('classroom_quick_post_create', { p_section_ids: [w.block2], p_body: 'take me down', p_expires_at: new Date(Date.now() + 86_400_000).toISOString() });
		return { p_post_id: r.id };
	},
	connector_admin_set_enabled: async () => ({ p_enabled: false }),
	connector_admin_disconnect: async () => {
		const r = await w.db.sql<{ id: string }>(
			`insert into public.connector_tokens (user_id, email, client_id, access_hash, refresh_hash, access_expires_at, refresh_expires_at)
			 values ($1, $2, 'perm', md5(random()::text) || md5(random()::text), md5(random()::text) || md5(random()::text), now() + interval '1 hour', now() + interval '1 day') returning id`,
			[w.admin.id, w.admin.email]
		);
		return { p_token_id: r.rows[0].id };
	},
	connector_admin_disconnect_all: async () => {
		await w.db.sql(
			`insert into public.connector_tokens (user_id, email, client_id, access_hash, refresh_hash, access_expires_at, refresh_expires_at)
			 values ($1, $2, 'perm', md5(random()::text) || md5(random()::text), md5(random()::text) || md5(random()::text), now() + interval '1 hour', now() + interval '1 day')`,
			[w.admin.id, w.admin.email]
		);
		return {};
	}
};

/** The direct call, built from the generated schema: the instrument the connector is compared against. */
function directSql(fn: string, args: Args): string {
	const overloads = schemaOf(fn);
	const keys = Object.keys(args);
	const o = overloads.find((ov) => keys.every((k) => ov.args.some((a) => a.name === k)) && ov.args.filter((a) => !a.has_default).every((a) => keys.includes(a.name)));
	if (!o) throw new Error(`no overload of ${fn} for ${keys.join(',')}`);
	const parts = o.args
		.filter((a) => keys.includes(a.name))
		.map((a) => {
			if (a.type === 'jsonb' || a.type === 'json') return `${a.name} => nullif($1::jsonb -> '${a.name}', 'null'::jsonb)::${a.type}`;
			if (a.type.endsWith('[]')) return `${a.name} => (case when jsonb_typeof($1::jsonb -> '${a.name}') = 'array' then array(select jsonb_array_elements_text($1::jsonb -> '${a.name}')) end)::${a.type}`;
			return `${a.name} => ($1::jsonb ->> '${a.name}')::${a.type}`;
		});
	return `select to_jsonb(public.${fn}(${parts.join(', ')})) as r where $1::jsonb is not null`;
}

type Who = { kind: 'user'; id: string; email: string } | { kind: 'anon' };

/** Runs `sql` as `who` inside a transaction that is rolled back; answers the error text or null, and the log-table diff. */
async function attempt(who: Who, sql: string, params: unknown[]): Promise<{ error: string | null; diff: Map<string, string[]> }> {
	const client: pg.PoolClient = await w.pool.connect();
	try {
		await client.query('begin');
		const q = (t: string, p?: unknown[]) => client.query(t, p) as unknown as Promise<{ rows: Record<string, unknown>[] }>;
		const before = await logSnapshot(q);
		if (who.kind === 'user') {
			await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who.id, role: 'authenticated', email: who.email })]);
			await client.query('set local role authenticated');
		} else {
			await client.query(`select set_config('request.jwt.claims', '', true)`);
			await client.query('set local role anon');
		}
		let error: string | null = null;
		await client.query('savepoint call');
		try {
			await client.query(sql, params);
		} catch (e) {
			error = (e as Error).message;
			await client.query('rollback to savepoint call');
		}
		await client.query('reset role');
		const after = await logSnapshot(q);
		return { error, diff: logDiff(before, after) };
	} finally {
		await client.query('rollback').catch(() => {});
		client.release();
	}
}

function normalized(diff: Map<string, string[]>): Record<string, string[]> {
	return Object.fromEntries([...diff.entries()].map(([t, rows]) => [t, rows.map(normalizeRow).sort()]).sort());
}

const CONNECTOR_SQL = `select public.connector_call('permission-test', $2, $1::jsonb, $3, 'commit') as r`;

beforeAll(async () => {
	w = await connectorWorld();
}, 180_000);

afterAll(async () => {
	await w?.stop();
});

const WRITES = registryRows().filter((r) => r.level !== 'read');

describe('the connector reaches exactly what the account reaches', () => {
	it('names a sample for every write entry in the registry', () => {
		expect(WRITES.length).toBeGreaterThanOrEqual(20);
		expect(WRITES.map((r) => r.function_name).filter((f) => !SAMPLES[f])).toEqual([]);
	});

	for (const entry of WRITES) {
		it(`${entry.function_name}: refusals match text for text, and the admin's rows match the direct call's`, async () => {
			const sample = SAMPLES[entry.function_name];
			expect(sample, `a sample for ${entry.function_name}`).toBeDefined();
			const args = await sample();
			const direct = directSql(entry.function_name, args);
			let key = 0;
			const nextKey = () => `id:perm:${entry.function_name}:${(key += 1)}:${Math.random()}`;

			const others: Array<[string, Who]> = [
				['student', { kind: 'user', id: w.student.id, email: w.student.email }],
				['teacher', { kind: 'user', id: w.teacher.id, email: w.teacher.email }],
				['signed out', { kind: 'anon' }]
			];
			let refusedCases = 0;
			for (const [label, who] of others) {
				const d = await attempt(who, direct, [JSON.stringify(args)]);
				const c = await attempt(who, CONNECTOR_SQL, [JSON.stringify(args), entry.function_name, nextKey()]);
				if (d.error !== null) {
					expect(c.error, `${label}: the connector's refusal`).toBe(d.error);
					refusedCases += 1;
				} else {
					expect(c.error, `${label}: a direct call that worked`).toBe(ADMIN_REFUSAL);
				}
				expect(normalized(c.diff), `${label}: nothing written through the connector`).toEqual({});
			}
			// Signed out is always a refusal; a student or teacher may get a
			// structured {ok: false} answer instead, which the connector then
			// refuses for not being an admin (checked above).
			expect(refusedCases).toBeGreaterThanOrEqual(1);

			const adminWho: Who = { kind: 'user', id: w.admin.id, email: w.admin.email };
			const d = await attempt(adminWho, direct, [JSON.stringify(args)]);
			const c = await attempt(adminWho, CONNECTOR_SQL, [JSON.stringify(args), entry.function_name, nextKey()]);
			expect(d.error, 'the admin direct call').toBeNull();
			expect(c.error, 'the admin connector call').toBeNull();
			const direct_rows = normalized(d.diff);
			expect(Object.keys(direct_rows).length, 'the direct call wrote to at least one log table').toBeGreaterThan(0);
			expect(normalized(c.diff)).toEqual(direct_rows);
		});
	}
});
