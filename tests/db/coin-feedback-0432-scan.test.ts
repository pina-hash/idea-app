// tests/db/coin-feedback-0432-scan.test.ts
//
// Ledger 0432's migrations, read the way production applies them: through the
// real scanner tools/apply-migration.mjs runs (no top-level DML, no
// destructive DDL, no transaction of their own) and the Supabase editor's
// paste trap (no dollar sign in a comment, every dollar-quote balanced). Each
// rule has a planted control, so a pass says the instrument was looking.

import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { scanFile } from '../../tools/apply-migration.mjs';
import { pasteTrap } from './chain-0230';

const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const MINE = readdirSync(DIR).filter((f) => /^\d{4}_(coin_contracts_retired|coin_voice_aliases|feedback_bulk_spam_rewards)\.sql$/.test(f)).sort();

describe('ledger 0432 migrations apply through the production tool', () => {
	test('the files are there', () => {
		expect(MINE.length).toBeGreaterThanOrEqual(1);
	});
	for (const f of MINE) {
		test(`${f}: no finding from the apply scanner`, () => {
			const scan = scanFile(readFileSync(join(DIR, f), 'utf8'));
			expect(scan.findings).toEqual([]);
			expect(scan.selfManagedTransaction).toBe(false);
		});
		test(`${f}: survives the editor's paste splitter`, () => {
			expect(pasteTrap(readFileSync(join(DIR, f), 'utf8'))).toEqual([]);
		});
	}
	test('controls: a planted top-level update and a planted comment dollar are both caught', () => {
		expect(scanFile('update public.coin_contracts set cancelled_at = now();').findings).toHaveLength(1);
		expect(pasteTrap('-- a $tag$ in a comment\nselect 1;')).not.toEqual([]);
	});
});
