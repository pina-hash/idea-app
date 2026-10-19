// tests/db/connector-requests.test.ts
//
// HIS REQUESTS, THE GROWING SET OF SAVED REQUESTS, THE GAPS AND THE PRACTICE
// ENDPOINT (docs/connector/DESIGN.md section 9, migration 0272), on the local
// backend over the real migration chain. Every judge is a row read back as the
// connection owner, never the tool's own answer.
//
//   - every tool call that carries his words is logged with them, the tool,
//     what it came to and the audit rows it produced;
//   - words that match no saved request become one; the same words again do not;
//   - a site_call name the registry does not have becomes an open gap, and so
//     does report_gap, once per wording while it is open;
//   - the practice endpoint writes NOTHING: every write entry in the registry,
//     every confirm entry pressed through with its practice token, an unknown
//     name and report_gap leave every log table and every connector table as
//     they were;
//   - an endpoint entry (a site route) asks first, runs its handler in-process
//     as him exactly once, and is audited "via Claude".

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { connectorWorld, logDiff, logSnapshot, type ConnectorWorld } from './connector-fixture';
import { connectorSamples, isGeneric, OWNER_ONLY, type Samples } from './connector-samples';
import { runTool } from '../../src/lib/server/connector/tools';
import { callEntries, directEntries, endpointEntries, levelsOf, type FunctionEntry } from '../../src/lib/server/connector/registry';
import { overrideRouteModule } from '../../src/lib/server/connector/endpoints';
import type { ToolContext } from '../../src/lib/server/connector/context';

let w: ConnectorWorld;
let S: Samples;
const SEED = JSON.parse(readFileSync(fileURLToPath(new URL('../../tools/connector/evals/seed.json', import.meta.url)), 'utf8')) as Array<{
	n: number;
	said: string;
	level: string;
	path: string[];
}>;

beforeAll(async () => {
	w = await connectorWorld();
	S = connectorSamples(w);
}, 180_000);

afterAll(async () => {
	await w?.stop();
});

const CONNECTOR_TABLES = ['connector_audit', 'connector_confirmations', 'connector_requests', 'connector_evals', 'connector_gaps', 'connector_eval_runs'];

async function counts(): Promise<Record<string, number>> {
	const out: Record<string, number> = {};
	for (const t of CONNECTOR_TABLES) out[t] = Number((await w.db.sql<{ n: string }>(`select count(*)::text as n from public.${t}`)).rows[0].n);
	return out;
}

async function snapshot() {
	return logSnapshot((t, p) => w.db.sql(t, p) as unknown as Promise<{ rows: Record<string, unknown>[] }>);
}

async function adminCtx(extra: Partial<ToolContext> = {}): Promise<ToolContext> {
	return { ...(await w.ctx(w.admin)), ...extra };
}

function entries(): FunctionEntry[] {
	return [...callEntries(), ...directEntries()];
}

async function callThrough(ctx: ToolContext, e: FunctionEntry, args: Record<string, unknown>, extra: Record<string, unknown> = {}) {
	if (e.surface === 'tool') return runTool(ctx, e.tool ?? e.name, { ...args, ...extra });
	return runTool(ctx, 'site_call', { name: e.name, args, ...extra });
}

describe('the saved requests start as the 52 lines of EVALS.md', () => {
	it('seeds every line once, numbered as the document numbers them, with its level and path', async () => {
		const rows = (await w.db.sql<{ seq: number; said: string; level: string; expected_path: string[]; source: string; proof_query: string | null }>(
			`select seq, said, level, expected_path, source, proof_query from public.connector_evals order by seq`
		)).rows;
		expect(SEED).toHaveLength(52);
		expect(rows.filter((r) => r.source === 'seed')).toHaveLength(52);
		for (const s of SEED) {
			const r = rows.find((x) => x.seq === s.n)!;
			expect(r, `saved request ${s.n}`).toBeDefined();
			expect(r.said).toBe(s.said);
			expect(r.level).toBe(s.level);
			expect(r.expected_path).toEqual(s.path);
		}
		expect(rows.filter((r) => r.source === 'seed' && !r.proof_query).map((r) => r.seq)).toEqual([]);
	});
});

describe('his requests are logged in his words', () => {
	it('a read logs his words, the tool, and that it was done; new words become a saved request with that path', async () => {
		const said = 'Which classes am I teaching this semester?';
		const out = await runTool(await adminCtx(), 'list_classes', { said });
		expect(out.status ?? 'ok').not.toBe('refused');
		const req = (await w.db.sql<{ said: string; tool: string; outcome: string; email: string; eval_id: string }>(
			`select said, tool, outcome, email, eval_id from public.connector_requests where said = $1`,
			[said]
		)).rows;
		expect(req).toHaveLength(1);
		expect(req[0]).toMatchObject({ said, tool: 'list_classes', outcome: 'done', email: w.admin.email });
		const ev = (await w.db.sql<{ source: string; level: string; expected_path: string[]; first_outcome: string; seq: number }>(
			`select source, level, expected_path, first_outcome, seq from public.connector_evals where id = $1`,
			[req[0].eval_id]
		)).rows[0];
		expect(ev).toMatchObject({ source: 'request', level: 'read', expected_path: ['list_classes'], first_outcome: 'done' });
		expect(ev.seq).toBeGreaterThan(52);

		// The same words again, punctuated differently: a second request, the same saved request.
		await runTool(await adminCtx(), 'list_classes', { said: 'which classes am I teaching this semester' });
		const evals = (await w.db.sql(`select 1 from public.connector_evals where said_norm = 'which classes am i teaching this semester'`)).rows;
		expect(evals).toHaveLength(1);
		const reqs = (await w.db.sql(`select 1 from public.connector_requests where eval_id = $1`, [req[0].eval_id])).rows;
		expect(reqs).toHaveLength(2);
	});

	it('a seeded wording matches its saved request and adds none', async () => {
		const before = (await counts()).connector_evals;
		await runTool(await adminCtx(), 'list_classes', { said: 'what classes do I have' });
		expect((await counts()).connector_evals).toBe(before);
		const r = (await w.db.sql<{ seq: number }>(
			`select e.seq from public.connector_requests q join public.connector_evals e on e.id = q.eval_id where q.said = 'what classes do I have'`
		)).rows;
		expect(r).toEqual([{ seq: 1 }]);
	});

	it('a write logs the audit row it produced', async () => {
		const e = entries().find((x) => x.name === 'coin_log_transaction')!;
		const args = await S.samples[e.name]();
		const out = await callThrough(await adminCtx(), e, args, { said: 'give Mateo a correct answer for the gear ratio' });
		expect(out.status).toBe('done');
		const row = (await w.db.sql<{ audit_ids: string[]; outcome: string; tool: string }>(
			`select audit_ids, outcome, tool from public.connector_requests where said = 'give Mateo a correct answer for the gear ratio'`
		)).rows[0];
		expect(row.outcome).toBe('done');
		expect(row.tool).toBe('site_call:coin_log_transaction');
		const audit = (await w.db.sql<{ id: string }>(`select id from public.connector_audit where function_name = 'coin_log_transaction' order by started_at desc limit 1`)).rows[0];
		expect(row.audit_ids).toContain(audit.id);
	});

	it('a call with no words is not logged, and nobody but an admin can write the log', async () => {
		const before = (await counts()).connector_requests;
		await runTool(await adminCtx(), 'list_classes', {});
		expect((await counts()).connector_requests).toBe(before);
		await expect(
			w.db.asUser(w.student.id, (q) => q(`select public.connector_request_log(null, 'hi', 'list_classes', '{}'::jsonb, 'done', array[]::uuid[], null)`))
		).rejects.toThrow();
		await expect(
			w.db.asUser(w.teacher.id, (q) => q(`select public.connector_report_gap('make a seating chart', 'Seating charts.', array[]::text[], null)`))
		).rejects.toThrow();
		expect((await counts()).connector_requests).toBe(before);
	});
});

describe('gaps: what the site cannot do yet', () => {
	it('a site_call name the registry does not have records an open gap with his words', async () => {
		const out = await runTool(await adminCtx(), 'site_call', { name: 'make_seating_chart', args: {}, said: 'Make me a seating chart for Block 2' });
		expect(out.status).toBe('not_available');
		expect(out.gap_recorded).toBe(true);
		const gap = (await w.db.sql<{ said: string; status: string; tried: string[]; email: string }>(
			`select said, status, tried, email from public.connector_gaps where said = 'Make me a seating chart for Block 2'`
		)).rows;
		expect(gap).toHaveLength(1);
		expect(gap[0]).toMatchObject({ status: 'open', email: w.admin.email });
		expect(gap[0].tried).toContain('site_call:make_seating_chart');
		const req = (await w.db.sql<{ outcome: string }>(`select outcome from public.connector_requests where said = 'Make me a seating chart for Block 2'`)).rows;
		expect(req).toEqual([{ outcome: 'gap' }]);
	});

	it('report_gap records one, and the same words while it is open are the same gap', async () => {
		const said = 'Text the parents of everyone who is missing Lab 3';
		const one = await runTool(await adminCtx(), 'report_gap', { said, missing: 'Texting parents.', tried: ['site_find_tool'] });
		expect(one.status).toBe('done');
		const two = await runTool(await adminCtx(), 'report_gap', { said, missing: 'Texting parents.', tried: ['send_feedback'] });
		expect(two.status).toBe('done');
		const rows = (await w.db.sql<{ tried: string[] }>(`select tried from public.connector_gaps where said = $1`, [said])).rows;
		expect(rows).toHaveLength(1);
		expect([...rows[0].tried].sort()).toEqual(['send_feedback', 'site_find_tool']);
	});

	it('site_find_tool for something the site cannot do says to report a gap, and finds nothing', async () => {
		const out = await runTool(await adminCtx(), 'site_find_tool', { query: 'qwertyuiop zxcvbnm', said: 'qwertyuiop zxcvbnm' });
		expect(out.status).toBe('none');
		expect(String(out.message)).toMatch(/report_gap/);
	});

	it('the admin list puts open gaps first, and Built needs a four-digit ledger number', async () => {
		const ctx = await adminCtx();
		const list = await ctx.backend.rpc<Array<{ id: string; status: string; said: string }>>(ctx.session, 'connector_admin_gaps', { p_status: null });
		expect(list.error).toBeNull();
		const gaps = list.data!;
		expect(gaps.length).toBeGreaterThanOrEqual(2);
		const id = gaps[0].id;
		const noLedger = await ctx.backend.rpc<{ ok: boolean; reason?: string }>(ctx.session, 'connector_admin_set_gap', { p_id: id, p_status: 'built', p_ledger: null, p_note: null });
		expect(noLedger.data).toMatchObject({ ok: false, reason: 'ledger' });
		const built = await ctx.backend.rpc<{ ok: boolean }>(ctx.session, 'connector_admin_set_gap', { p_id: id, p_status: 'built', p_ledger: '0402', p_note: null });
		expect(built.data).toMatchObject({ ok: true });
		const after = (await ctx.backend.rpc<Array<{ id: string; status: string }>>(ctx.session, 'connector_admin_gaps', { p_status: null })).data!;
		const firstBuilt = after.findIndex((g) => g.status !== 'open');
		expect(after.slice(firstBuilt).every((g) => g.status !== 'open')).toBe(true);
		await expect(
			w.db.asUser(w.teacher.id, (q) => q(`select public.connector_admin_gaps(null)`))
		).rejects.toThrow();
	});

	it('record_eval_result keeps a replay of a saved request, as his', async () => {
		const out = await runTool(await adminCtx(), 'record_eval_result', { request: 1, passed: true, path: ['list_classes'], said: 'replay' });
		expect(out.status).toBe('done');
		const runs = (await w.db.sql<{ passed: boolean; path: string[] }>(
			`select r.passed, r.path from public.connector_eval_runs r join public.connector_evals e on e.id = r.eval_id where e.seq = 1`
		)).rows;
		expect(runs).toEqual([{ passed: true, path: ['list_classes'] }]);
	});
});

describe('the practice endpoint writes nothing', () => {
	it('every write entry previews in practice, a confirm pressed through with its practice token still previews, and nothing anywhere changes', async () => {
		const writes = entries().filter((e) => levelsOf(e).some((l) => l !== 'read') && !OWNER_ONLY.has(e.name));
		expect(writes.length).toBeGreaterThanOrEqual(150);
		// Every sample's own setup runs first, so the snapshot holds only what practice could add.
		const prepared: Array<[FunctionEntry, Record<string, unknown>]> = [];
		for (const e of writes) prepared.push([e, await S.samples[e.name]()]);
		const before = await snapshot();
		const beforeCounts = await counts();
		const notPreviewed: string[] = [];
		for (const [e, args] of prepared) {
			const ctx = await adminCtx({ practice: true });
			const said = `practice ${e.name}`;
			const first = await callThrough(ctx, e, args, { said });
			// A generic-proof entry (ledger 0416) runs on placeholder arguments, which its own checks may refuse.
			const refusedGeneric = isGeneric(e.name) && first.status === 'refused';
			if ((first.status !== 'preview' || first.practice !== true) && !refusedGeneric) notPreviewed.push(`${e.name}: ${first.status} ${String(first.message ?? '')}`);
			if (first.confirm_token) {
				expect(first.confirm_token).toBe('practice');
				const pressed = await callThrough(ctx, e, args, { said, confirm_token: first.confirm_token });
				expect(pressed.status, `${e.name} pressed through`).toBe('preview');
			}
		}
		const ctx = await adminCtx({ practice: true });
		const unknown = await runTool(ctx, 'site_call', { name: 'make_seating_chart', args: {}, said: 'practice: a seating chart' });
		expect(unknown.gap_recorded).toBeUndefined();
		const gap = await runTool(ctx, 'report_gap', { said: 'practice: a seating chart', missing: 'Seating charts.' });
		expect(gap.status).toBe('preview');

		expect(notPreviewed).toEqual([]);
		expect(logDiff(before, await snapshot())).toEqual(new Map());
		expect(await counts()).toEqual(beforeCounts);
	}, 600_000);

	it('the voice tools preview in practice too, and write nothing', async () => {
		// A post to act on, made before the snapshot.
		await runTool(await adminCtx(), 'create_post', { classes: ['209H Block 2'], kind: 'assignment', title: 'Practice Target', points: 10 });
		const before = await snapshot();
		const beforeCounts = await counts();
		const ctx = await adminCtx({ practice: true });
		const calls: Array<[string, Record<string, unknown>]> = [
			['award_coins', { students: ['Mateo'], kind: 'Correct Answer in Class', reason: 'gear ratio' }],
			['fine_coins', { students: ['Daniel R'], kind: 'Off-Task', reason: 'phone out' }],
			['create_post', { classes: ['209H Block 2'], kind: 'assignment', title: 'Practice Only', points: 5 }],
			['set_points', { post: 'Practice Target', points: 25 }],
			['set_due', { post: 'Practice Target', due: 'Friday at 11:59' }],
			['set_published', { post: 'Practice Target', published: false }],
			['set_rubric', { post: 'Practice Target', criteria: [{ name: 'Accuracy', points: 10 }] }],
			['grade', { post: 'Practice Target', student: 'Mateo', score: 9, comment: 'Close.' }],
			['send_feedback', { post: 'Practice Target', student: 'Mateo', message: 'Cite the datasheet.' }]
		];
		const outcomes: string[] = [];
		for (const [tool, args] of calls) {
			const out = await runTool(ctx, tool, { ...args, said: `practice ${tool}` });
			outcomes.push(`${tool}:${String(out.status)}`);
			expect(out.status, `${tool}: ${JSON.stringify(out).slice(0, 300)}`).not.toBe('done');
		}
		expect(outcomes.filter((o) => !o.endsWith(':preview'))).toEqual([]);
		expect(logDiff(before, await snapshot())).toEqual(new Map());
		expect(await counts()).toEqual(beforeCounts);
	});

	it('practice reads are real reads', async () => {
		const out = await runTool(await adminCtx({ practice: true }), 'list_classes', { said: 'practice: what classes do I have' });
		expect((out.classes as unknown[]).length).toBeGreaterThan(0);
	});
});

describe('a site route, run as him', () => {
	const route = '/api/foundry/delete';
	let calls: Array<{ claims: unknown; isAdmin: unknown; body: unknown }> = [];

	beforeAll(() => {
		overrideRouteModule(route, {
			POST: async (event: { request: Request; locals: { claims: unknown; supabase: { rpc: (fn: string, args?: unknown) => Promise<{ data: unknown }> } } }) => {
				const body = await event.request.json();
				const admin = await event.locals.supabase.rpc('is_admin');
				calls.push({ claims: event.locals.claims, isAdmin: admin.data, body });
				return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
			}
		});
	});

	afterAll(() => overrideRouteModule(route, null));

	it('asks first, runs the handler once as him with the token, audits it, and never runs it twice for one request', async () => {
		const entry = endpointEntries().find((e) => e.route === route)!;
		expect(entry.level).toBe('confirm');
		const { app } = await (async () => {
			const r = await w.db.sql<{ id: string }>(
				`insert into public.student_apps (owner, slug, title, build_notes) values ($1, 'route-check', 'Route Check', 'x') returning id`,
				[w.student.id]
			);
			return { app: r.rows[0].id };
		})();
		calls = [];
		const auditBefore = (await counts()).connector_audit;

		const practice = await runTool(await adminCtx({ practice: true }), 'site_call', { name: entry.tool, args: { app }, said: 'practice: delete Route Check' });
		expect(practice.status).toBe('preview');
		const asked = await runTool(await adminCtx(), 'site_call', { name: entry.tool, args: { app }, said: 'delete Route Check' });
		expect(asked.status).toBe('preview');
		expect(calls).toHaveLength(0);
		expect((await counts()).connector_audit).toBe(auditBefore);

		const done = await runTool(await adminCtx(), 'site_call', {
			name: entry.tool,
			args: { app },
			said: 'delete Route Check',
			confirm_token: asked.confirm_token,
			request_id: 'route-check-1'
		});
		expect(done.status).toBe('done');
		expect(calls).toHaveLength(1);
		expect((calls[0].claims as { sub: string }).sub).toBe(w.admin.id);
		expect(calls[0].isAdmin).toBe(true);
		const audit = (await w.db.sql<{ tool: string; status: string; via: string }>(
			`select tool, status, via from public.connector_audit where tool = $1`,
			[entry.tool]
		)).rows;
		expect(audit).toEqual([{ tool: entry.tool, status: 'done', via: 'claude' }]);

		// The same request again answers the stored result and does not run the handler.
		const again = await runTool(await adminCtx(), 'site_call', { name: entry.tool, args: { app }, said: 'delete Route Check' });
		const second = await runTool(await adminCtx(), 'site_call', {
			name: entry.tool,
			args: { app },
			said: 'delete Route Check',
			confirm_token: again.confirm_token,
			request_id: 'route-check-1'
		});
		expect(second.status).toBe('repeated');
		expect(calls).toHaveLength(1);
	});
});
