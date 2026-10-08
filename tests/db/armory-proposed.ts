// tests/db/armory-proposed.ts
//
// THE LOADER FOR THE ARMORY SCHEMA, which is migration 0231 since Mr. Pina
// approved it on 2026-10-06 (decision 46). It used to read a proposed file in
// docs/armory/proposed/ in place; that file is now
// supabase/migrations/0231_armory.sql and migrate.yml applies it to production.
// The export names are kept because the short-link suites import them.
//
// THE CHAIN IS THE WHOLE TREE SHORT OF 0231, read off disk, behind the fixture
// completion: exactly the database production held before the apply (the
// chain-0230 shape). 0231 then goes on top. It used to be "every file but
// 0231", which put 0232 (built on 0231) in front of the file it builds on.
// 0232, Armory v2 (ledger 0366), goes on top of that. 0233 is the round file
// of 2026-10-07: two of its parts are Armory v0.3, so it joins the Armory
// series, resolved by its number because its name is the round's.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');

/** The Armory migration. */
export const PROPOSED_NAME = '0231_armory.sql';
export const PROPOSED_PATH = join(MIGRATIONS_DIR, PROPOSED_NAME);

/** Read once, so a mutation run reads the mutant. */
export const PROPOSED_SQL = readFileSync(PROPOSED_PATH, 'utf8');

/** The migration as startTestDb resolves it: relative to supabase/migrations. */
export const PROPOSED_ENTRY = PROPOSED_NAME;

const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

/** Every committed migration, in file order, 0231 included. */
export const ALL_MIGRATIONS = readdirSync(MIGRATIONS_DIR)
	.filter((f) => /^\d{4}_.*\.sql$/.test(f))
	.sort();

/** The production-shaped chain BEFORE 0231: every earlier migration. */
export const PRE_ARMORY: readonly string[] = [
	FIXTURE_COMPLETION,
	...ALL_MIGRATIONS.filter((f) => f < PROPOSED_NAME)
];

/** The chain WITH 0231 applied on top. */
export const WITH_ARMORY: readonly string[] = [...PRE_ARMORY, PROPOSED_ENTRY];

/** Armory v2 (ledger 0366). */
export const V2_NAME = '0232_armory_v2.sql';
export const V2_SQL = readFileSync(join(MIGRATIONS_DIR, V2_NAME), 'utf8');

/**
 * Armory v0.3 (the 2026-10-07 round file, parts armory-reports and
 * armory-core). Found by its number: the file is named for the round.
 */
const FILES_0233 = ALL_MIGRATIONS.filter((f) => f.startsWith('0233_'));
if (FILES_0233.length !== 1) {
	throw new Error(`expected exactly one 0233 migration, found ${FILES_0233.length}`);
}
export const V3_NAME = FILES_0233[0];
export const V3_SQL = readFileSync(join(MIGRATIONS_DIR, V3_NAME), 'utf8');

/** Armory v0.3.1 (ledger 0374): armory_break_locks, the Force check in batch. */
export const V031_NAME = '0234_armory_break_locks.sql';

/** The Armory migrations, in order: the only files that may name armory_. */
export const ARMORY_MIGRATIONS: readonly string[] = [PROPOSED_NAME, V2_NAME, V3_NAME, V031_NAME];
