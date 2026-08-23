import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
	FOUNDRY_ALLOWED_EXTENSIONS,
	FOUNDRY_ENTRY_FILE,
	FOUNDRY_LIMITS,
	PLATFORM_FONTS_PATH,
	foundryBuildContract,
	planStructure,
	scanCss,
	scanHtml,
	scanJs,
	type HtmlFacts
} from '../src/lib/foundry/preflight.ts';

/**
 * THE BROWSER AND THE SERVER MUST SAY THE SAME SENTENCE, AND THIS IS WHAT
 * GUARDS IT.
 *
 * A student reads a refusal in the browser before uploading and, if they get
 * past that, reads one from `foundry-ingest` after. Two wordings for one rule
 * is the whole risk of this lane: the second message reads as a new problem,
 * and the first stops being trustworthy.
 *
 * IT IS GUARDED STRUCTURALLY, WHICH IS STRONGER THAN COMPARING OUTPUTS.
 * Neither side owns a message. Both import every scanner, every cap and every
 * sentence from `src/lib/foundry/preflight.ts`, so there is nothing to compare
 * -- there is one string, produced by one function, and the tests below assert
 * that this stays true rather than sampling its output and hoping.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED HERE IS THE DENO PARSE. The one thing the
 * two sides genuinely do differently is which `DOMParser` they hand to
 * `makeDomHtmlReader`: deno-dom in the function, the browser's own in the
 * client. That is a real difference and it is NOT exercised by this suite --
 * running the Edge Function needs Docker or a Deno runtime, and this machine
 * has neither. What is asserted is that the difference is confined to that one
 * injected parser, and that everything downstream of it -- which references are
 * refused, in what words -- is shared code with no second copy.
 */

const PREFLIGHT = 'src/lib/foundry/preflight.ts';
const BROWSER = 'src/lib/foundry/preflight-browser.ts';
const INGEST = 'supabase/functions/foundry-ingest/index.ts';
const INGEST_HTML = 'supabase/functions/foundry-ingest/html.ts';
const HTML_DOM = 'src/lib/foundry/html-dom.ts';

const read = (p: string) => fs.readFileSync(p, 'utf8');

/** Comments explain the rules; they are not statements of them. */
const stripComments = (src: string) =>
	src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * The only student-facing sentences that may live outside the shared module.
 * Both describe a moment the browser never reaches; see the sweep below.
 */
const SERVER_ONLY_SENTENCES = [
	'The uploaded file could not be found. Upload your zip again and then run the check.',
	'could not be checked automatically, so the checks for blocked links and page title were skipped for it. Your app was still saved. If it does not work when you open it, check that every link and image in this file points at a file inside your app folder.'
];

/** Every function that turns a finding into words a student reads. */
const MESSAGE_PRODUCERS = [
	'planStructure',
	'scanHtml',
	'scanCss',
	'scanJs',
	'uncompressedCapMessage',
	'unreadableZipMessage',
	'largeAssetWarning'
];

describe('one module owns every rule and every sentence', () => {
	it('the ingest function imports its scanners rather than defining them', () => {
		const src = read(INGEST);

		// Positive control: the sweep is looking at the right file.
		expect(src).toContain('foundry-ingest');
		expect(src).toContain('student_app_files');

		for (const fn of MESSAGE_PRODUCERS) {
			// Imported...
			expect(src).toContain(fn);
			// ...and never re-declared.
			expect(src).not.toMatch(new RegExp(`function\\s+${fn}\\s*\\(`));
			expect(src).not.toMatch(new RegExp(`const\\s+${fn}\\s*=`));
		}

		// And they come from the shared module specifically, not from a copy
		// sitting next to the function.
		expect(src).toMatch(/from ['"][^'"]*src\/lib\/foundry\/preflight\.ts['"]/);
	});

	it('the browser preflight imports the same scanners rather than defining them', () => {
		const src = read(BROWSER);
		expect(src).toContain('preflightZipInBrowser');
		for (const fn of ['planStructure', 'scanHtml', 'scanCss', 'scanJs']) {
			expect(src).toContain(fn);
			expect(src).not.toMatch(new RegExp(`function\\s+${fn}\\s*\\(`));
		}
		expect(src).toMatch(/from ['"]\.\/preflight\.ts['"]/);
	});

	/**
	 * THE ONE DIFFERENCE, NAMED AND BOUNDED. Both sides build their reader from
	 * `makeDomHtmlReader`, so the walk over the parsed document -- which
	 * elements, which attributes, in what order -- is one implementation. Only
	 * the parser handed to it differs.
	 */
	it('both HTML readers are the same factory with a different parser', () => {
		const denoSide = read(INGEST_HTML);
		const browserSide = read(BROWSER);

		expect(denoSide).toContain('makeDomHtmlReader');
		expect(denoSide).toContain('deno_dom');
		expect(browserSide).toContain('makeDomHtmlReader');
		expect(browserSide).toContain('new DOMParser()');

		// Neither builds a reader of its own.
		expect(denoSide).not.toMatch(/function\s+makeDomHtmlReader/);
		expect(browserSide).not.toMatch(/function\s+makeDomHtmlReader/);

		// The factory lives in one place and is client-safe. Comments are
		// stripped first: its own doc block explains why the parser is injected
		// and names both runtimes, which is the opposite of a violation.
		expect(read(HTML_DOM)).toMatch(/export function makeDomHtmlReader/);
		const factory = stripComments(read(HTML_DOM));
		expect(factory).not.toMatch(/\bDeno\b/);
		expect(factory).not.toContain('node:');
	});

	/**
	 * A SENTENCE MAY ONLY BE WRITTEN IN THE SHARED MODULE -- EXCEPT FOR THE TWO
	 * SITUATIONS ONLY A SERVER CAN BE IN, WHICH ARE PINNED HERE BY TEXT.
	 *
	 * The marker is the second person: every student-facing sentence in this
	 * subsystem is addressed to "your app", "your zip" or "your folder". Two of
	 * them legitimately live in the ingest function, because the browser has no
	 * equivalent moment to describe -- a storage object that has gone missing
	 * between the upload and the invoke, and a file the function could not
	 * decode in order to scan it. Neither restates a rule the browser also
	 * checks, which is the thing this sweep is actually protecting.
	 *
	 * PINNED BY EXACT TEXT RATHER THAN BY COUNT, so a THIRD sentence on either
	 * side fails here and has to earn its place. That is the whole value of it:
	 * the drift this lane risks would arrive as exactly one plausible extra
	 * sentence, added by somebody being helpful.
	 */
	it('neither side writes a student-facing sentence beyond the pinned server-only pair', () => {
		const shared = read(PREFLIGHT);
		// Positive control: the shared module is full of them, so a clean sweep
		// below cannot be the regex failing to match anything anywhere.
		expect((shared.match(/your app/g) ?? []).length).toBeGreaterThan(10);

		for (const path of [BROWSER, INGEST, INGEST_HTML]) {
			const code = stripComments(read(path));
			const hits = (code.match(/["'`][^"'`]*\byour (app|zip|folder)\b[^"'`]*["'`]/g) ?? []).filter(
				(hit) => !SERVER_ONLY_SENTENCES.some((allowed) => hit.includes(allowed))
			);
			expect({ path, hits }).toEqual({ path, hits: [] });
		}
	});

	/**
	 * An allowance that no longer matches anything is an allowance that has
	 * quietly stopped being checked: the sweep above would pass just as happily
	 * if both sentences had been deleted or reworded, and the next one added
	 * would then look like it belonged.
	 */
	it('the pinned server-only sentences are still present, so the allowance is not stale', () => {
		const code = read(INGEST);
		for (const sentence of SERVER_ONLY_SENTENCES) expect(code).toContain(sentence);
	});
});

/**
 * The wording itself, pinned. These strings were recorded from the shipping
 * source and then read back out of a real browser through the surface, so a
 * change to any of them is a deliberate change to what a student is told --
 * and it reddens here rather than being noticed by a student.
 */
describe('the sentences, pinned', () => {
	it('says what to do about a missing entry file', () => {
		const plan = planStructure(
			[{ name: 'app.js', directory: false, irregular: false, declaredSize: 10 }],
			100
		);
		expect(plan.failures.map((f) => f.message)).toEqual([
			'There is no index.html at the top level of the zip. Your app has to start from a file named exactly index.html, sitting at the top level. Rename your main page to index.html, or make the zip from inside your app folder rather than from the folder above it, and upload again.'
		]);
	});

	it('names the refused extension and lists the ones that work', () => {
		const plan = planStructure(
			[
				{ name: 'index.html', directory: false, irregular: false, declaredSize: 10 },
				{ name: 'notes.md', directory: false, irregular: false, declaredSize: 10 }
			],
			100
		);
		const message = plan.failures[0]!.message;
		expect(message).toContain('notes.md is a .md file, which this platform cannot serve.');
		// The list in the sentence IS the allowlist, not a copy of it.
		for (const ext of FOUNDRY_ALLOWED_EXTENSIONS) expect(message).toContain(ext);
	});

	/**
	 * THE CSS EXAMPLE HAS TO BE VALID CSS. This read `url="bg.png"` until the
	 * browser pass put it on screen -- an attribute, in a stylesheet, offered to
	 * a student as the thing to write instead. It is pinned because the defect
	 * was invisible to every reader who was checking the rule rather than the
	 * syntax.
	 */
	it('offers CSS syntax in a CSS message and HTML syntax in an HTML one', () => {
		const css = scanCss('style.css', 'body{background:url(/art/bg.png)}');
		expect(css.failures[0]!.message).toContain('like url("bg.png")');
		expect(css.failures[0]!.message).not.toContain('url="bg.png"');

		/*
		 * The reader is an INJECTION POINT by design -- that is why `scanHtml`
		 * takes it as a parameter rather than parsing for itself -- so handing
		 * it facts directly is using the seam, not bypassing a producer. The
		 * facts below are the ones a real browser DOMParser produced for this
		 * exact markup, read back off the surface during the browser pass.
		 */
		const facts: HtmlFacts = {
			refs: [{ tag: 'img', attr: 'src', value: '/art/logo.png' }],
			title: null
		};
		const html = scanHtml('index.html', '<img src="/art/logo.png">', () => facts);
		expect(html.failures[0]!.message).toContain('like src="logo.png"');
	});

	it('warns rather than refuses on a blocked network call, and says the app still runs', () => {
		const js = scanJs('app.js', "fetch('data.json');");
		expect(js.failures).toEqual([]);
		expect(js.warnings).toHaveLength(1);
		expect(js.warnings[0]!.message).toContain('Everything else in your app will still work.');
	});

	it('refuses a Google Fonts stylesheet by name and points at the platform sheet', () => {
		const css = scanCss('style.css', "@import url('https://fonts.googleapis.com/css2?family=Inter');");
		expect(css.failures[0]!.message).toContain('loads a font from Google Fonts');
		expect(css.failures[0]!.message).toContain(PLATFORM_FONTS_PATH);
	});
});

/**
 * THE CONTRACT IS THE RULES, RESTATED FOR A TOOL, AND IT CANNOT DRIFT.
 *
 * It is generated from the same constants the checks read, so this asserts the
 * generation rather than the prose: every allowed extension appears, both caps
 * appear with their real numbers, and the two magic strings a student has to
 * type exactly are spelled the way the checks spell them.
 */
describe('the build contract is generated from the rules it describes', () => {
	const contract = foundryBuildContract();

	it('lists exactly the extensions the allowlist holds', () => {
		for (const ext of FOUNDRY_ALLOWED_EXTENSIONS) {
			expect(contract).toContain(`.${ext}`);
		}
		// And nothing it does not: a few plausible ones a student would assume.
		for (const ext of ['.mp4', '.md', '.ts', '.scss', '.ico']) {
			// They appear only in the "refused" sentence, never in the allowed list.
			const allowedLine = contract.split('\n').find((l) => l.includes('.html') && l.includes('.woff2'));
			expect(allowedLine).toBeDefined();
			expect(allowedLine).not.toContain(ext);
		}
	});

	it('carries the real caps rather than a written-down copy of them', () => {
		const mb = (b: number) => `${Math.round(b / (1024 * 1024))} MB`;
		expect(contract).toContain(`At most ${FOUNDRY_LIMITS.maxFiles} files.`);
		expect(contract).toContain(mb(FOUNDRY_LIMITS.maxTotalBytes));
		expect(contract).toContain(mb(FOUNDRY_LIMITS.warnAssetBytes));
	});

	it('spells the entry file and the one absolute path exactly as the checks do', () => {
		expect(contract).toContain(FOUNDRY_ENTRY_FILE);
		expect(contract).toContain(PLATFORM_FONTS_PATH);
		expect(contract).toContain(`<link rel="stylesheet" href="${PLATFORM_FONTS_PATH}">`);
	});

	/**
	 * The four runtime facts a generated app will otherwise get wrong, because
	 * they are true of this sandbox and of nowhere else the tool has seen.
	 */
	it('states the sandbox limits a generated app would otherwise assume away', () => {
		expect(contract).toContain('window.parent');
		expect(contract).toContain('window.open');
		expect(contract).toMatch(/localStorage/);
		// The contract hard-wraps, so a phrase can span a line break.
		expect(contract.replace(/\s+/g, ' ')).toContain('lost on reload');
		expect(contract).toMatch(/downloads/i);
		expect(contract).toMatch(/no build step/i);
	});

	it('reads as instructions rather than as prose about a policy', () => {
		// Imperative, addressed to the thing building the app.
		expect(contract).toMatch(/^You are building/m);
		expect((contract.match(/^- Do not /gm) ?? []).length).toBeGreaterThanOrEqual(8);
	});
});
