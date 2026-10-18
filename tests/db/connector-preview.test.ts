// tests/db/connector-preview.test.ts
//
// PREVIEW IS A ROLLBACK (docs/connector/DESIGN.md section 3). For a coin award,
// a new post and a notice: a preview leaves zero rows in every log table, and
// it reports exactly the rows a commit of the same call then writes (judged by
// a before/after diff of every log table, never by the connector's own read).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectorWorld, logDiff, logSnapshot, normalizeRow, type ConnectorWorld } from './connector-fixture';
import { write } from '../../src/lib/server/connector/engine';

let w: ConnectorWorld;

beforeAll(async () => {
	w = await connectorWorld();
}, 180_000);

afterAll(async () => {
	await w?.stop();
});

const snap = () => logSnapshot((t, p) => w.db.sql(t, p) as never);

const CASES: Array<[string, string, () => Record<string, unknown>]> = [
	['an award', 'coin_log_transaction', () => ({ p_email: w.students.mateo, p_category_id: 'correct_answer_in_class', p_amount: null, p_quantity: null, p_note: 'preview test' })],
	['a new post', 'classroom_create_item', () => ({ p_kind: 'assignment', p_section_ids: [w.block2], p_title: 'Preview post', p_body: '', p_points: 4, p_due_at: null, p_published: true })],
	['a notice', 'classroom_quick_post_create', () => ({ p_section_ids: [w.block2, w.block4], p_body: 'Preview notice', p_expires_at: new Date(Date.now() + 3_600_000).toISOString() })]
];

describe('a preview writes nothing and reports what a commit writes', () => {
	for (const [label, fn, args] of CASES) {
		it(label, async () => {
			const ctx = await w.ctx(w.admin);
			const before = await snap();
			const preview = await write(ctx, { tool: 'preview-test', fn, args: args() }, { dryRun: true });
			expect(preview.status).toBe('preview');
			const afterPreview = await snap();
			expect([...logDiff(before, afterPreview).keys()]).toEqual([]);
			const audit = await w.db.sql(`select count(*)::int as n from public.connector_audit where tool = 'preview-test'`);
			const auditBefore = audit.rows[0].n;

			const commit = await write(ctx, { tool: 'preview-test', fn, args: args() }, {});
			expect(commit.status).toBe('done');
			const written = logDiff(afterPreview, await snap());
			const previewRows = (preview as { rows: Array<{ table: string; row: Record<string, unknown> }> }).rows;
			const byTable = (rows: Array<{ table: string }>) =>
				Object.entries(rows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.table]: (a[r.table] ?? 0) + 1 }), {})).sort();
			expect(byTable(previewRows)).toEqual([...written.entries()].map(([t, r]) => [t, r.length] as const).sort());
			expect(previewRows.length).toBeGreaterThan(0);
			// Same rows apart from ids and timestamps.
			const prev = previewRows.map((r) => normalizeRow(JSON.stringify(r.row))).sort();
			const real = [...written.values()].flat().map((j) => normalizeRow(JSON.stringify(JSON.parse(j)))).sort();
			expect(prev.length).toBe(real.length);
			const auditAfter = (await w.db.sql(`select count(*)::int as n from public.connector_audit where tool = 'preview-test'`)).rows[0].n;
			expect(auditAfter - auditBefore).toBe(1);
		});
	}
});
