// tests/claude-md.test.ts
//
// `CLAUDE.md` is read by every Claude Code session in this repository before it
// does anything, which makes a false sentence in it an INSTRUCTION rather than a
// stale document. Between 2026-09-05 and 2026-09-06, seven bundles each found
// one, and every one of them correctly declined to edit a file outside its
// ownership -- so seven corrections went into `docs/history/`, where the next
// session does not look. This is the check that keeps the corrected version
// corrected. See `tools/claude-md-check.mjs` for what it compares and, more
// importantly, for the large majority of the document it deliberately does not.
//
// WHY THIS IS A TEST AND NOT A HARNESS PASS. A stale document fails SILENTLY.
// It renders, it reads as authoritative, every sentence in it is grammatical,
// and the only symptom is a session acting on a claim that stopped being true --
// which is exactly the class `CLAUDE.md`'s own testing rule reserves automated
// tests for. Nothing here needs a browser or a database.
//
// THREE HALVES, AND THE SECOND AND THIRD ARE THE ONES THAT MATTER.
//
//   1. The real tree must be clean.
//   2. Every parser must return a NON-EMPTY set over the real document. Each
//      assertion in the checker is a loop over something a parser produced, so a
//      parser that silently matched nothing reports a spotless run over nothing
//      at all. Prompt 0060 shipped that control on `docs/GAUNTLET.md` for this
//      reason and it is the one control this file could not do without.
//   3. Every check must be shown to BITE, against a synthetic tree built for the
//      purpose -- a real directory on disk, because the checker reads a tree and
//      a stubbed `fs` would prove something about the stub.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	ABSENT_BY_DESIGN,
	DOC,
	ELIDED_SQL,
	NOT_OURS,
	REPO_ROOT,
	backticked,
	checkClaudeMd,
	citedCssTokens,
	citedNpmScripts,
	citedPaths,
	citedRoutes,
	citedSqlObjects,
	citedSymbols,
	formatFindings,
	lineOf,
	realCssTokens,
	realNpmScripts,
	realSqlObjects,
	realSymbols,
	stripJsComments,
	stripSqlComments,
	treeRoutes
} from '../tools/claude-md-check.mjs';

const doc = () => fs.readFileSync(path.join(REPO_ROOT, DOC), 'utf8');

describe('the real tree', () => {
	it('agrees with CLAUDE.md', () => {
		const { ok, findings } = checkClaudeMd();
		// The formatted findings ARE the failure message on purpose. A bare
		// `expect(ok).toBe(true)` sends a person to read four thousand lines,
		// which is the failure mode this whole bundle exists to end.
		expect(ok, `\n${formatFindings(findings)}\n`).toBe(true);
	});
});

describe('the vacuity control', () => {
	// A parser that matched nothing would make its whole check inert, and the
	// run would come back green. These floors are set well under the real counts
	// so ordinary editing does not move them, and well over zero.
	it('every parser reads a non-empty set out of the real document', () => {
		const d = doc();
		expect(backticked(d).length).toBeGreaterThan(1000);
		expect(citedPaths(d).length).toBeGreaterThan(80);
		expect(citedRoutes(d).length).toBeGreaterThan(30);
		expect(citedSqlObjects(d).length).toBeGreaterThan(50);
		expect(citedSymbols(d).length).toBeGreaterThan(100);
		expect(citedNpmScripts(d).length).toBeGreaterThan(4);
		expect(citedCssTokens(d).length).toBeGreaterThan(30);
	});

	it('every tree reader returns a non-empty set', () => {
		expect(treeRoutes().size).toBeGreaterThan(100);
		expect(realSqlObjects().size).toBeGreaterThan(1000);
		expect(realSymbols().size).toBeGreaterThan(1000);
		expect(realNpmScripts().size).toBeGreaterThan(5);
		expect(realCssTokens().size).toBeGreaterThan(100);
	});

	it('the comment strippers remove a comment and keep the code beside it', () => {
		// A POSITIVE AND A NEGATIVE READING TOGETHER. A stripper that returned
		// the empty string would pass every "comment removed" assertion on its
		// own, and that is not hypothetical: the first version of
		// `stripJsComments` matched `/*` inside a vitest include glob and ate
		// most of `vitest.config.ts`, which reported `globalSetup` as a name
		// this repository does not use.
		const js = ['// gone_from_comment', 'const kept_in_code = 1;', '/*', ' * also_gone', ' */'].join(
			'\n'
		);
		expect(stripJsComments(js)).not.toContain('gone_from_comment');
		expect(stripJsComments(js)).not.toContain('also_gone');
		expect(stripJsComments(js)).toContain('kept_in_code');

		const sql = ['--   0151  gone_from_comment', 'select kept_in_code;'].join('\n');
		expect(stripSqlComments(sql)).not.toContain('gone_from_comment');
		expect(stripSqlComments(sql)).toContain('kept_in_code');

		// The real config file, which is what the glob bug was found on.
		const config = fs.readFileSync(path.join(REPO_ROOT, 'vitest.config.ts'), 'utf8');
		expect(config).toContain('globalSetup');
		expect(stripJsComments(config)).toContain('globalSetup');
	});
});

describe('the exemption tables', () => {
	// Each is an exemption from an existence rule, so each is pinned by LENGTH:
	// a list nobody counts is a list that quietly widens. Names rather than
	// numbers alone, because a swap of one entry for another keeps the count.
	it('NOT_OURS is exactly the four upstream names and the one example filename', () => {
		expect(NOT_OURS.map((n) => n.token).sort()).toEqual(
			[
				'CSSRuleList',
				'CSSStyleRule',
				'FontFace',
				'closeBundle',
				'helperTable',
				'normalizeContentType',
				'style.css',
				'supabase/.temp/',
				'updateWheelTransformWorld'
			].sort()
		);
		expect(NOT_OURS.every((n) => n.why.length > 20)).toBe(true);
	});

	it('every ABSENT_BY_DESIGN entry carries a kind and a reason', () => {
		expect(ABSENT_BY_DESIGN.length).toBe(14);
		for (const a of ABSENT_BY_DESIGN) {
			expect(['path', 'source', 'sql', 'symbol']).toContain(a.where);
			expect(a.why.length).toBeGreaterThan(20);
		}
	});

	it('every ABSENT_BY_DESIGN token is actually named in the document', () => {
		// An entry for a name the document no longer mentions is an exemption
		// standing over nothing, and it would never fail.
		const d = doc();
		for (const a of ABSENT_BY_DESIGN) {
			const bare = a.token.replace(/^src\/lib\//, '$lib/').replace(/\/$/, '');
			expect(d.includes(bare) || d.includes(a.token), `${a.token} is not named in ${DOC}`).toBe(
				true
			);
		}
	});

	it('ELIDED_SQL is the three fragments of one comma list', () => {
		expect(ELIDED_SQL).toEqual(['_item', '_can_read_attachment', '_sections']);
	});
});

// ---------------------------------------------------------------------------
// A synthetic tree, so every check can be shown to bite.
// ---------------------------------------------------------------------------

let dir: string;

/**
 * The smallest tree `checkClaudeMd` will read without erroring.
 *
 * It WIPES the directory first, so each case below differs from the clean
 * scaffold in exactly one way. Accumulating fixtures across cases is how a
 * negative control stops proving which check it triggered.
 */
function scaffold(): void {
	fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(path.join(dir, 'supabase/migrations'), { recursive: true });
	fs.mkdirSync(path.join(dir, 'src/routes/classroom'), { recursive: true });
	fs.mkdirSync(path.join(dir, 'src/lib'), { recursive: true });
	fs.writeFileSync(
		path.join(dir, 'supabase/migrations/0001_core.sql'),
		'create or replace function public.classroom_set_rubric() returns void as $$ begin end; $$ language plpgsql;'
	);
	fs.writeFileSync(path.join(dir, 'src/routes/classroom/+page.svelte'), '<h1>x</h1>');
	fs.writeFileSync(path.join(dir, 'src/lib/edit-baseline.ts'), 'export class EditBaseline {}\n');
	// The token corpus reads stylesheets and components, never `.ts`, because
	// that is where a custom property is actually declared.
	fs.writeFileSync(path.join(dir, 'src/app.css'), ':root { --cr-gutter: 1rem; }\n');
	fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'x' } }));
	writeDoc();
}

function writeDoc(extra = ''): void {
	fs.writeFileSync(
		path.join(dir, DOC),
		`# CLAUDE.md

The rubric is written by \`classroom_set_rubric\`. The class page is
\`/classroom\`. The baseline is \`$lib/edit-baseline.ts\` and its class is
\`EditBaseline\`. Run \`npm run test\`. The gutter token is \`--cr-gutter\`.
${extra}`
	);
}

function checks(): string[] {
	return checkClaudeMd(dir).findings.map((f) => f.check);
}

function findings() {
	return checkClaudeMd(dir).findings;
}

beforeAll(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-md-check-'));
});
afterAll(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

describe('every check bites', () => {
	it('the clean scaffold is clean, which is the negative control for all of these', () => {
		scaffold();
		expect(findings()).toEqual([]);
	});

	it('path-missing: a named file that is not there', () => {
		scaffold();
		writeDoc('\nThe helper is `$lib/notebook/nowhere.ts`.\n');
		const f = findings();
		expect(f.map((x) => x.check)).toEqual(['path-missing']);
		expect(f[0].claim).toContain('$lib/notebook/nowhere.ts');
		expect(f[0].tree).toContain('src/lib/notebook/nowhere.ts');
		// EVERY finding carries the line the document writes the name on. The
		// token alone still means opening a four-thousand-line file and
		// searching it, which is most of the cost of acting on a finding.
		const lines = fs.readFileSync(path.join(dir, DOC), 'utf8').split('\n');
		expect(f[0].line).toBeGreaterThan(0);
		expect(lines[f[0].line - 1]).toContain('nowhere.ts');
	});

	it('lineOf finds a name written with an argument list', () => {
		// The document writes several objects as `foo(uuid)`, so a locator that
		// only matched `\`foo\`` would report line 0 for exactly the names most
		// likely to be wrong.
		expect(lineOf('a\nb `classroom_section_roster(uuid)` c\nd', 'classroom_section_roster')).toBe(2);
	});

	it('route-missing: a named route nothing answers', () => {
		scaffold();
		writeDoc('\nThe console is at `/classroom/nowhere/deeper`.\n');
		expect(checks()).toEqual(['route-missing']);
	});

	it('route-missing does NOT fire on a parameterised or prefix route', () => {
		// The positive control for the route matcher itself: a rule that
		// rejected `[param]` segments would redden most of the document.
		scaffold();
		fs.mkdirSync(path.join(dir, 'src/routes/classroom/[sectionId]'), { recursive: true });
		fs.writeFileSync(path.join(dir, 'src/routes/classroom/[sectionId]/+page.svelte'), '<h1>x</h1>');
		writeDoc('\nThe section page is `/classroom/abc` and the area is `/classroom`.\n');
		expect(findings()).toEqual([]);
	});

	it('sql-object-unknown: a plausible-sounding object that never existed', () => {
		scaffold();
		writeDoc('\nGrading calls `classroom_set_rubrics`.\n');
		const f = findings();
		expect(f.map((x) => x.check)).toEqual(['sql-object-unknown']);
		expect(f[0].claim).toContain('classroom_set_rubrics');
		// The finding NAMES the real neighbour, which is the difference between
		// a report somebody can act on and one that sends them reading.
		expect(f[0].tree).toContain('classroom_set_rubric');
	});

	it('sql-object-unknown: a name that lives only in a SQL comment is NOT real', () => {
		// THE CASE THIS CHECK EXISTS FOR. `gauntlet_practice_meter` appears in
		// this repository exactly once outside `CLAUDE.md`, inside applied
		// migration 0155's own comment, and no such function has ever existed --
		// which is how the wrong name reached the document in the first place.
		scaffold();
		fs.appendFileSync(
			path.join(dir, 'supabase/migrations/0001_core.sql'),
			'\n--   0151  classroom_ghost_function  (a name that only lives here)\n'
		);
		writeDoc('\nThe meter is `classroom_ghost_function`.\n');
		expect(checks()).toEqual(['sql-object-unknown']);

		// And the positive control beside it: the same name in real SQL passes.
		fs.appendFileSync(
			path.join(dir, 'supabase/migrations/0001_core.sql'),
			'\nselect public.classroom_ghost_function();\n'
		);
		expect(findings()).toEqual([]);
	});

	it('symbol-unknown: a named export that is not exported anywhere', () => {
		scaffold();
		writeDoc('\nThe comparison is `EditBaselineTool`.\n');
		const f = findings();
		expect(f.map((x) => x.check)).toEqual(['symbol-unknown']);
		expect(f[0].claim).toContain('EditBaselineTool');
	});

	it('symbol-unknown: a symbol that lives only in a JS comment is NOT real', () => {
		scaffold();
		fs.appendFileSync(path.join(dir, 'src/lib/edit-baseline.ts'), '\n// see GhostHelper for why\n');
		writeDoc('\nThe helper is `GhostHelper`.\n');
		expect(checks()).toEqual(['symbol-unknown']);
	});

	it('npm-script-missing: a command the manifest does not define', () => {
		scaffold();
		writeDoc('\nRun `npm run verify:nothing` first.\n');
		const f = findings();
		expect(f.map((x) => x.check)).toEqual(['npm-script-missing']);
		expect(f[0].tree).toContain('`test`');
	});

	it('css-token-unknown: a token no stylesheet declares or reads', () => {
		scaffold();
		writeDoc('\nThe edge is `--cr-nonexistent`.\n');
		expect(checks()).toEqual(['css-token-unknown']);
	});

	it('css-token-unknown does NOT fire on a CLI long flag', () => {
		scaffold();
		writeDoc('\nMerge with `--no-ff` and never `--force-with-lease`.\n');
		expect(findings()).toEqual([]);
	});

	// EVERY FIXTURE BELOW TAKES ITS NAME FROM `ABSENT_BY_DESIGN` RATHER THAN
	// SPELLING ONE, and that is a requirement rather than a style. Several of
	// those names are retired Foundry modules and environment variables, and
	// `tests/foundry-bundle-url.test.ts` sweeps every `.ts` directly under
	// `tests/` for exactly them -- writing one here as a literal reddens that
	// sweep, which it did the first time this file ran in the full suite. Taking
	// them from the table also stops this file being a second copy of it.
	const absentOfKind = (where: string) => {
		const entry = ABSENT_BY_DESIGN.find((a: { where: string }) => a.where === where);
		expect(entry, `ABSENT_BY_DESIGN has no ${where} entry to exercise`).toBeTruthy();
		return entry as { token: string; where: string; why: string };
	};

	it('absent-by-design-returned: a deleted module coming back', () => {
		// THE INVERSE RULE, and the only one an existence check cannot express.
		// The document says a particular module is deleted and forbids renaming
		// its replacement back to it. That paragraph is just as wrong if the file
		// returns, and nothing else in this suite would notice.
		scaffold();
		const { token } = absentOfKind('path');
		fs.mkdirSync(path.join(dir, path.dirname(token)), { recursive: true });
		fs.writeFileSync(path.join(dir, token), 'export const x = 1;');
		writeDoc(`\nThe deleted module was \`${token.replace('src/lib/', '$lib/')}\`.\n`);
		const f = findings();
		expect(f.map((x) => x.check)).toEqual(['absent-by-design-returned']);
		expect(f[0].claim).toContain(path.basename(token));
		expect(f[0].line).toBeGreaterThan(0);
	});

	it('absent-by-design-returned: a retired environment variable read again', () => {
		scaffold();
		const { token } = absentOfKind('source');
		fs.writeFileSync(path.join(dir, 'src/lib/retired.ts'), `export const host = env.${token};`);
		writeDoc(`\nRetired: \`${token}\`.\n`);
		expect(checks()).toEqual(['absent-by-design-returned']);
	});

	it('absent-by-design does NOT fire on a mention inside a comment', () => {
		// A test that SWEEPS for a retired name is the enforcement of the
		// retirement, not a violation of it, and so is a comment explaining why
		// it went. Only real code counts as a reader.
		scaffold();
		const { token } = absentOfKind('source');
		fs.writeFileSync(
			path.join(dir, 'src/lib/retired.ts'),
			`// ${token} is retired and must not come back\nexport const x = 1;`
		);
		writeDoc(`\nRetired: \`${token}\`.\n`);
		expect(findings()).toEqual([]);
	});

	it('renaming a real object is noticed', () => {
		// CONTROL 2 from the bundle that wrote this: the document is left
		// untouched and the TREE moves under it. This is the direction that
		// actually happens -- somebody renames an RPC and the paragraph naming
		// the old one keeps reading as authoritative.
		scaffold();
		const mig = path.join(dir, 'supabase/migrations/0001_core.sql');
		fs.writeFileSync(mig, fs.readFileSync(mig, 'utf8').replace(/classroom_set_rubric/g, 'classroom_set_criteria'));
		const f = findings();
		expect(f.map((x) => x.check)).toEqual(['sql-object-unknown']);
		expect(f[0].claim).toContain('classroom_set_rubric');
		expect(f[0].tree).toContain('classroom_set_criteria');
	});

	it('one broken fixture raises one finding, not a cascade', () => {
		// Each case above asserts an EXACT check list rather than "contains", so
		// this is really an assertion about all of them: a checker whose rules
		// overlap reports one defect several ways and the reader cannot tell how
		// many things are actually wrong.
		scaffold();
		writeDoc('\nThe helper is `$lib/notebook/nowhere.ts` and the route is `/nowhere/deeper`.\n');
		expect(checks().sort()).toEqual(['path-missing', 'route-missing']);
	});
});
