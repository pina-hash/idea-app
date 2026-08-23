import { describe, expect, it } from 'vitest';

import {
	FOUNDRY_ALLOWED_EXTENSIONS,
	FOUNDRY_IGNORED_EXTENSIONS,
	foundryMime,
	isIgnoredExtension,
	planStructure,
	scanHtml,
	scanJs,
	type HtmlFacts,
	type HtmlReader
} from '../src/lib/foundry/preflight.ts';

/**
 * INLINE SCRIPTS, AND THE LINE NUMBER THAT HAS TO BE RIGHT.
 *
 * `scanJs` only ever read `.js` files, which meant every JavaScript rule was
 * switched off for the submission shape where ALL the JavaScript is inline --
 * a single HTML file, which is now a first-class upload and will be the most
 * common one. It is the SAME scanner, handed a line offset; the alternative is
 * two copies of every rule and every sentence in that module.
 *
 * THE OFFSET IS THE PART THAT CAN BE SILENTLY WRONG. A message names a line
 * the student then goes and looks at, so a number measured from the top of the
 * script block instead of the top of the file is worse than no number: it is
 * confidently wrong and sends them to the wrong place. That is what these
 * fixtures are for, and why the offending line sits well down the file after
 * several earlier blocks rather than in the first one.
 *
 * THE READER IS STUBBED, AND THAT IS THE SEAM RATHER THAN A BYPASS. `scanHtml`
 * takes its `HtmlReader` as a parameter precisely because the two runtimes
 * parse differently; handing it facts is how both real callers work. The
 * scripts below are copied out of the fixture they sit in, so what is being
 * tested is the arithmetic that turns a position into a line -- the parsing
 * itself is exercised against a real browser DOMParser and against deno-dom.
 */

/** A reader that reports exactly the inline scripts it is handed. */
function readerFor(scripts: string[], refs: HtmlFacts['refs'] = []): HtmlReader {
	return () => ({ refs, title: 'Fixture', inlineScripts: scripts });
}

const SCRIPT_A = '\n\tconst A = 1;\n';
const SCRIPT_B = '\n\tconst B = 2;\n';
const SCRIPT_C = "\n\t// a comment about the tide table\n\tconst C = 3;\n\tfetch('https://api.example.com/tides');\n";

/**
 * Line numbers are marked in the comment beside the fixture so a reader can
 * count them without running anything.
 */
const PAGE = [
	'<!doctype html>', //                                            1
	'<html lang="en">', //                                           2
	'<head>', //                                                     3
	'<meta charset="utf-8">', //                                     4
	'<title>Tide Clock</title>', //                                  5
	'<script>', //                                                   6
	'\tconst A = 1;', //                                             7
	'</script>', //                                                  8
	'<script>', //                                                   9
	'\tconst B = 2;', //                                            10
	'</script>', //                                                 11
	'</head>', //                                                   12
	'<body>', //                                                    13
	'<h1>Tide Clock</h1>', //                                       14
	'<script>', //                                                  15
	'\t// a comment about the tide table', //                       16
	'\tconst C = 3;', //                                            17
	"\tfetch('https://api.example.com/tides');", //  <-- THE ONE     18
	'</script>', //                                                 19
	'</body>', //                                                   20
	'</html>' //                                                    21
].join('\n');

describe('inline scripts are scanned, with the file s own line numbers', () => {
	it('reports the network call at its line in the HTML file, not in the block', () => {
		const scan = scanHtml(
			'index.html',
			PAGE,
			readerFor([SCRIPT_A, SCRIPT_B, SCRIPT_C])
		);

		expect(scan.failures).toEqual([]);
		expect(scan.warnings).toHaveLength(1);

		const warning = scan.warnings[0]!;
		expect(warning.file).toBe('index.html');
		// 18, not 4. The fetch is the fourth line of the third block.
		expect(warning.line).toBe(18);
		// And the SENTENCE carries it too, which is the half a caller correcting
		// only the `line` field would leave wrong.
		expect(warning.message).toContain('index.html line 18 uses fetch.');
	});

	/**
	 * The positive control for the fixture itself: the same script scanned as a
	 * standalone file reports line 4, so 18 above is the offset doing work
	 * rather than a coincidence.
	 */
	it('the same script as a .js file reports its own line 4', () => {
		const direct = scanJs('app.js', SCRIPT_C);
		expect(direct.warnings[0]!.line).toBe(4);
		expect(direct.warnings[0]!.message).toContain('app.js line 4 uses fetch.');
	});

	it('refuses a URL import from an inline script, at the right line', () => {
		const script = "\nimport confetti from 'https://cdn.skypack.dev/canvas-confetti';\n";
		const page = ['<!doctype html>', '<head></head>', '<body>', '<script type="module">', "import confetti from 'https://cdn.skypack.dev/canvas-confetti';", '</script>', '</body>'].join('\n');
		const scan = scanHtml('index.html', page, readerFor([script]));
		expect(scan.failures).toHaveLength(1);
		// Line 5: doctype, head, body, the opening <script>, then the import.
		expect(scan.failures[0]!.line).toBe(5);
		expect(scan.failures[0]!.message).toContain('index.html line 5 imports from');
	});

	/**
	 * A `<script src="...">` is judged as a REFERENCE, by the same rule that
	 * judges a stylesheet. Its body is empty, so the reader leaves it out and
	 * nothing is reported twice.
	 */
	it('does not double-report a script that carries a src', () => {
		const page = '<!doctype html>\n<script src="https://cdn.example.com/x.js"></script>\n';
		const scan = scanHtml(
			'index.html',
			page,
			readerFor([], [{ tag: 'script', attr: 'src', value: 'https://cdn.example.com/x.js' }])
		);
		expect(scan.failures).toHaveLength(1);
		expect(scan.failures[0]!.message).toContain('from the internet');
	});

	/**
	 * CRLF IS THE TRAP THIS WOULD OTHERWISE FALL INTO SILENTLY. An HTML parser
	 * normalizes CRLF to LF in the DOM, so on a file saved by a Windows editor
	 * the text handed back is not a substring of the source and every lookup
	 * returns null. Line numbers are counts of newlines, so stripping the
	 * carriage returns from both sides cannot move one.
	 */
	it('finds the right line in a file with Windows line endings', () => {
		const crlf = PAGE.split('\n').join('\r\n');
		const scan = scanHtml('index.html', crlf, readerFor([SCRIPT_A, SCRIPT_B, SCRIPT_C]));
		expect(scan.warnings[0]!.line).toBe(18);
	});

	it('scans every block, not just the first', () => {
		const noisy = "\nfetch('a');\n";
		const page = ['<script>', "fetch('a');", '</script>', '<p>x</p>', '<script>', "fetch('a');", '</script>'].join('\n');
		const scan = scanHtml('index.html', page, readerFor([noisy, noisy]));
		// Two identical blocks resolve to their own positions, because
		// `LineFinder` advances a cursor per needle.
		expect(scan.warnings.map((w) => w.line)).toEqual([2, 6]);
	});

	/**
	 * A PRE-EXISTING OFF-BY-ONE, FOUND BY THIS LANE AND FIXED IN THE SHARED
	 * MODULE, WHICH MEANS IT WAS WRONG IN `.js` FILES TOO.
	 *
	 * The patterns open with `(?:^|[^\w$.])` so `prefetch` and `this.fetch` do
	 * not match, which makes the match START at the character before the call.
	 * At column 0 that character is the previous line's newline, so a `fetch` on
	 * line 3 was reported as "app.js line 2". Statements at column 0 are most of
	 * the statements anybody writes, so it was wrong more often than right.
	 */
	it('reports a call at column 0 on its own line, in a plain .js file', () => {
		const source = "const a = 1;\nconst b = 2;\nfetch('https://x.example');\n";
		const warning = scanJs('app.js', source).warnings[0]!;
		expect(warning.line).toBe(3);
		expect(warning.message).toContain('app.js line 3 uses fetch.');

		// Positive control: indented calls were always right and still are, so
		// the fix moved the broken case rather than shifting everything.
		const indented = "const a = 1;\nconst b = 2;\n  fetch('https://x.example');\n";
		expect(scanJs('app.js', indented).warnings[0]!.line).toBe(3);
	});

	it('reports an import at column 0 on its own line', () => {
		const source = "const a = 1;\nimport x from 'https://cdn.example/x.js';\n";
		const failure = scanJs('app.js', source).failures[0]!;
		expect(failure.line).toBe(2);
		expect(failure.message).toContain('app.js line 2 imports from');
	});

	it('ignores an empty or whitespace-only block rather than reporting on it', () => {
		const scan = scanHtml('index.html', '<script>\n\n</script>', readerFor(['\n\n']));
		expect(scan.failures).toEqual([]);
		expect(scan.warnings).toEqual([]);
	});
});

describe('.ico is allowed', () => {
	it('is on the allowlist and has a real content type', () => {
		expect(FOUNDRY_ALLOWED_EXTENSIONS).toContain('ico');
		expect(foundryMime('favicon.ico')).toBe('image/vnd.microsoft.icon');
		// Never the octet-stream fallback, which is what an unlisted extension
		// would get and what would stop a browser using it.
		expect(foundryMime('favicon.ico')).not.toBe('application/octet-stream');
	});

	it('no longer refuses a bundle for carrying a favicon', () => {
		const plan = planStructure(
			[
				{ name: 'index.html', directory: false, irregular: false, declaredSize: 10 },
				{ name: 'favicon.ico', directory: false, irregular: false, declaredSize: 10 }
			],
			100
		);
		expect(plan.failures).toEqual([]);
		expect(plan.files.map((f) => f.path)).toContain('favicon.ico');
	});
});

describe('.md is dropped rather than refused', () => {
	it('leaves the README out, keeps the app, and says what went', () => {
		const plan = planStructure(
			[
				{ name: 'index.html', directory: false, irregular: false, declaredSize: 10 },
				{ name: 'README.md', directory: false, irregular: false, declaredSize: 10 },
				{ name: 'docs/NOTES.md', directory: false, irregular: false, declaredSize: 10 }
			],
			100
		);

		// The upload survives, which is the whole point of the change.
		expect(plan.failures).toEqual([]);
		expect(plan.files.map((f) => f.path)).toEqual(['index.html']);
		expect(plan.droppedIgnored).toBe(2);
		expect(plan.notes).toContain(
			'2 .md files were left out. They cannot be part of a published app, and leaving them in would have stopped the upload.'
		);
	});

	it('uses the singular when there is one', () => {
		const plan = planStructure(
			[
				{ name: 'index.html', directory: false, irregular: false, declaredSize: 10 },
				{ name: 'README.md', directory: false, irregular: false, declaredSize: 10 }
			],
			100
		);
		expect(plan.notes).toContain(
			'One .md file was left out. It cannot be part of a published app, and leaving it in would have stopped the upload.'
		);
	});

	/**
	 * THE LINE BETWEEN DROPPED AND REFUSED, ASSERTED IN BOTH DIRECTIONS. A
	 * source file means the student shipped the wrong folder, and the refusal is
	 * the thing that tells them; dropping it silently would leave them with a
	 * published app built from files that are not there.
	 */
	it('still refuses a source file, which is a different mistake', () => {
		const plan = planStructure(
			[
				{ name: 'index.html', directory: false, irregular: false, declaredSize: 10 },
				{ name: 'app.ts', directory: false, irregular: false, declaredSize: 10 },
				{ name: 'styles.scss', directory: false, irregular: false, declaredSize: 10 }
			],
			100
		);
		expect(plan.failures.map((f) => f.file)).toEqual(['app.ts', 'styles.scss']);
		expect(plan.droppedIgnored).toBe(0);

		expect(isIgnoredExtension('README.md')).toBe(true);
		expect(isIgnoredExtension('app.ts')).toBe(false);
		expect(isIgnoredExtension('index.html')).toBe(false);
	});

	it('the ignored list stays short and holds nothing servable', () => {
		for (const ext of FOUNDRY_IGNORED_EXTENSIONS) {
			// An extension cannot be both dropped and served: one of the two
			// branches would be unreachable and nobody would know which.
			expect(FOUNDRY_ALLOWED_EXTENSIONS).not.toContain(ext);
		}
	});
});
