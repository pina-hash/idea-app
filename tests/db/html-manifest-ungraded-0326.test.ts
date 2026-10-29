// tests/db/html-manifest-ungraded-0326.test.ts
//
// LEDGER 0458, MIGRATION 0326: A 0-POINT MODULE MAY CARRY NO CRITERIA, AND
// EVERY STORED MANIFEST ANSWERS EXACTLY AS BEFORE.
//
// CLAUDE.md, DEPLOY ORDERING: the corpus is every manifest the classroom
// export wrote under materials/, put to the DEPLOYED gate (0301) first, then
// to 0326 applied over the same database, case for case. The positive control
// is an ungraded module: refused before, accepted after, so a no-op apply
// cannot pass. The TypeScript validator is held to the same answers on the
// new shape.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestDb, type TestDb } from './harness';
import { migrationSql, treeShortOf } from './chain-0436';
import { validateHtmlManifest } from '../../src/lib/classroom/html-assignment/manifest';

const NUMBER = '0326';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function manifestsUnder(dir: string): { name: string; manifest: unknown }[] {
	const out: { name: string; manifest: unknown }[] = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) out.push(...manifestsUnder(path));
		else if (entry === 'manifest.json') out.push({ name: path.slice(ROOT.length), manifest: JSON.parse(readFileSync(path, 'utf8')) });
	}
	return out;
}

const CORPUS = manifestsUnder(join(ROOT, 'materials'));

const LEVELS = [
	{ points: 4, label: 'Complete', short: 'All there', descriptor: 'Every part is present.' },
	{ points: 2, label: 'Developing', short: 'Half there', descriptor: 'Half the parts are present.' },
	{ points: 0, label: 'Absent', short: 'Nothing', descriptor: 'Nothing is present.' }
];

function manifest(extra: Record<string, unknown>, points = 4) {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Survey',
		course: 'IDEA100',
		points,
		modules: [
			...(points > 0
				? [{ id: 'graded', title: 'Graded', points: 4, blocks: [{ id: 'g1', field: 'g1', type: 'text' }], criteria: [{ id: 'c1', text: 'Answer', points: 4, levels: LEVELS }] }]
				: []),
			{ id: 'deeper', title: 'Go deeper', points: 0, blocks: [{ id: 'd1', field: 'd1', type: 'longText' }], ...extra }
		]
	};
}

const SHAPES: { name: string; m: unknown; after: 'accepted' | 'refused' }[] = [
	{ name: 'ungraded module, criteria absent', m: manifest({}), after: 'accepted' },
	{ name: 'ungraded module, criteria empty', m: manifest({ criteria: [] }), after: 'accepted' },
	{ name: 'ungraded module, criteria null', m: manifest({ criteria: null }), after: 'accepted' },
	{ name: 'a whole ungraded post', m: manifest({ criteria: [] }, 0), after: 'accepted' },
	{ name: 'a 4-point module with no criteria', m: { ...manifest({}), points: 8, modules: [manifest({}).modules[0], { id: 'x', title: 'X', points: 4, blocks: [], criteria: [] }] }, after: 'refused' },
	{ name: 'criteria not a list', m: manifest({ criteria: 'none' }), after: 'refused' }
];

async function answer(db: TestDb, m: unknown): Promise<string> {
	try {
		await db.sql('select public._classroom_check_html_manifest($1::jsonb)', [JSON.stringify(m)]);
		return 'accepted';
	} catch (e) {
		return `refused: ${(e as Error).message}`;
	}
}

describe('0326 lets a 0-point module carry no criteria and answers every stored manifest as before', () => {
	let db: TestDb;
	const before = new Map<string, string>();
	const after = new Map<string, string>();

	beforeAll(async () => {
		db = await startTestDb(treeShortOf(NUMBER));
		for (const c of CORPUS) before.set(c.name, await answer(db, c.manifest));
		for (const s of SHAPES) before.set(s.name, await answer(db, s.m));
		await db.sql(migrationSql(NUMBER));
		for (const c of CORPUS) after.set(c.name, await answer(db, c.manifest));
		for (const s of SHAPES) after.set(s.name, await answer(db, s.m));
		// It re-applies.
		await db.sql(migrationSql(NUMBER));
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('reads a real corpus', () => {
		expect(CORPUS.length).toBeGreaterThanOrEqual(20);
	});

	it('every stored manifest answers exactly as the deployed gate did', () => {
		for (const c of CORPUS) expect(after.get(c.name), c.name).toBe(before.get(c.name));
		expect(CORPUS.filter((c) => before.get(c.name) === 'accepted').length).toBe(CORPUS.length);
	});

	it('positive control: every ungraded shape is refused before and accepted after', () => {
		for (const s of SHAPES.filter((x) => x.after === 'accepted')) {
			expect(before.get(s.name), s.name).toMatch(/^refused: .*criteria/);
			expect(after.get(s.name), s.name).toBe('accepted');
		}
	});

	it('a graded module with no criteria, and a criteria value that is not a list, stay refused in the same words', () => {
		for (const s of SHAPES.filter((x) => x.after === 'refused')) {
			expect(after.get(s.name), s.name).toMatch(/^refused: /);
			expect(after.get(s.name), s.name).toBe(before.get(s.name));
		}
	});

	it('the importer agrees on every shape', () => {
		for (const s of SHAPES) {
			const ts = validateHtmlManifest('', s.m);
			if (s.after === 'accepted') expect(ts.errors, s.name).toEqual([]);
			else expect(ts.errors.length, s.name).toBeGreaterThan(0);
		}
	});
});
