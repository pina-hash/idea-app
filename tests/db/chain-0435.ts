// tests/db/chain-0435.ts
//
// What the ledger 0435 suites share (IDEA209H Unit 4: team documents, the team
// plan and the sign-off queue), and nothing they assert.
//
// THE CHAIN IS THE WHOLE TREE SHORT OF A GIVEN MIGRATION, READ OFF DISK, behind
// the same fixture completion chain-0230.ts uses. The team features lean on the
// classroom (0082 onward), the team draws (0223, 0225), the HTML assignment
// gates (0195, 0197), the live lock (0298) and the admin tier, so the database
// production holds before each apply is the honest fixture, and it is what the
// migration rule's "seeded PRE-migration data" asks for.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

const ALL = readdirSync(MIGRATIONS_DIR)
	.filter((f) => /^\d{4}_.*\.sql$/.test(f))
	.sort();

/** The one migration file carrying this number. */
export function migrationFile(number: string): string {
	const found = ALL.filter((f) => f.startsWith(`${number}_`));
	if (found.length !== 1) throw new Error(`expected exactly one ${number} migration, found ${found.length}`);
	return found[0];
}

/** Its text, read when asked, so a mutation run reads the mutant. */
export function migrationSql(number: string): string {
	return readFileSync(join(MIGRATIONS_DIR, migrationFile(number)), 'utf8');
}

/** Every migration before `number`, in file order, behind the fixture completion. */
export function treeShortOf(number: string): readonly string[] {
	return [FIXTURE_COMPLETION, ...ALL.filter((f) => f < `${number}_`)];
}

/** Every migration up to and including `number`. */
export function treeThrough(number: string): readonly string[] {
	return [...treeShortOf(number), migrationFile(number)];
}
