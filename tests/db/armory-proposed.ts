// tests/db/armory-proposed.ts
//
// THE TEST-ONLY LOADER FOR THE PROPOSED ARMORY SCHEMA, and the reason it is a
// loader rather than a migration.
//
// docs/armory/proposed/NNNN_armory.sql is NOT in supabase/migrations/, and must
// not be until Mr. Pina approves it: .github/workflows/migrate.yml applies the
// lowest unapplied file in that directory to PRODUCTION on every push to main.
// So this module reads the proposed file IN PLACE. startTestDb resolves every
// entry relative to supabase/migrations, which makes a `../../docs/...` path the
// whole mechanism: nothing is copied, nothing is written, and
// tests/db/armory-proposed.test.ts asserts that afterwards no file under
// supabase/migrations names armory at all.
//
// THE CHAIN IS THE WHOLE TREE, read off disk, behind the fixture completion,
// which is exactly the database production holds before an apply (the
// chain-0230 shape). The proposed file then goes on top.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');
export const PROPOSED_DIR = join(REPO_ROOT, 'docs', 'armory', 'proposed');

/** The one proposed file. Its NNNN prefix is literal until the router numbers it. */
const PROPOSED_FILES = readdirSync(PROPOSED_DIR).filter((f) => f.endsWith('.sql'));
if (PROPOSED_FILES.length !== 1) {
	throw new Error(`expected exactly one proposed armory file, found ${PROPOSED_FILES.length}`);
}
export const PROPOSED_NAME = PROPOSED_FILES[0];
export const PROPOSED_PATH = join(PROPOSED_DIR, PROPOSED_NAME);

/** Read once, so a mutation run reads the mutant. */
export const PROPOSED_SQL = readFileSync(PROPOSED_PATH, 'utf8');

/** The proposed file as startTestDb resolves it: relative to supabase/migrations. */
export const PROPOSED_ENTRY = relative(MIGRATIONS_DIR, PROPOSED_PATH);

const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

/** Every committed migration, in file order. */
export const ALL_MIGRATIONS = readdirSync(MIGRATIONS_DIR)
	.filter((f) => /^\d{4}_.*\.sql$/.test(f))
	.sort();

/** The production-shaped chain BEFORE the proposed file. */
export const PRE_ARMORY: readonly string[] = [FIXTURE_COMPLETION, ...ALL_MIGRATIONS];

/** The chain WITH the proposed file applied on top, in place. */
export const WITH_ARMORY: readonly string[] = [...PRE_ARMORY, PROPOSED_ENTRY];
