// tests/db/html-manifest-team-roles.test.ts
//
// LEDGER 0435, MIGRATION 0301: THE MANIFEST GATE WIDENS AND ANSWERS EVERY
// STORED MANIFEST EXACTLY AS BEFORE.
//
// CLAUDE.md, DEPLOY ORDERING: a widened gate's first obligation is to answer
// every ALREADY STORED document exactly as the deployed one did. The corpus is
// the stored documents themselves: every manifest the classroom export wrote
// under materials/ (one per HTML assignment ever imported, ledger 0431), put to
// the DEPLOYED gate (0195) first, then to 0301 applied over the same database,
// case for case. The positive control is a role manifest: refused by the
// deployed gate, accepted after, so a no-op apply cannot pass.
//
// The TypeScript validator is held to the same answers on the new shapes, so
// the importer's refusal and the database's are the same sentence.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestDb, type TestDb } from './harness';
import { migrationSql, treeShortOf } from './chain-0435';
import { validateHtmlManifest } from '../../src/lib/classroom/html-assignment/manifest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const CHAIN = treeShortOf('0301');

function manifestsUnder(dir: string): { name: string; manifest: unknown }[] {
	const out: { name: string; manifest: unknown }[] = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) out.push(...manifestsUnder(path));
		else if (entry === 'manifest.json') {
			out.push({ name: path.slice(ROOT.length), manifest: JSON.parse(readFileSync(path, 'utf8')) });
		}
	}
	return out;
}

const CORPUS = manifestsUnder(join(ROOT, 'materials'));

const LEVELS = [
	{ points: 4, label: 'Complete', short: 'All there', descriptor: 'Every part is present.' },
	{ points: 2, label: 'Developing', short: 'Half there', descriptor: 'Half the parts are present.' },
	{ points: 0, label: 'Absent', short: 'Nothing', descriptor: 'Nothing is present.' }
];

function roleManifest(over: Record<string, unknown> = {}, moduleOver: Record<string, unknown> = {}) {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Launcher plan',
		course: 'IDEA209H',
		points: 8,
		team: { roles: [{ id: 'drive', title: 'Drive' }, { id: 'frame', title: 'Frame and mount' }] },
		modules: [
			{
				id: 'shared',
				title: 'Shared plan',
				points: 4,
				audience: 'team',
				blocks: [{ id: 'goal', field: 'goalText', type: 'longText' }],
				criteria: [{ id: 'c1', text: 'Goal', points: 4, levels: LEVELS }]
			},
			{
				id: 'drive-req',
				title: 'Drive requirement',
				points: 4,
				audience: 'role',
				role: 'drive',
				blocks: [{ id: 'drive-text', field: 'driveText', type: 'longText' }],
				criteria: [{ id: 'c1', text: 'Requirement', points: 4, levels: LEVELS }],
				...moduleOver
			}
		],
		...over
	};
}

/** Each case: what it is, and the manifest put to both gates. */
const CASES: { name: string; manifest: unknown }[] = [
	...CORPUS,
	{ name: 'refused: audience everyone', manifest: roleManifest({ team: undefined }, { audience: 'everyone', role: undefined }) },
	{ name: 'refused: no criteria', manifest: roleManifest({ team: undefined }, { audience: 'team', role: undefined, criteria: [] }) }
];

async function answer(db: TestDb, manifest: unknown): Promise<string> {
	try {
		await db.sql('select public._classroom_check_html_manifest($1::jsonb)', [JSON.stringify(manifest)]);
		return 'accepted';
	} catch (e) {
		return `refused: ${(e as Error).message}`;
	}
}

describe('0301 widens the manifest gate and answers every stored manifest as before', () => {
	let db: TestDb;
	const before = new Map<string, string>();
	const after = new Map<string, string>();
	let roleBefore = '';
	let roleAfter = '';

	beforeAll(async () => {
		db = await startTestDb(CHAIN);
		for (const c of CASES) before.set(c.name, await answer(db, c.manifest));
		roleBefore = await answer(db, roleManifest());
		await db.sql(migrationSql('0301'));
		for (const c of CASES) after.set(c.name, await answer(db, c.manifest));
		roleAfter = await answer(db, roleManifest());
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('reads a real corpus, with team modules in it', () => {
		expect(CORPUS.length).toBeGreaterThanOrEqual(20);
		const teamModules = CORPUS.flatMap((c) =>
			((c.manifest as { modules: { audience?: string }[] }).modules ?? []).filter((m) => m.audience === 'team')
		);
		expect(teamModules.length).toBeGreaterThan(0);
		expect(CORPUS.every((c) => !('team' in (c.manifest as object)))).toBe(true);
	});

	it('every stored manifest answers exactly as the deployed gate did', () => {
		const corpusAnswers = CORPUS.map((c) => [c.name, before.get(c.name), after.get(c.name)]);
		expect(corpusAnswers.filter(([, b]) => b === 'accepted').length).toBe(CORPUS.length);
		for (const [name, b, a] of corpusAnswers) expect(a, name).toBe(b);
	});

	it('a manifest the deployed gate refused is still refused (the audience sentence names the new value)', () => {
		expect(before.get('refused: no criteria')).toBe(after.get('refused: no criteria'));
		expect(before.get('refused: audience everyone')).toMatch(/^refused: .*"team" or "individual"/);
		expect(after.get('refused: audience everyone')).toMatch(/^refused: .*"team", "individual" or "role"/);
	});

	it('positive control: a role manifest is refused before and accepted after', () => {
		expect(roleBefore).toMatch(/^refused/);
		expect(roleAfter).toBe('accepted');
	});

	it('refuses a role module whose role is undeclared, and a malformed team, in the validator words', async () => {
		const cases = [
			roleManifest({}, { role: 'ballpath' }),
			roleManifest({ team: undefined }),
			roleManifest({ team: { roles: [{ id: 'a b', title: 'x' }] } }),
			roleManifest({ team: { roles: [{ id: 'drive', title: 'A' }, { id: 'drive', title: 'B' }] } }),
			roleManifest({ team: 'yes' })
		];
		for (const m of cases) {
			const sqlAnswer = await answer(db, m);
			expect(sqlAnswer).toMatch(/^refused: /);
			const ts = validateHtmlManifest('', m);
			expect(ts.errors).toContain(sqlAnswer.replace(/^refused: /, ''));
		}
		expect(validateHtmlManifest('', roleManifest()).errors).toEqual([]);
	});
});
