// tests/db/chain-coin-v2.ts
//
// What the IDEA Coin V2 suites share (ledger 0384, migrations 0239 onward),
// and nothing they assert. The whole tree, read off disk, behind the fixture
// completion (the chain-0230 shape). PRE_V2 is exactly what production holds
// before the first V2 apply, so a suite can seed through the REAL pre-V2 RPCs
// and then apply the V2 files over the top.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

const ALL = readdirSync(MIGRATIONS_DIR)
	.filter((f) => /^\d{4}_.*\.sql$/.test(f))
	.sort();

/** The V2 files, in apply order. */
export const V2_FILES: readonly string[] = ALL.filter((f) => f >= '0239' && f < '0249');

/** Every migration before V2, behind the fixture completion. */
export const PRE_V2: readonly string[] = [FIXTURE_COMPLETION, ...ALL.filter((f) => f < '0239')];

/** The whole tree with V2 applied. */
export const WITH_V2: readonly string[] = [FIXTURE_COMPLETION, ...ALL];

/** One V2 file's text, for a suite that applies it by hand over seeded data. */
export function v2Sql(file: string): string {
	return readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
}
