/**
 * THE 0230 POST-APPLY CHECK RUNS, AND RUNS FLATTENED TO ONE LINE.
 *
 * `docs/feedback/2026-10-01/VERIFY_0230.sql` is pasted by hand into the
 * Supabase SQL editor, so it is checked the way it will be used: on the whole
 * tree short of 0230 (it must not error on a database that lacks what it
 * looks for) and again after 0230 (every row but the history row reads ok,
 * because the test cluster has no `supabase_migrations` schema).
 *
 * A PASTE CAN LOSE ITS LINE BREAKS, AND A LINE COMMENT THEN SWALLOWS THE FILE.
 * On 2026-10-01 the check came back from the editor as "syntax error at end of
 * input, LINE 0", which is what an input of nothing but a comment produces,
 * and the version of the file pasted then opened with two `--` lines. So the
 * file carries no line comment at all, and this suite runs it with every
 * newline turned into a space and asserts the same rows. The control is the
 * old opening: flattened, it leaves Postgres nothing to run but a comment.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startTestDb, type TestDb } from './harness';
import { PRE_0230, SQL_0230 } from './chain-0230';

const VERIFY = readFileSync('docs/feedback/2026-10-01/VERIFY_0230.sql', 'utf8');
const flat = (sql: string) => sql.replace(/\r?\n/g, ' ');

type Row = { check_name: string; ok: boolean; detail: string | null };

let db: TestDb;
let before: Row[];

async function run(sql: string): Promise<Row[]> {
	return ((await db.sql(sql)).rows ?? []) as Row[];
}

beforeAll(async () => {
	db = await startTestDb(PRE_0230);
	before = await run(VERIFY);
	await db.sql(SQL_0230);
});

afterAll(async () => {
	await db?.stop();
});

describe('VERIFY_0230.sql', () => {
	test('carries no line comment', () => {
		expect(VERIFY.includes('--')).toBe(false);
	});

	test('answers on a database without 0230, naming what is missing', () => {
		expect(before.length).toBe(36);
		const missing = before.filter((r) => r.detail === 'MISSING').length;
		expect(missing).toBeGreaterThan(20);
		expect(before.filter((r) => r.ok).length).toBeLessThan(10);
	});

	test('reads ok on every row after 0230, the history row aside', async () => {
		const after = await run(VERIFY);
		expect(after.length).toBe(36);
		const notOk = after.filter((r) => !r.ok).map((r) => r.check_name);
		expect(notOk).toEqual([expect.stringMatching(/^the history row/)]);
	});

	test('gives the same rows when the paste loses every line break', async () => {
		expect(flat(VERIFY).includes('\n')).toBe(false);
		expect(await run(flat(VERIFY))).toEqual(await run(VERIFY));
	});

	test('control: the old line-comment opening, flattened, leaves nothing to run', async () => {
		const old = VERIFY.replace(/^\/\*[\s\S]*?\*\/\n/, '-- 0230 post-apply check.\n-- Every row should read ok = true.\n');
		expect(old.startsWith('-- ')).toBe(true);
		expect((await run(old)).length).toBe(36);
		expect((await run(flat(old))).length).toBe(0);
	});
});
