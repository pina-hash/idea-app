// tests/db/chain-0233.ts
//
// What the 0233 suites share, and nothing they assert.
//
// 0233 is ONE migration for the 2026-10-07 round, built from six parts (two
// Armory parts, the feedback edits, the per-student read, quick post files and
// the Foundry major-release flag). It applies whole or not at all, so every
// suite boots the whole tree short of 0233, read off disk, behind the fixture
// completion (the chain-0230 shape), and applies the file on top. That chain is
// exactly the database production holds before the apply.
//
// The generic catalog helpers are chain-0230's and are re-exported rather than
// copied, so there is one implementation of each.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export {
	pasteTrap,
	keysDeep,
	catalogFingerprint,
	canExecute,
	overloads,
	tablePrivileges,
	refusal
} from './chain-0230';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));

/** Passed relative to the migrations directory, the shape startTestDb resolves. */
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

const ALL = readdirSync(MIGRATIONS_DIR)
	.filter((f) => /^\d{4}_.*\.sql$/.test(f))
	.sort();

const FILES_0233 = ALL.filter((f) => f.startsWith('0233_'));
if (FILES_0233.length !== 1) {
	throw new Error(`expected exactly one 0233 migration, found ${FILES_0233.length}`);
}

/** The file under test. */
export const MIGRATION_0233 = FILES_0233[0];

/** Its text, read once when a suite loads, so a mutation run reads the mutant. */
export const SQL_0233 = readFileSync(join(MIGRATIONS_DIR, MIGRATION_0233), 'utf8');

/** Every migration before 0233, in file order, behind the fixture completion. */
export const PRE_0233: readonly string[] = [FIXTURE_COMPLETION, ...ALL.filter((f) => f < '0233')];

/** How many migration files PRE_0233 applies, so a suite can say it was not short. */
export const PRE_0233_COUNT = PRE_0233.length - 1;

/** The chain with 0233 on top, for a suite that only needs the end state. */
export const WITH_0233: readonly string[] = [...PRE_0233, MIGRATION_0233];

/**
 * One named part of the file, between its BEGIN and END markers, or null. A
 * suite asserting something about its own part reads it through this, so a
 * check on one part cannot pass on text another part happens to contain.
 */
export function part0233(key: string): string | null {
	const begin = `-- ===== PART ${key} BEGIN =====`;
	const end = `-- ===== PART ${key} END =====`;
	const a = SQL_0233.indexOf(begin);
	const b = SQL_0233.indexOf(end);
	if (a === -1 || b === -1 || b < a) return null;
	return SQL_0233.slice(a + begin.length, b);
}
