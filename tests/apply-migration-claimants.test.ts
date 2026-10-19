// tests/apply-migration-claimants.test.ts
//
// WHICH LEDGER ENTRY AUTHORISES A MIGRATION, read the one way
// `.github/workflows/migrate.yml` reads it (`ledgerClaimants`, through
// `node tools/migration-claims.mjs --claimants <n>`), and the check that every
// migration still waiting has EXACTLY ONE such entry (`pendingClaimProblems`).
//
// WHY THIS EARNS A TEST. The failure is silent until it is total: on
// 2026-10-18 two entries claimed 0271 (ledger 0396, which had reserved
// 0268-0272 ahead of time and released the unused three only in prose, and
// ledger 0400, which wrote 0271), `migrate.yml` refused, and every migration
// above it waited behind the refusal for a day while each landing session's
// suite stayed green. Ledger 0407 measured it from the run logs.
//
// THE OWN-NUMBER SHAPE. The report that opened 0407 suspected the 0271 LEDGER
// entry (`0271-viewport-feature-edges.md`) was being read as a claim on
// migration 0271. It was not, and the fixtures below pin that it never can be:
// only the permission line is read, never the file name or the heading.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ledgerClaimants, pendingClaimProblems, migrationNumber } from '../tools/migration-claims.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LEDGER_DIR = join(ROOT, 'docs', 'prompt-ledger', 'entries');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const APPLIED_DIR = join(ROOT, 'docs', 'migrations-applied');

const entry = (file: string, permitted: string, extra = '') => ({
	file,
	text: `# ${file.slice(0, 4)} A bundle\n\n- Issued: 2026-10-18\n- Migration permitted: ${permitted}\n${extra}- Status: pushed\n`
});

const committed = () =>
	readdirSync(LEDGER_DIR)
		.filter((f) => f.endsWith('.md'))
		.map((f) => ({ file: f, text: readFileSync(join(LEDGER_DIR, f), 'utf8') }));

describe('ledgerClaimants reads the permission line and nothing else', () => {
	it("never reads an entry's own number as a claim (the 0271 shape)", () => {
		// Its own number is in the file name AND the heading, and the line says no.
		const own = entry('0271-viewport-feature-edges.md', 'no. Claims: none. Highest on origin/main at issue: 0215');
		expect(ledgerClaimants(271, [own])).toEqual([]);
		// Permits without naming a number: still not a claim on its own number.
		const vague = entry('0271-vague.md', 'yes, as many as the work needs.');
		expect(ledgerClaimants(271, [vague])).toEqual([]);
		// Its own number in the Notes is prose.
		const notes = entry('0271-notes.md', 'no.', '- Notes: ledger 0271 wrote no migration 0271.\n');
		expect(ledgerClaimants(271, [notes])).toEqual([]);
	});

	it('reads a claim in both shapes: inline, and Claims as its own bullet', () => {
		// POSITIVE CONTROL for the absences above: the same reader does see a claim.
		const inline = entry('0400-a.md', 'yes. Claims: 0270, 0271, 0272. Highest on origin/main at issue: 0269');
		const bullet = entry('0401-b.md', 'yes, one.', '- Claims: 0271\n');
		expect(ledgerClaimants(271, [inline])).toEqual(['0400-a.md']);
		expect(ledgerClaimants('0271', [bullet])).toEqual(['0401-b.md']);
		expect(ledgerClaimants(271, [inline, bullet])).toEqual(['0400-a.md', '0401-b.md']);
	});

	it('never reads the "Highest at issue" number, and keeps only entries --ledger can name', () => {
		const refusing = entry('0300-r.md', 'no. Highest on origin/main at issue: 0271');
		expect(ledgerClaimants(271, [refusing])).toEqual([]);
		const slug = { ...entry('0400-a.md', 'yes. Claims: 0271'), file: 'ideacad-direct-modeler.md' };
		expect(ledgerClaimants(271, [slug])).toEqual([]);
	});

	it('reproduces the 2026-10-18 collision: a reserved range left standing beside the writer', () => {
		const reserved = entry('0396-x.md', 'yes, additive only. Claims: 0268, 0269, 0270, 0271, 0272');
		const writer = entry('0400-a.md', 'yes. Claims: 0270, 0271, 0272');
		expect(ledgerClaimants(271, [reserved, writer])).toEqual(['0396-x.md', '0400-a.md']);
		const problems = pendingClaimProblems({ migrations: [269, 270, 271], recorded: [270], entries: [reserved, writer] });
		expect(problems).toEqual([{ number: 271, claimants: ['0396-x.md', '0400-a.md'] }]);
		// The repair is the entry stating the numbers it used.
		const fixed = entry('0396-x.md', 'yes, additive only. Claims: 0268, 0269 (the rest released unused)');
		expect(pendingClaimProblems({ migrations: [269, 270, 271], recorded: [270], entries: [fixed, writer] })).toEqual([]);
	});

	it('reports a waiting migration nobody claims', () => {
		expect(pendingClaimProblems({ migrations: [272, 273], recorded: [271], entries: [entry('0400-a.md', 'yes. Claims: 0272')] })).toEqual([
			{ number: 273, claimants: [] }
		]);
	});
});

describe('the committed tree', () => {
	const entries = committed();
	const migrations = readdirSync(MIGRATIONS_DIR)
		.map((f) => migrationNumber(f))
		.filter((n): n is number => n !== null);
	const recorded = readdirSync(APPLIED_DIR)
		.filter((f) => /^\d{4}-.*\.md$/.test(f))
		.map((f) => Number(f.slice(0, 4)));

	it('every migration still waiting for migrate.yml has exactly one claimant', () => {
		expect(migrations.length).toBeGreaterThan(250); // positive control: files were read
		expect(recorded.length).toBeGreaterThan(50); // positive control: records were read
		expect(pendingClaimProblems({ migrations, recorded, entries })).toEqual([]);
	});

	it('POSITIVE CONTROL: the same check sees a second claim planted on the newest migration', () => {
		const top = Math.max(...migrations);
		const planted = entry('9999-planted.md', `yes. Claims: ${String(top).padStart(4, '0')}`);
		const problems = pendingClaimProblems({ migrations, recorded: recorded.filter((n) => n < top), entries: [...entries, planted] });
		expect(problems.map((p) => p.number)).toContain(top);
	});

	it('names the bundles that wrote the migrations this repair unblocks', () => {
		expect(ledgerClaimants(271, entries)).toEqual(['0400-website-connector-slice-1.md']);
		expect(ledgerClaimants(272, entries)).toEqual(['0400-website-connector-slice-1.md']);
		expect(ledgerClaimants(273, entries)).toEqual(['0404-armory-sw-version-and-drive-backup.md']);
		// The two the report suspected or that carried a rename claim nothing.
		expect(ledgerClaimants(271, entries)).not.toContain('0271-viewport-feature-edges.md');
		expect(entries.find((e) => e.file.startsWith('0407-'))).toBeTruthy();
		expect(ledgerClaimants(273, entries).some((f) => f.startsWith('0407-'))).toBe(false);
	});

	it('the CLI flag migrate.yml calls answers the same thing', () => {
		const out = spawnSync(process.execPath, ['tools/migration-claims.mjs', '--claimants', '0271'], { cwd: ROOT, encoding: 'utf8' });
		expect(out.status, out.stderr).toBe(0);
		expect(out.stdout.trim()).toBe('0400-website-connector-slice-1.md');
	});
});
