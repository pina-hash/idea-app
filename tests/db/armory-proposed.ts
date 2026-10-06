// tests/db/armory-proposed.ts
//
// THE LOADER FOR THE ARMORY SCHEMA, which is migration 0231 since Mr. Pina
// approved it on 2026-10-06 (decision 46). It used to read a proposed file in
// docs/armory/proposed/ in place; that file is now
// supabase/migrations/0231_armory.sql and migrate.yml applies it to production.
// The export names are kept because the short-link suites import them.
//
// THE CHAIN IS THE WHOLE TREE, read off disk, behind the fixture completion,
// minus 0231 itself: exactly the database production holds before the apply
// (the chain-0230 shape). 0231 then goes on top.

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

/** The production-shaped chain BEFORE 0231: every other migration. */
export const PRE_ARMORY: readonly string[] = [
	FIXTURE_COMPLETION,
	...ALL_MIGRATIONS.filter((f) => f !== PROPOSED_NAME)
];

/** The chain WITH 0231 applied on top. */
export const WITH_ARMORY: readonly string[] = [...PRE_ARMORY, PROPOSED_ENTRY];
