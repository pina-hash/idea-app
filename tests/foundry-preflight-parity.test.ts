import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
	FOUNDRY_ALLOWED_EXTENSIONS,
	FOUNDRY_ENTRY_FILE,
	FOUNDRY_LIMITS,
	PLATFORM_FONTS_URL,
	foundryBuildContract,
	isIgnoredExtension,
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
 * It describes a moment the browser never reaches; see the sweep below.
 *
 * THERE USED TO BE TWO. The second read "could not be checked automatically, so
 * the checks for blocked links and page title were skipped for it. Your app was
 * still saved" -- the sentence `foundry-ingest` produced when the HTML parser
 * failed. It is not reworded and it has not moved: the BEHAVIOUR it described is
 * gone. A page the parser cannot read is a hard failure now, raised inside
 * `scanHtml` where both callers get it, because that sentence was the sound a
 * silent pass makes. It sat beside zero failures on a bundle with four CDN
 * script tags in its head, which was then extracted, reviewed and approved.
 *
 * Removing the entry rather than the assertion is the point of the check below:
 * the list must name exactly what is really there.
 */
const SERVER_ONLY_SENTENCES = [
	'The uploaded file could not be found. Upload your zip again and then run the check.'
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
				{ name: 'styles.scss', directory: false, irregular: false, declaredSize: 10 }
			],
			100
		);
		const message = plan.failures[0]!.message;
		expect(message).toContain('styles.scss is a .scss file, which this platform cannot serve.');
		// The list in the sentence IS the allowlist, not a copy of it.
		for (const ext of FOUNDRY_ALLOWED_EXTENSIONS) expect(message).toContain(ext);
	});

	/**
	 * `.md` USED TO BE THIS FIXTURE, and swapping it out is the point rather
	 * than a tidy-up: a README is now DROPPED with a note instead of refused,
	 * so a test still asserting a refusal for it would be asserting the old
	 * rule. `tests/foundry-inline-scan.test.ts` holds the drop in both
	 * directions.
	 */
	it('no longer refuses the file a generation tool almost always emits', () => {
		const plan = planStructure(
			[
				{ name: 'index.html', directory: false, irregular: false, declaredSize: 10 },
				{ name: 'README.md', directory: false, irregular: false, declaredSize: 10 }
			],
			100
		);
		expect(plan.failures).toEqual([]);
		expect(plan.droppedIgnored).toBe(1);
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
			title: null,
			inlineScripts: []
		};
		const html = scanHtml('index.html', '<img src="/art/logo.png">', () => facts);
		expect(html.failures[0]!.message).toContain('like src="logo.png"');
	});

	/**
	 * STORAGE WARNS RATHER THAN REFUSES, AND ITS SENTENCE CARRIES THE FIX.
	 * This slot used to belong to `fetch`, whose sentence promised the rest
	 * of the app still worked. That promise cannot be made here and is not:
	 * unshimmed storage takes the whole script down, so the sentence names
	 * the snippet and the file it goes in instead.
	 */
	/**
	 * THE SENTENCE CHANGED WHEN THE SANDBOX DID, AND THE OLD ASSERTION IS WHAT
	 * FOUND IT.
	 *
	 * This used to require the phrase "lost when the page reloads", which was
	 * true of every bundle while they ran on an opaque origin with no storage
	 * area. `foundrySandboxFlags` grants `allow-same-origin` whenever the
	 * bundle origin and the portal origin differ, so a published app has a real
	 * storage area and saved data survives a reload -- and the warning saying
	 * otherwise was telling a student their working save slot did not work.
	 *
	 * WHAT IS PINNED NOW IS THE TWO THINGS THAT ARE STILL TRUE, and the absence
	 * of the one that is not. Both halves matter: without the absence check the
	 * sentence could gain the old claim back beside the new ones and nothing
	 * would fire.
	 */
	it('warns on storage about the key collision and the filesystem, not about reloading', () => {
		const js = scanJs('app.js', "localStorage.getItem('save');");
		expect(js.failures).toEqual([]);
		expect(js.warnings).toHaveLength(1);
		const msg = js.warnings[0]!.message;

		// It still points at the snippet and still names the file to put it in.
		expect(msg).toContain('storage snippet from the build contract');
		expect(msg).toContain(FOUNDRY_ENTRY_FILE);
		// The two live hazards: one shared storage area, and file://.
		expect(msg).toContain('prefix every key');
		expect(msg).toContain('survives a reload');

		// And the retired claim is gone rather than merely joined.
		expect(msg).not.toContain('lost when the page reloads');
		expect(msg).not.toContain('no storage area');
	});

	/**
	 * THE PLATFORM SHEET IS STILL POINTED AT BY NAME, but from the other
	 * direction. A Google Fonts link used to be the refusal that recommended
	 * it; Google Fonts works now, and what is refused is the ROOT-RELATIVE
	 * spelling of the platform sheet itself -- which is exactly the line a
	 * student who read last term's contract will have written.
	 */
	it('refuses the root-relative platform sheet and hands back the whole URL', () => {
		const css = scanCss('style.css', "@import url('/_platform/fonts.css');");
		expect(css.failures).toHaveLength(1);
		expect(css.failures[0]!.message).toContain('starts with a forward slash');
		expect(css.failures[0]!.message).toContain(PLATFORM_FONTS_URL);

		// POSITIVE CONTROL: a Google Fonts import is now silent, in the same
		// scanner, so the failure above is about the slash.
		const gf = scanCss('style.css', "@import url('https://fonts.googleapis.com/css2?family=Inter');");
		expect(gf.failures).toEqual([]);
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
		// And nothing it does not. The list is derived from the allowlist rather
		// than typed out, so `.ico` moved into it the moment the rule changed --
		// which is why this checks the CONSTANT rather than a written-down set.
		const allowedLine = contract.split('\n').find((l) => l.includes('.html') && l.includes('.woff2'));
		expect(allowedLine).toBeDefined();
		// `.mp4` moved OFF this list and into the allowlist in the same bundle
		// that widened it to real game-engine export formats; `.br`/`.gz` and
		// `.ts`/`.scss` are the ones that still refuse (see the caps note
		// above and `compressedExtensionMessage`).
		for (const ext of ['.br', '.gz', '.md', '.ts', '.scss']) {
			expect(FOUNDRY_ALLOWED_EXTENSIONS as readonly string[]).not.toContain(ext.slice(1));
			expect(allowedLine).not.toContain(ext);
		}
		// Positive control for the relaxation itself: `.mp4` really is allowed
		// and really is on this line now.
		expect(FOUNDRY_ALLOWED_EXTENSIONS as readonly string[]).toContain('mp4');
		expect(allowedLine).toContain('.mp4');
		// Positive control: the line really is the allowed list, so the four
		// absences above are not four ways of missing the same wrong line.
		expect(allowedLine).toContain('.ico');
	});

	/**
	 * THE PARAGRAPH THAT USED TO BE VAGUE, AND WAS ALSO WRONG.
	 *
	 * It read "Do not produce a README, a package.json, a lockfile, a config
	 * file, or a build script. They are not used and several of them are
	 * refused." `package.json` and `package-lock.json` are `.json`, which is on
	 * the allowlist, so they upload perfectly happily -- a student who deleted
	 * them on that advice deleted them for nothing. It is now generated by
	 * putting each candidate through the SAME predicates the upload uses, so it
	 * cannot claim an outcome the code does not produce.
	 */
	it('sorts extra files by what actually happens to them', () => {
		expect(contract).toContain('Dropped, and you are told:  README.md');
		expect(contract).toMatch(/Refused, upload stops:.*build\.sh/);
		expect(contract).toMatch(/Uploaded but never used:.*package\.json/);
		expect(contract).toMatch(/Uploaded but never used:.*package-lock\.json/);

		// The claim each line makes, re-derived here from the rules rather than
		// read off the document, so the two have to agree.
		expect(isIgnoredExtension('README.md')).toBe(true);
		expect(FOUNDRY_ALLOWED_EXTENSIONS as readonly string[]).toContain('json');
		expect(FOUNDRY_ALLOWED_EXTENSIONS as readonly string[]).not.toContain('sh');

		// And the old vague sentence is gone, not merely supplemented.
		expect(contract).not.toContain('several of them are refused');
	});

	it('carries the real caps rather than a written-down copy of them', () => {
		const mb = (b: number) => `${Math.round(b / (1024 * 1024))} MB`;
		expect(contract).toContain(`At most ${FOUNDRY_LIMITS.maxFiles} files.`);
		expect(contract).toContain(mb(FOUNDRY_LIMITS.maxTotalBytes));
		expect(contract).toContain(mb(FOUNDRY_LIMITS.warnAssetBytes));
	});

	it('spells the entry file and the one absolute path exactly as the checks do', () => {
		expect(contract).toContain(FOUNDRY_ENTRY_FILE);
		expect(contract).toContain(PLATFORM_FONTS_URL);
		expect(contract).toContain(`<link rel="stylesheet" href="${PLATFORM_FONTS_URL}">`);
	});

	/**
	 * THE RUNTIME FACTS A GENERATED APP WILL OTHERWISE GET WRONG -- AND THIS
	 * TEST IS WHERE THE OLD DOCUMENT'S FALSEHOODS WERE PINNED.
	 *
	 * It used to require "lost on reload" and treat `window.open` and
	 * `downloads` as things the contract must WARN about. Every one of those
	 * became false in the sandbox merge: `FOUNDRY_SANDBOX_BASE_FLAGS` grants
	 * `allow-popups` and `allow-downloads`, and `allow-same-origin` gives a
	 * published app a real, durable storage area.
	 *
	 * IT NOW ASSERTS IN BOTH DIRECTIONS, which is the only way this stays
	 * honest: what the document must SAY is still refused, and what it must no
	 * longer claim. A one-directional version passes on a document that says
	 * everything twice.
	 */
	it('states what the frame still refuses, and no longer claims what it grants', () => {
		// Still true, and still the things a generated app assumes it has.
		expect(contract).toContain('window.parent');
		expect(contract).toContain('window.top');
		expect(contract).toMatch(/localStorage/);
		expect(contract).toMatch(/no build step/i);

		// The contract hard-wraps, so a phrase can span a line break.
		const flat = contract.replace(/\s+/g, ' ');

		// Storage: the claim reversed. Both directions.
		expect(flat).toContain('SURVIVES A RELOAD');
		expect(flat).not.toContain('lost on reload');
		expect(flat).not.toContain('NO STORAGE AREA');
		expect(flat).not.toContain('nothing is written to disk');

		// The shared origin is the hazard that replaced it, and the remedy is
		// stated as an instruction rather than as a fact about the platform.
		expect(flat).toContain('SHARES ONE STORAGE AREA');
		expect(flat).toContain('PREFIX EVERY KEY');

		// Granted now, and named as granted rather than as forbidden.
		expect(flat).toContain('window.open. A popup opens');
		expect(flat).toContain('Downloads.');
		expect(flat).toContain('Forms. A <form> submits.');
		expect(flat).not.toContain('Cookies and IndexedDB are not available at all');

		// <base href> works and the warning about depending on another site is
		// repeated where a student choosing to use one will read it.
		expect(flat).toContain('<base href="..."> WORKS');
	});

	/**
	 * A RULE RATHER THAN A COUNT. The previous version pinned the number of
	 * "- Do not" lines, which meant rewriting a vague paragraph into a precise
	 * table -- an unambiguous improvement -- reddened it for no reason anybody
	 * reading the failure could act on. What matters is that the document stays
	 * imperative and addressed to the tool, so that is what is asserted.
	 */
	it('reads as instructions rather than as prose about a policy', () => {
		expect(contract).toMatch(/^You are building/m);
		expect((contract.match(/^- Do not /gm) ?? []).length).toBeGreaterThanOrEqual(5);

		// No hedging. A tool cannot act on "try to avoid" and a student reading
		// it learns the rule is optional, which it is not.
		for (const hedge of ['please', 'try to', 'if possible', 'ideally', 'we recommend']) {
			expect(contract.toLowerCase()).not.toContain(hedge);
		}
	});
});
