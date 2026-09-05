// tests/gauntlet-doc.test.ts
//
// `docs/GAUNTLET.md` is the reference a person opening GAUNTLET reads first,
// and until 2026-09-05 it opened by telling that reader every claim in it was
// a lead rather than a fact. That header was honest: the 2026-08-29 audit
// corrected the file by hand, and by 2026-09-05 it was stale in fifteen places
// again, eleven of them mechanically checkable. This is the check that keeps
// the corrected version corrected -- see `tools/gauntlet-doc-check.mjs` for
// what it compares and, more importantly, for what it deliberately does not.
//
// WHY THIS IS A TEST AND NOT A HARNESS PASS. A stale document fails SILENTLY.
// It renders, it reads as authoritative, every sentence in it is grammatical,
// and the only symptom is somebody acting on a claim that stopped being true
// months ago -- which is the shape CLAUDE.md's testing rule reserves automated
// tests for. Nothing here needs a browser or a database.
//
// TWO HALVES, AND THE SECOND IS THE ONE THAT MATTERS.
//
//   1. The real tree must be clean. This is the assertion that reddens when
//      somebody lands a GAUNTLET migration, adds a route, or renames an
//      object without touching the document.
//
//   2. Every check must be shown to BITE, against a synthetic tree built for
//      the purpose. A check that has never failed has not been tested, and
//      this repository has shipped several that could not fail. The fixtures
//      below are a real directory on disk, because the checker reads a tree
//      rather than a string and a stubbed `fs` would prove something about
//      the stub.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	REPO_ROOT,
	TABLE_FLOOR,
	checkGauntletDocs,
	citedIdentifiers,
	citedPaths,
	formatFindings,
	gauntletMigrations,
	migrationFiles,
	section,
	tableRows,
	treeRoutes
} from '../tools/gauntlet-doc-check.mjs';

describe('the real tree', () => {
	it('agrees with docs/GAUNTLET.md and docs/GAUNTLET-DESIGN.md', () => {
		const { ok, findings } = checkGauntletDocs();
		// The formatted findings are the failure message on purpose: a bare
		// `expect(ok).toBe(true)` sends a person to read 800 lines, which is
		// the failure mode this whole bundle exists to end.
		expect(ok, `\n${formatFindings(findings)}\n`).toBe(true);
	});

	it('reads a non-empty document, a non-empty table and a non-empty route set', () => {
		// A POSITIVE CONTROL for the check above. Every assertion in
		// `checkGauntletDocs` is a for-loop over something parsed out of the
		// document or the tree, so a parser that silently matched nothing
		// would report a perfectly clean run over nothing at all.
		const doc = fs.readFileSync(path.join(REPO_ROOT, 'docs/GAUNTLET.md'), 'utf8');
		expect(tableRows(doc).length).toBeGreaterThan(20);
		expect(citedPaths(doc).length).toBeGreaterThan(10);
		expect(citedIdentifiers(doc).length).toBeGreaterThan(20);
		expect(treeRoutes().length).toBeGreaterThan(10);
		expect(gauntletMigrations(migrationFiles()).length).toBeGreaterThan(30);
		expect(section(doc, '## Shell')).toContain('/gauntlet/tools');
	});

	it('covers every GAUNTLET migration in the tree, in one of the two halves', () => {
		// The document splits at TABLE_FLOOR: above it a migration needs a
		// table ROW, at or below it a mention anywhere in the body. This
		// asserts the split is TOTAL -- that no migration falls between the
		// two rules and is checked by neither.
		const doc = fs.readFileSync(path.join(REPO_ROOT, 'docs/GAUNTLET.md'), 'utf8');
		const rows = new Set(tableRows(doc));
		const uncovered = gauntletMigrations(migrationFiles()).filter(({ number, file }) => {
			if (Number(number) > TABLE_FLOOR) return !rows.has(number);
			return !doc.includes('`' + number + '`') && !doc.includes(file.replace(/\.sql$/, ''));
		});
		expect(uncovered.map((m) => m.file)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// A synthetic tree, so every check can be shown to bite.
// ---------------------------------------------------------------------------

let dir: string;

/**
 * The smallest tree `checkGauntletDocs` will read without erroring.
 *
 * It WIPES the directory first, so each case below differs from the clean
 * scaffold in exactly one way. Accumulating fixtures across cases is how a
 * negative control stops proving which check it triggered.
 */
function scaffold(): void {
	fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(path.join(dir, 'supabase/migrations'), { recursive: true });
	fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
	fs.mkdirSync(path.join(dir, 'src/routes/gauntlet/speedrun'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'supabase/migrations/0004_gauntlet.sql'), 'create table public.challenges();');
	fs.writeFileSync(
		path.join(dir, 'supabase/migrations/0146_gauntlet_reveal.sql'),
		'create or replace view public.gauntlet_leaderboard as select 1;'
	);
	fs.writeFileSync(path.join(dir, 'src/routes/gauntlet/speedrun/+page.svelte'), '<h1>x</h1>');
	fs.writeFileSync(path.join(dir, 'docs/GAUNTLET-DESIGN.md'), '# design\n');
	writeDoc();
}

function writeDoc(extra = ''): void {
	fs.writeFileSync(
		path.join(dir, 'docs/GAUNTLET.md'),
		`# doc

The body names \`0004\`.

## Shell

- \`/gauntlet/speedrun\`: the list.

## Table

| Migration | What it changed |
| --- | --- |
| \`0146\` | a thing |
${extra}`
	);
}

function checks(): string[] {
	return checkGauntletDocs(dir).findings.map((f) => f.check);
}

function findings() {
	return checkGauntletDocs(dir).findings;
}

beforeAll(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gauntlet-doc-'));
});

afterAll(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

describe('every check bites', () => {
	it('the scaffold itself is clean, so each case below is the ONLY difference', () => {
		scaffold();
		expect(findings()).toEqual([]);
	});

	it('names a migration above the floor that has no table row', () => {
		scaffold();
		fs.writeFileSync(path.join(dir, 'supabase/migrations/0199_gauntlet_new.sql'), '-- x');
		const f = findings();
		expect(f.map((x) => x.check)).toEqual(['migration-table-missing-row']);
		expect(f[0].claim).toContain('`0199`');
		expect(f[0].tree).toContain('0199_gauntlet_new.sql');
		fs.rmSync(path.join(dir, 'supabase/migrations/0199_gauntlet_new.sql'));
		expect(findings()).toEqual([]);
	});

	it('names a table row whose migration does not exist', () => {
		scaffold();
		writeDoc('| `0777` | a migration nobody wrote |\n');
		const f = findings();
		expect(f.map((x) => x.check)).toEqual(['migration-table-phantom-row']);
		expect(f[0].claim).toContain('`0777`');
		expect(f[0].tree).toContain('0777_*.sql');
	});

	it('names a migration at or below the floor the body never mentions', () => {
		scaffold();
		fs.writeFileSync(path.join(dir, 'supabase/migrations/0009_gauntlet_authoring.sql'), '-- x');
		const f = findings();
		expect(f.map((x) => x.check)).toEqual(['migration-unnamed']);
		expect(f[0].claim).toContain('`0009`');
	});

	it('accepts a below-floor migration named by its full filename, not only its number', () => {
		scaffold();
		fs.writeFileSync(path.join(dir, 'supabase/migrations/0009_gauntlet_authoring.sql'), '-- x');
		writeDoc('\nSee `0009_gauntlet_authoring.sql` for authoring.\n');
		expect(findings()).toEqual([]);
	});

	it('names a cited path that does not exist', () => {
		scaffold();
		writeDoc('\nThe form lives in `src/lib/gauntlet/NoSuchForm.svelte`.\n');
		const f = findings();
		expect(f.map((x) => x.check)).toEqual(['cited-path-missing']);
		expect(f[0].claim).toContain('NoSuchForm.svelte');
	});

	it('exempts a path a sentence says does NOT exist', () => {
		// The exemption `static/gauntlet/` relies on. A true negative claim
		// about the tree must not read as a stale one.
		scaffold();
		writeDoc('\n`static/gauntlet/` does not exist and never did.\n');
		expect(findings()).toEqual([]);
	});

	it('names a route in the tree that the Shell section omits', () => {
		scaffold();
		fs.mkdirSync(path.join(dir, 'src/routes/gauntlet/run-review'), { recursive: true });
		fs.writeFileSync(path.join(dir, 'src/routes/gauntlet/run-review/+page.svelte'), '<h1>x</h1>');
		const f = findings();
		expect(f.map((x) => x.check)).toEqual(['route-unlisted']);
		expect(f[0].claim).toContain('/gauntlet/run-review');
	});

	it('is not satisfied by a route named OUTSIDE the Shell section', () => {
		// The whole reason the route check reads one section: `/gauntlet/run-review`
		// was named in a migration table row for a week while the route list
		// omitted it, and a whole-document check passes on exactly that.
		scaffold();
		fs.mkdirSync(path.join(dir, 'src/routes/gauntlet/run-review'), { recursive: true });
		fs.writeFileSync(path.join(dir, 'src/routes/gauntlet/run-review/+page.svelte'), '<h1>x</h1>');
		writeDoc('| `0146` | a row mentioning `/gauntlet/run-review` |\n');
		expect(checks()).toEqual(['route-unlisted']);
	});

	it('names a route the document lists that does not exist', () => {
		scaffold();
		writeDoc('\nAlso `/gauntlet/retired-mode`.\n');
		const f = findings();
		expect(f.map((x) => x.check)).toEqual(['route-phantom']);
		expect(f[0].tree).toContain('does not exist');
	});

	it('reports a missing Shell section rather than passing without one', () => {
		scaffold();
		fs.writeFileSync(
			path.join(dir, 'docs/GAUNTLET.md'),
			'# doc\n\nThe body names `0004`.\n\n| Migration | What |\n| --- | --- |\n| `0146` | a thing |\n'
		);
		// ONE finding naming the cause, not one per route. A document with no
		// Shell section has no route inventory to be wrong about, so listing
		// every route as unlisted would bury the sentence that says why. What
		// matters is that the absence REPORTS rather than silently satisfying
		// the loop it disables, which is what `if (shell && ...)` would do on
		// its own.
		expect(checks()).toEqual(['shell-section-missing']);
	});

	it('names an identifier that exists only in a SQL comment', () => {
		// The `gauntlet_practice_meter` case, which is the reason the
		// existence test strips comments: the name appears in an applied
		// migration's header and has never been an object.
		scaffold();
		fs.writeFileSync(
			path.join(dir, 'supabase/migrations/0151_gauntlet_meter.sql'),
			'--   0151  gauntlet_practice_meter  (a name that only lives here)\n' +
				'create or replace function public.gauntlet_practice_pressure() returns int as $$ select 1 $$ language sql;\n'
		);
		writeDoc('| `0151` | meters practice, see `gauntlet_practice_meter` |\n');
		const f = findings();
		expect(f.map((x) => x.check)).toEqual(['identifier-unknown']);
		expect(f[0].claim).toContain('gauntlet_practice_meter');
		expect(f[0].tree).toContain('gauntlet_practice_pressure');
	});

	it('accepts the identifier once the document names the real one', () => {
		scaffold();
		fs.writeFileSync(
			path.join(dir, 'supabase/migrations/0151_gauntlet_meter.sql'),
			'--   0151  gauntlet_practice_meter  (a name that only lives here)\n' +
				'create or replace function public.gauntlet_practice_pressure() returns int as $$ select 1 $$ language sql;\n'
		);
		writeDoc('| `0151` | meters practice, see `gauntlet_practice_pressure` |\n');
		expect(findings()).toEqual([]);
	});
});
