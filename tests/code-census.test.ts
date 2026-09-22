// tests/code-census.test.ts
//
// THE CODE CENSUS, whose every regression is silent by construction.
//
// A lines-of-code figure is the most silent thing a page can be wrong about:
// it renders, it is plausible, nobody re-derives it, and the one number this
// repository carried before today -- `35,000+ lines`, hardcoded in the FSP
// day-one deck with a speaker note asking whoever presented it to go and find
// the real one -- was wrong by more than an order of magnitude for months in
// front of an audience. The whole point of deriving it at build time is that
// nobody has to notice; the whole risk is that nobody would.
//
// FOUR THINGS ARE PINNED:
//
//  1. THE CLASSIFIER, against fixtures whose expected values are counted BY
//     HAND off the fixture text rather than produced by the function.
//  2. THE ARITHMETIC: code + comment + blank = total, for the whole census and
//     for every bucket of every axis, and the buckets of each axis sum to the
//     whole. A classifier that loses a line to no column at all would pass
//     every fixture above and fail here.
//  3. THE EXCLUSIONS, in both directions and with counts.
//  4. THE REAL TREE, DERIVED TWICE. The last block below counts this
//     repository with `buildCodeCensus` and again with a deliberately
//     different method, and asserts the two agree. There is no pinned number
//     anywhere in it -- a figure written down here would be a RATCHET that
//     records whatever last happened, and would be red on the next commit.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
	CENSUS_EXCLUSIONS,
	CENSUS_LANGUAGES,
	buildCodeCensus,
	censusSummary,
	exclusionFor,
	groupDigits,
	languageFor,
	layerFor,
	sharePercent,
	tallyLines,
	type CensusFile
} from '$lib/code-census';

const lang = (id: string) => {
	const found = CENSUS_LANGUAGES.find((l) => l.id === id);
	if (!found) throw new Error(`no language ${id}`);
	return found;
};

describe('the line classifier', () => {
	/**
	 * COUNTED BY HAND OFF THE TEXT BELOW. 1 line comment, 1 code, 1 blank,
	 * 1 code -- and the mixed line is CODE, which is the convention stated in
	 * the module and the conservative direction.
	 */
	it('separates blank, comment and code in TypeScript', () => {
		const t = tallyLines(
			['// a note', 'const a = 1;', '', 'const b = 2; // trailing note'].join('\n') + '\n',
			lang('ts')
		);
		expect(t).toEqual({ blank: 1, comment: 1, code: 2, total: 4 });
	});

	it('carries a block comment across lines', () => {
		const t = tallyLines(
			['/**', ' * why', ' */', 'export const x = 1;'].join('\n') + '\n',
			lang('ts')
		);
		expect(t).toEqual({ blank: 0, comment: 3, code: 1, total: 4 });
	});

	/**
	 * THE CASE THE NAIVE CLASSIFIER GETS WRONG: a block opened at the END of a
	 * line of code. Without the trailing-opener scan, the two lines after it
	 * are counted as code and the whole rest of the file can go with them.
	 */
	it('notices a block opened after code on the same line', () => {
		const t = tallyLines(
			['const x = 1; /* note', 'still the note', 'ends here */', 'const y = 2;'].join('\n') + '\n',
			lang('ts')
		);
		expect(t).toEqual({ blank: 0, comment: 2, code: 2, total: 4 });
	});

	it('closes a block that opens and closes on one line without leaking', () => {
		const t = tallyLines(['const x = /* inline */ 1;', 'const y = 2;'].join('\n') + '\n', lang('ts'));
		expect(t).toEqual({ blank: 0, comment: 0, code: 2, total: 2 });
	});

	/**
	 * A WHITESPACE-ONLY LINE IS BLANK WHEREVER IT IS, an open block comment
	 * included. That is the convention an ordinary `grep -c '^[[:space:]]*$'`
	 * agrees with, which is how anybody checks this figure; the alternative
	 * charges an empty line inside a JSDoc block to the comment column and
	 * makes the total irreproducible. Measured on the real tree, the two
	 * conventions differ by 1,226 lines.
	 */
	it('counts a blank line inside a block comment as blank', () => {
		const t = tallyLines(['/*', 'a', '', 'b', '*/'].join('\n') + '\n', lang('ts'));
		expect(t).toEqual({ blank: 1, comment: 4, code: 0, total: 5 });
	});

	it('reads both comment syntaxes in one .svelte file', () => {
		const t = tallyLines(
			[
				'<!-- markup note -->',
				'<script lang="ts">',
				'\t// script note',
				'\tlet x = 1;',
				'</script>',
				'',
				'<style>',
				'\t/* style note */',
				'\tp { color: red; }',
				'</style>'
			].join('\n') + '\n',
			lang('svelte')
		);
		expect(t).toEqual({ blank: 1, comment: 3, code: 6, total: 10 });
	});

	it('reads SQL line comments, which are not slashes', () => {
		const t = tallyLines(['-- why', 'create table t (id uuid);'].join('\n') + '\n', lang('sql'));
		expect(t).toEqual({ blank: 0, comment: 1, code: 1, total: 2 });
	});

	/**
	 * A WORD-SHAPED COMMENT TOKEN NEEDS A WORD BOUNDARY. `rem` opens a comment
	 * in a batch file; `remove(...)` does not, and a bare prefix test would
	 * claim it.
	 */
	it('does not let a word-shaped token claim an identifier', () => {
		const t = tallyLines(['rem a note', 'remove x'].join('\n') + '\n', lang('bat'));
		expect(t).toEqual({ blank: 0, comment: 1, code: 1, total: 2 });
	});

	it('counts a final line with no trailing newline', () => {
		expect(tallyLines('a\nb', lang('ts')).total).toBe(2);
		expect(tallyLines('a\nb\n', lang('ts')).total).toBe(2);
	});

	it('normalises CRLF so a Windows-saved file counts the same', () => {
		expect(tallyLines('// a\r\nconst b = 1;\r\n', lang('ts'))).toEqual(
			tallyLines('// a\nconst b = 1;\n', lang('ts'))
		);
	});
});

describe('which files are code at all', () => {
	it.each([
		['src/lib/a.ts', 'ts'],
		['src/lib/A.Svelte', 'svelte'],
		['supabase/migrations/0001_x.sql', 'sql'],
		['tools/x.mjs', 'js'],
		['src/app.css', 'css'],
		['.github/workflows/ci.yml', 'yml']
	])('%s is %s', (path, id) => {
		expect(languageFor(path)?.id).toBe(id);
	});

	it.each([
		'docs/history/entry.md',
		'package.json',
		'static/audio/hit.wav',
		'static/IDEA/icon-192.png',
		'.gitignore',
		'LICENSE'
	])('%s is not code', (path) => {
		expect(languageFor(path)).toBeNull();
	});
});

describe('the exclusions', () => {
	it.each([
		['docs/coin-economy/archive/legacy-system/src/lib/legacy/coin-entry.html', 'archive'],
		['src/lib/ideacad/kernel/vendor/remus/remus_wasm_bg.js', 'vendor'],
		['static/fsp/day2/_ds/idea-design-system-abc/_ds_bundle.js', 'delivered'],
		['materials/idea100/spec.html', 'app-written']
	])('%s is excluded by %s', (path, id) => {
		expect(exclusionFor(path)?.id).toBe(id);
	});

	// THE POSITIVE CONTROL for the four rows above: real paths that must NOT be
	// caught. Without it a rule that matched everything would pass all four.
	it.each([
		'src/lib/portal-apps.ts',
		'src/routes/+page.svelte',
		'tests/code-census.test.ts',
		'tools/browser-verify/run.mjs',
		'supabase/migrations/0001_init.sql',
		'static/push-sw.js'
	])('%s counts', (path) => {
		expect(exclusionFor(path)).toBeNull();
	});

	it('every exclusion carries a reason a panel can print', () => {
		for (const rule of CENSUS_EXCLUSIONS) {
			expect(rule.reason.length).toBeGreaterThan(40);
			expect(rule.label.length).toBeGreaterThan(3);
		}
		expect(CENSUS_EXCLUSIONS).toHaveLength(4);
	});

	/**
	 * THERE IS NO `node_modules` RULE AND THERE MUST NOT BE ONE. The census is
	 * `git ls-files`, so an installed dependency is never offered to this
	 * module at all; a rule here would suggest the boundary is a list somebody
	 * maintains rather than a property of what git tracks, and the day it is
	 * spelled wrong nothing would say so.
	 */
	it('does not try to exclude what git never offers', () => {
		expect(CENSUS_EXCLUSIONS.map((r) => r.id)).not.toContain('node_modules');
		expect(exclusionFor('node_modules/svelte/package.json')).toBeNull();
		expect(languageFor('node_modules/svelte/src/index-client.js')?.id).toBe('js');
	});

	it('an excluded file is reported, never silently dropped', () => {
		const census = buildCodeCensus(
			[
				{ path: 'src/lib/a.ts', text: 'const a = 1;\n' },
				{ path: 'materials/x.html', text: '<p>one</p>\n<p>two</p>\n' }
			],
			{ complete: true }
		);
		expect(census.files).toBe(1);
		expect(census.total).toBe(1);
		expect(census.excluded).toHaveLength(1);
		expect(census.excluded[0]).toMatchObject({ id: 'app-written', files: 1, total: 2 });
	});
});

describe('the layers', () => {
	it.each([
		['src/routes/foundry/+page.svelte', 'routes'],
		['src/lib/voice/commands.ts', 'lib'],
		['supabase/migrations/0001_x.sql', 'db'],
		['tests/code-census.test.ts', 'tests'],
		['tools/browser-verify/run.mjs', 'tools'],
		['.github/workflows/ci.yml', 'tools'],
		['vite.config.ts', 'other']
	])('%s is %s', (path, id) => {
		expect(layerFor(path).id).toBe(id);
	});
});

describe('an incomplete census renders nothing rather than a smaller number', () => {
	it('zeroes everything and says so', () => {
		const census = buildCodeCensus([{ path: 'src/lib/a.ts', text: 'const a = 1;\n' }], {
			complete: false
		});
		expect(census.complete).toBe(false);
		expect(census.total).toBe(0);
		expect(census.files).toBe(0);
		expect(census.languages).toEqual([]);
		expect(census.areas).toEqual([]);
		expect(census.excluded).toEqual([]);
	});
});

describe('the formatters', () => {
	it('groups digits without a locale deciding how', () => {
		expect(groupDigits(781360)).toBe('781 360');
		expect(groupDigits(999)).toBe('999');
		expect(groupDigits(0)).toBe('0');
	});

	it('never divides by zero', () => {
		expect(sharePercent(0, 0)).toBe(0);
		expect(sharePercent(50, 200)).toBe(25);
	});

	it('states every column in the summary sentence', () => {
		const census = buildCodeCensus([{ path: 'src/lib/a.ts', text: '// x\nconst a = 1;\n\n' }], {
			complete: true
		});
		const line = censusSummary(census);
		expect(line).toContain('code');
		expect(line).toContain('comment');
		expect(line).toContain('blank');
		expect(line).toContain('files');
	});
});

/**
 * THE REAL TREE, DERIVED TWICE, WITH NO NUMBER WRITTEN DOWN.
 *
 * Method A is the shipping one: `git ls-files`, then `buildCodeCensus`.
 * Method B counts the SAME file set with a deliberately different mechanism --
 * a regex over the file's text rather than a state machine over its lines --
 * and the two are asserted to agree. A pinned figure here would be the ratchet
 * `tests/spec-instructions-budget.test.ts` was deleted for being: it would
 * record whatever last happened and go red on the next commit.
 */
describe('the census of this repository reconciles with an independent count', () => {
	const paths = execFileSync('git', ['ls-files', '-z'], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024
	})
		.split('\0')
		.filter(Boolean);

	const files: CensusFile[] = [];
	for (const path of paths) {
		if (!languageFor(path)) continue;
		try {
			files.push({ path, text: readFileSync(path, 'utf8') });
		} catch {
			/* unreadable as text: the plugin skips these too */
		}
	}

	const census = buildCodeCensus(files, { complete: true });

	it('found a tree to count', () => {
		// The sweep generated something: without this, every assertion below
		// passes vacuously over an empty file list.
		expect(paths.length).toBeGreaterThan(1000);
		expect(files.length).toBeGreaterThan(500);
		expect(census.total).toBeGreaterThan(10_000);
	});

	it('agrees with a newline count taken a different way', () => {
		let total = 0;
		let blank = 0;
		let counted = 0;
		for (const file of files) {
			if (exclusionFor(file.path)) continue;
			counted++;
			const text = file.text.replace(/\r/g, '');
			if (text === '') continue;
			// Newlines, plus one for a final line that has none. This is the
			// `wc -l` convention with the trailing-newline correction, and it
			// shares no code with `tallyLines`.
			const newlines = (text.match(/\n/g) ?? []).length;
			total += text.endsWith('\n') ? newlines : newlines + 1;
			blank += (text.match(/^[ \t]*$/gm) ?? []).length - (text.endsWith('\n') ? 1 : 0);
		}
		expect(counted).toBe(census.files);
		expect(total).toBe(census.total);
		expect(blank).toBe(census.blank);
	});

	it('loses no line to a column that does not exist', () => {
		expect(census.code + census.comment + census.blank).toBe(census.total);
		for (const axis of [census.languages, census.layers, census.areas]) {
			for (const row of axis) {
				expect(row.code + row.comment + row.blank).toBe(row.total);
			}
		}
	});

	it('every axis accounts for the whole census', () => {
		for (const axis of [census.languages, census.layers, census.areas]) {
			expect(axis.length).toBeGreaterThan(1);
			expect(axis.reduce((s, r) => s + r.total, 0)).toBe(census.total);
			expect(axis.reduce((s, r) => s + r.files, 0)).toBe(census.files);
		}
	});

	it('is sorted biggest first on every axis', () => {
		for (const axis of [census.languages, census.layers, census.areas]) {
			const totals = axis.map((r) => r.total);
			expect([...totals].sort((a, b) => b - a)).toEqual(totals);
		}
	});

	/**
	 * THE THING THE FIGURE IS FOR. This repository's comment column is a large
	 * fraction of it, which is the fact the blank/comment/code split exists to
	 * show; a classifier that quietly stopped recognising block comments would
	 * still pass every arithmetic assertion above while reporting a codebase
	 * with almost no reasoning written into it.
	 */
	it('recognises this repository as heavily commented', () => {
		expect(census.comment).toBeGreaterThan(census.total * 0.15);
		expect(census.code).toBeGreaterThan(census.comment);
	});
});
