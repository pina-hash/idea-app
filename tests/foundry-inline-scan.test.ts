import { describe, expect, it } from 'vitest';

import {
	FOUNDRY_ALLOWED_EXTENSIONS,
	FOUNDRY_IGNORED_EXTENSIONS,
	FOUNDRY_KNOWN_SHIMS,
	extensionOf,
	foundryMime,
	isIgnoredExtension,
	planStructure,
	scanHtml,
	scanJs,
	type HtmlFacts,
	type HtmlReader
} from '../src/lib/foundry/preflight.ts';
import { FOUNDRY_STORAGE_SHIM_JS } from '../src/lib/foundry/storage-shim.ts';

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
 * THE PROBES MOVED WHEN THE NETWORK RULES DID, AND THE ARITHMETIC DID NOT.
 * These fixtures used to plant a `fetch` and a CDN import, because those were
 * the warning and the failure `scanJs` produced. Neither is a problem now that
 * bundles are served from public Storage with no CSP of ours: a `fetch` works
 * and a CDN import works. So the probes are the two things that DID survive --
 * `localStorage`, which still throws in an opaque origin and is now the
 * warning, and an ABSOLUTE-PATH import, which still cannot resolve and is
 * still the failure. Every line-number assertion below is unchanged, because
 * the offset arithmetic is what this file is about and it did not move.
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
const SCRIPT_C =
	"\n\t// a comment about the tide table\n\tconst C = 3;\n\tconst saved = localStorage.getItem('tides');\n";

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
	"\tconst saved = localStorage.getItem('tides');", //  <-- THE ONE 18
	'</script>', //                                                 19
	'</body>', //                                                   20
	'</html>' //                                                    21
].join('\n');

describe('inline scripts are scanned, with the file s own line numbers', () => {
	it('reports the storage call at its line in the HTML file, not in the block', () => {
		const scan = scanHtml(
			'index.html',
			PAGE,
			readerFor([SCRIPT_A, SCRIPT_B, SCRIPT_C])
		);

		expect(scan.failures).toEqual([]);
		expect(scan.warnings).toHaveLength(1);

		const warning = scan.warnings[0]!;
		expect(warning.file).toBe('index.html');
		// 18, not 4. The call is the fourth line of the third block.
		expect(warning.line).toBe(18);
		// And the SENTENCE carries it too, which is the half a caller correcting
		// only the `line` field would leave wrong.
		expect(warning.message).toContain('index.html line 18 uses localStorage.');
	});

	/**
	 * The positive control for the fixture itself: the same script scanned as a
	 * standalone file reports line 4, so 18 above is the offset doing work
	 * rather than a coincidence.
	 */
	it('the same script as a .js file reports its own line 4', () => {
		const direct = scanJs('app.js', SCRIPT_C);
		expect(direct.warnings[0]!.line).toBe(4);
		expect(direct.warnings[0]!.message).toContain('app.js line 4 uses localStorage.');
	});

	it('refuses an absolute-path import from an inline script, at the right line', () => {
		const script = "\nimport confetti from '/lib/canvas-confetti.js';\n";
		const page = ['<!doctype html>', '<head></head>', '<body>', '<script type="module">', "import confetti from '/lib/canvas-confetti.js';", '</script>', '</body>'].join('\n');
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
		const page = '<!doctype html>\n<script src="/lib/x.js"></script>\n';
		const scan = scanHtml(
			'index.html',
			page,
			readerFor([], [{ tag: 'script', attr: 'src', value: '/lib/x.js' }])
		);
		expect(scan.failures).toHaveLength(1);
		expect(scan.failures[0]!.message).toContain('starts with a forward slash');
	});

	/**
	 * THE OTHER HALF OF THAT PAIR, AND IT IS THE RELAXATION ITSELF: the same
	 * script tag pointing at a real CDN is now simply fine. Asserted here rather
	 * than only in the classifier test, because a `<script src>` from unpkg is
	 * the single most common thing an AI tool writes.
	 */
	it('says nothing at all about a CDN script tag', () => {
		const src = 'https://unpkg.com/react@18/umd/react.production.min.js';
		const page = `<!doctype html>\n<script src="${src}"></script>\n`;
		const scan = scanHtml(
			'index.html',
			page,
			readerFor([], [{ tag: 'script', attr: 'src', value: src }])
		);
		expect(scan.failures).toEqual([]);
		expect(scan.warnings).toEqual([]);
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
		const noisy = '\nlocalStorage.clear();\n';
		const page = ['<script>', 'localStorage.clear();', '</script>', '<p>x</p>', '<script>', 'localStorage.clear();', '</script>'].join('\n');
		const scan = scanHtml('index.html', page, readerFor([noisy, noisy]));
		// Two identical blocks resolve to their own positions, because
		// `LineFinder` advances a cursor per needle.
		expect(scan.warnings.map((w) => w.line)).toEqual([2, 6]);
	});

	/**
	 * A PRE-EXISTING OFF-BY-ONE, FOUND BY THIS LANE AND FIXED IN THE SHARED
	 * MODULE, WHICH MEANS IT WAS WRONG IN `.js` FILES TOO.
	 *
	 * The patterns open with `(?:^|[^\w$.])` so `prefetch` and `myLocalStorage`
	 * do not match, which makes the match START at the character before the
	 * identifier. At column 0 that character is the previous line's newline, so
	 * a call on line 3 was reported as "app.js line 2". Statements at column 0
	 * are most of the statements anybody writes, so it was wrong more often
	 * than right.
	 */
	it('reports a call at column 0 on its own line, in a plain .js file', () => {
		const source = "const a = 1;\nconst b = 2;\nlocalStorage.setItem('a', '1');\n";
		const warning = scanJs('app.js', source).warnings[0]!;
		expect(warning.line).toBe(3);
		expect(warning.message).toContain('app.js line 3 uses localStorage.');

		// Positive control: indented calls were always right and still are, so
		// the fix moved the broken case rather than shifting everything.
		const indented = "const a = 1;\nconst b = 2;\n  localStorage.setItem('a', '1');\n";
		expect(scanJs('app.js', indented).warnings[0]!.line).toBe(3);
	});

	/**
	 * AND THE LEADING-CLASS EXCLUSION STILL BITES, which is what makes the
	 * index arithmetic above load-bearing rather than incidental.
	 */
	it('does not fire on an identifier that merely ends in the name', () => {
		const source = 'const myLocalStorage = {};\nmyLocalStorage.x = 1;\n';
		expect(scanJs('app.js', source).warnings).toEqual([]);
	});

	it('reports an import at column 0 on its own line', () => {
		const source = "const a = 1;\nimport x from '/lib/x.js';\n";
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

describe('.map is dropped rather than refused, the same way .md is', () => {
	it('leaves the source map out, keeps the app, and says what went', () => {
		const plan = planStructure(
			[
				{ name: 'index.html', directory: false, irregular: false, declaredSize: 10 },
				{ name: 'app.js', directory: false, irregular: false, declaredSize: 10 },
				{ name: 'app.js.map', directory: false, irregular: false, declaredSize: 10 }
			],
			100
		);
		expect(plan.failures).toEqual([]);
		expect(plan.files.map((f) => f.path)).toEqual(['index.html', 'app.js']);
		expect(plan.droppedIgnored).toBe(1);
		expect(isIgnoredExtension('app.js.map')).toBe(true);
	});
});

describe('the game-engine export formats are allowed and typed', () => {
	it('gives every new extension a real, non-generic content type', () => {
		const cases: Record<string, string> = {
			'module.wasm': 'application/wasm',
			'app.mjs': 'text/javascript; charset=utf-8',
			'page.htm': 'text/html; charset=utf-8',
			'font.woff': 'font/woff',
			'font.otf': 'font/otf',
			'clip.mp4': 'video/mp4',
			'clip.webm': 'video/webm',
			'voice.m4a': 'audio/mp4',
			'voice.aac': 'audio/aac',
			'voice.opus': 'audio/ogg',
			'voice.flac': 'audio/flac',
			'tex.avif': 'image/avif',
			'tex.bmp': 'image/bmp',
			'data.xml': 'application/xml; charset=utf-8',
			'scores.csv': 'text/csv; charset=utf-8',
			'captions.vtt': 'text/vtt; charset=utf-8',
			'model.glb': 'model/gltf-binary',
			'model.gltf': 'model/gltf+json; charset=utf-8'
		};
		for (const [name, mime] of Object.entries(cases)) {
			expect(foundryMime(name), name).toBe(mime);
			expect(FOUNDRY_ALLOWED_EXTENSIONS as readonly string[]).toContain(extensionOf(name));
		}
	});

	it('gives every engine-payload extension the octet-stream type, deliberately', () => {
		for (const ext of ['data', 'mem', 'pck', 'bin', 'atlas', 'fnt', 'obj', 'mtl']) {
			expect(foundryMime(`file.${ext}`), ext).toBe('application/octet-stream');
			expect(FOUNDRY_ALLOWED_EXTENSIONS as readonly string[]).toContain(ext);
		}
	});

	it('never accepts a Brotli or gzip build, on purpose', () => {
		expect(FOUNDRY_ALLOWED_EXTENSIONS as readonly string[]).not.toContain('br');
		expect(FOUNDRY_ALLOWED_EXTENSIONS as readonly string[]).not.toContain('gz');
	});
});

/**
 * THE PLATFORM MUST NOT WARN ABOUT ITS OWN ADVICE -- IN ANY VERSION OF IT.
 *
 * The contract tells a student to paste the storage shim as the first thing
 * inside <head>. The shim's own text contains `install('localStorage')`, which
 * the storage rule in `scanJs` matches, so without an exemption every
 * correctly built app carries a warning about the snippet that fixes storage.
 * That exemption existed and compared against the CURRENT shim string alone --
 * correct exactly as long as the shim never changed, and it changed: the probe
 * that keeps a real storage area instead of replacing it was added, and every
 * student who had already pasted the previous version started being warned
 * about it.
 *
 * THE MEASUREMENT THAT MATTERS IS THE RETIRED ONE, and it is why the pair of
 * assertions below is a pair. Testing only the current shim passes on exactly
 * the broken code this fixes; the retired shim is the case, and the third
 * fixture is the positive control that proves the exemption is an identity
 * test rather than a blanket amnesty for anything mentioning storage.
 *
 * IT IS DELIBERATELY A LOOP OVER `FOUNDRY_KNOWN_SHIMS` rather than two named
 * fixtures: a shim edit that forgets to record the string it replaced adds an
 * entry to that array and this test covers it for free, and a shim edit that
 * records nothing leaves the array one entry long, which the length assertion
 * catches.
 */
describe('the storage shim is recognised in every version this platform shipped', () => {
	it('warns about no shim the platform has ever handed out', () => {
		// The set really does hold more than the live string -- otherwise every
		// assertion below would be about the current shim twice over.
		expect(FOUNDRY_KNOWN_SHIMS.length).toBeGreaterThan(1);
		expect(FOUNDRY_KNOWN_SHIMS[0]).toBe(FOUNDRY_STORAGE_SHIM_JS);

		for (const [i, shim] of FOUNDRY_KNOWN_SHIMS.entries()) {
			const scan = scanHtml('index.html', '<html></html>', readerFor([shim]));
			expect(scan.failures, `shim ${i} failures`).toEqual([]);
			expect(scan.warnings, `shim ${i} warnings`).toEqual([]);
		}
	});

	/**
	 * THE POSITIVE CONTROL, and it is the retired shim's own text with one
	 * character changed. A control that used unrelated code would prove only
	 * that the scanner runs at all; this proves the exemption is keyed on the
	 * exact string and not on the block looking shim-shaped.
	 */
	it('scans a script that merely resembles a shim, retired text included', () => {
		for (const [i, shim] of FOUNDRY_KNOWN_SHIMS.entries()) {
			const tampered = `${shim}\nlocalStorage.setItem('mine', '1');`;
			const scan = scanHtml('index.html', '<html></html>', readerFor([tampered]));
			expect(scan.warnings.length, `tampered ${i}`).toBeGreaterThan(0);
			expect(scan.warnings[0]!.message).toContain('localStorage');
		}
	});

	/**
	 * WHITESPACE IS THE ONE THING NORMALIZED, because a student pastes into an
	 * editor and an editor reindents. Anything else is a different script.
	 */
	it('recognises a reindented paste and not an edited one', () => {
		const reindented = FOUNDRY_KNOWN_SHIMS.map((v) =>
			v.split('\n').map((l) => `\t\t${l}`).join('\n')
		);
		for (const [i, shim] of reindented.entries()) {
			const scan = scanHtml('index.html', '<html></html>', readerFor([shim]));
			expect(scan.warnings, `reindented ${i}`).toEqual([]);
		}

		// Positive control on the same axis: renaming an identifier inside the
		// shim is not whitespace, so it is scanned.
		const renamed = FOUNDRY_STORAGE_SHIM_JS.replace("install('localStorage')", "install('localStorage');install('localStorage')");
		expect(renamed).not.toBe(FOUNDRY_STORAGE_SHIM_JS);
		const scan = scanHtml('index.html', '<html></html>', readerFor([renamed]));
		expect(scan.warnings.length).toBeGreaterThan(0);
	});

	/**
	 * NO RETIRED ENTRY MAY BE A COPY OF THE LIVE SHIM. The retired strings are
	 * written out in `preflight.ts` because nothing generates them any more;
	 * that is only safe while they are genuinely dead. An entry that had been
	 * "kept in sync" with the live one would be the second copy of the shipping
	 * shim, which is the thing `storage-shim.ts` exists to prevent.
	 */
	it('holds no retired shim that has become a copy of the live one', () => {
		const flat = (v: string) => v.replace(/\s+/g, '');
		const live = flat(FOUNDRY_STORAGE_SHIM_JS);
		const retired = FOUNDRY_KNOWN_SHIMS.slice(1);
		expect(retired.length).toBeGreaterThan(0);
		for (const [i, v] of retired.entries()) expect(flat(v), `retired ${i}`).not.toBe(live);

		// And they are distinct from each other, so the array is a history and
		// not a list with a duplicate in it.
		const seen = new Set(retired.map(flat));
		expect(seen.size).toBe(retired.length);
	});
});

