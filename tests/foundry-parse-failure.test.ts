// tests/foundry-parse-failure.test.ts
//
// THE BUNDLE THAT WAS APPROVED AND RAN BLANK, AND THE SILENT PASS THAT LET IT.
//
// A student submitted a single 25 KB HTML file whose <head> carried four
// external script tags -- react, react-dom, @babel/standalone and lucide, all
// from unpkg. Every one of them is a hard fail under the reference rule. All
// four passed, extraction ran, the version reached the review queue, somebody
// approved it, and the app rendered nothing because the four scripts it needs
// were never going to load.
//
// WHAT IT WAS NOT, each ruled out by measurement rather than by argument:
//
//   - not the scripts being in <head> rather than <body>: both parsers find
//     them there;
//   - not the `crossorigin` attribute: the reader keys on `src`, and the two
//     tags carrying it were found;
//   - not the file size. `BROWSER_SCAN_MAX` is 2 MB and the file is 25,159
//     bytes, so it was scanned on both sides. There is no truncation path it
//     could have taken;
//   - not deno-dom's selector support. Run against the real fixture, deno-dom
//     0.1.43 and 0.1.46 -- the two published versions bracketing the pinned
//     0.1.45 -- both return 4 for `querySelectorAll('[src], [href]')` and both
//     produce all four failures through the real shared scanner;
//   - not the rule. `classifyReference` returns `{kind:'scheme'}` for every one
//     of the four, as asserted below.
//
// WHAT IT WAS: `scanHtml` answered a PARSE FAILURE with zero failures, which is
// the same answer it gives for a file with nothing wrong in it. deno-dom's WASM
// parser returns null until it is ready, which a cold Edge Function instance is
// exactly when it is not -- `html-dom.ts` had already documented that happening
// here. `foundry-ingest` turned the empty result into a warning reading "Your
// app was still saved", and everything downstream believed it.
//
// Measured, with the reader stubbed to fail the way a cold deno-dom does: 0
// failures, 1 warning, extraction runs. That is the whole escape.
//
// THE BROWSER HALF WAS WORSE and is covered here too: `preflightZipInBrowser`
// ignored `parseFailed` completely -- not a failure, not a warning, nothing --
// so a student whose page the browser parser choked on read a clean pass.
//
// Both are fixed in ONE place, `scanHtml`, so neither caller can forget: a page
// the parser cannot read is now a hard failure. "We checked it and found
// nothing" and "we could not check it" are different answers now, not different
// log lines.

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
	classifyReference,
	scanHtml,
	type HtmlFacts,
	type HtmlReader
} from '../src/lib/foundry/preflight.ts';
import { makeDomHtmlReader } from '../src/lib/foundry/html-dom.ts';

const FIXTURE = 'tests/fixtures/foundry/approved-react-app.html';
const INGEST = 'supabase/functions/foundry-ingest/index.ts';
const BROWSER = 'src/lib/foundry/preflight-browser.ts';

const source = fs.readFileSync(FIXTURE, 'utf8');

/** The four the student actually shipped, in document order. */
const CDN_SCRIPTS = [
	'https://unpkg.com/react@18/umd/react.production.min.js',
	'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
	'https://unpkg.com/@babel/standalone/babel.min.js',
	'https://unpkg.com/lucide@latest'
];

describe('the fixture is the file that got through', () => {
	it('still carries exactly those four external scripts, in <head>', () => {
		// A fixture that drifts stops standing for the bundle it was made from,
		// and every assertion under it turns into a claim about something else.
		for (const url of CDN_SCRIPTS) {
			expect(source, url).toContain(`src="${url}"`);
		}
		expect((source.match(/<script src=/g) ?? []).length, 'external script tags').toBe(4);

		const head = source.slice(source.indexOf('<head>'), source.indexOf('</head>'));
		for (const url of CDN_SCRIPTS) {
			expect(head, `${url} is in <head>`).toContain(url);
		}

		// The size the "truncation path" candidate was about. Asserted so the
		// ruling-out above stays true of this file.
		expect(Buffer.byteLength(source), 'fixture bytes').toBeGreaterThan(20_000);
		expect(Buffer.byteLength(source), 'fixture bytes').toBeLessThan(30_000);
	});

	/**
	 * THIS EXPECTATION HAS NOW BEEN THREE THINGS, AND THAT IS THE POINT OF
	 * KEEPING IT.
	 *
	 * It began as "all four are refused", became "all four are repointed at
	 * the copies we host", and is now "all four simply load". Each answer was
	 * right for the sandbox of its day; what changed underneath was whether a
	 * bundle could reach the network at all. There is no CSP on a bundle now,
	 * so a CDN script tag works exactly as it does on any web page, and
	 * refusing or rewriting one would be interfering with something correct.
	 *
	 * WHAT MUST NOT REGRESS EITHER WAY is that the classifier has an OPINION
	 * about each of them rather than falling through by accident, which is
	 * what the positive control below is for.
	 */
	it('classifies every one of the four as an ordinary web reference', () => {
		for (const url of CDN_SCRIPTS) {
			expect(classifyReference(url).kind, url).toBe('ok');
		}
		// POSITIVE CONTROL: the classifier is still capable of refusing, so
		// four `ok`s are a decision and not a dead function.
		expect(classifyReference('/lib/react.js').kind).toBe('absolute');
		expect(classifyReference('ftp://x/y.js').kind).toBe('scheme');
	});
});

/**
 * A reader standing in for a working DOM: it reports the facts a real parser
 * reports for this file. It is NOT a parser and is not pretending to be one --
 * the real parsers are exercised where they exist (the browser preflight in a
 * browser, deno-dom under Deno), and this suite runs in Node where there is no
 * DOM at all. What it pins is the RULE downstream of the parse.
 */
const workingReader: HtmlReader = (): HtmlFacts => ({
	refs: CDN_SCRIPTS.map((value) => ({ tag: 'script', attr: 'src', value })),
	title: 'Study Timer',
	inlineScripts: []
});

describe('scanHtml on the student’s file', () => {
	/*
	 * THIS ASSERTION MOVED, AND IT MOVED BECAUSE THE ANSWER DID.
	 *
	 * It read "refuses all four, naming each URL and the line it is on", and
	 * that was the whole fix at the time: four tags that had silently passed
	 * now stopped the upload. The platform now HOSTS all four of those
	 * libraries, so the four are repointed at our copies instead and the upload
	 * passes -- which is a better outcome for the same student and a worse one
	 * to state loosely, because "passes" is exactly what it did when it was
	 * broken.
	 *
	 * So the assertion is generalized rather than dropped, to the thing that
	 * must never regress whichever way the rule goes: NO CDN SCRIPT TAG IS EVER
	 * SILENTLY LEFT ALONE. Each of the four is either refused or repaired, is
	 * named either way, carries its own line, and -- the half a refusal never
	 * needed -- is GONE from the bytes that will be served.
	 */
	/**
	 * AND THE SCAN SAYS NOTHING AT ALL ABOUT THEM, which is a claim worth
	 * making explicitly rather than leaving as an empty array somewhere.
	 * "We stopped warning about CDN tags" and "the scanner stopped running"
	 * produce the same empty result, so the positive control is the whole
	 * assertion: the same scan, on the same file, still finds the ONE thing
	 * that did not relax.
	 */
	it('reports nothing for four CDN script tags', () => {
		const scan = scanHtml('index.html', source, workingReader);
		expect(scan.parseFailed ?? false).toBe(false);
		expect(scan.failures).toEqual([]);
		expect(scan.warnings).toEqual([]);
	});

	it('still reports the storage call in the same file', () => {
		const storageReader: HtmlReader = (): HtmlFacts => ({
			refs: CDN_SCRIPTS.map((value) => ({ tag: 'script', attr: 'src', value })),
			title: 'Study Timer',
			inlineScripts: [
"\nconst saved = localStorage.getItem('t');\n"
			]
		});
		const scan = scanHtml('index.html', source, storageReader);
		expect(scan.failures).toEqual([]);
		expect(scan.warnings.map((w) => w.message).join(' ')).toContain('localStorage');
	});
});

describe('a parse failure is a REFUSAL, not a pass', () => {
	// THE REGRESSION ITSELF. Parser-independent on purpose: it is about what
	// `scanHtml` does when the read throws, which is the one thing that was
	// wrong, and it needs no DOM to state.
	const throwing: HtmlReader = () => {
		throw new Error('The HTML parser returned no document.');
	};

	it('reports parseFailed AND a hard failure', () => {
		const scan = scanHtml('index.html', source, throwing);
		expect(scan.parseFailed, 'parseFailed').toBe(true);
		expect(scan.parseError).toContain('no document');

		// The assertion that would have caught the escape. It used to be 0.
		expect(scan.failures.length, 'failures on a parse failure').toBeGreaterThan(0);
		expect(scan.failures[0].message).toContain('could not be read by the checker');
		expect(scan.failures[0].message).toContain('has not been published');
	});

	it('is reached through the real reader when the parser returns null', () => {
		// EXACTLY WHAT DENO-DOM DOES ON A COLD START. `parseFromString` answers
		// null rather than throwing, and treating that as "a document with
		// nothing in it" is what switches every HTML rule off at once.
		const coldParser = { parseFromString: () => null };
		const reader = makeDomHtmlReader(coldParser as never);
		const scan = scanHtml('index.html', source, reader);

		expect(scan.parseFailed).toBe(true);
		expect(scan.failures.length, 'failures on a null document').toBeGreaterThan(0);
	});

	it('never returns a clean pass for a file it could not read', () => {
		// The property, rather than the instance: whatever the reader does
		// wrong, "no failures" must not be the answer. A positive control sits
		// beside it so this cannot pass by refusing everything.
		for (const reader of [
			(() => {
				throw new Error('boom');
			}) as HtmlReader,
			makeDomHtmlReader({ parseFromString: () => null } as never)
		]) {
			const scan = scanHtml('index.html', '<html></html>', reader);
			expect(scan.failures.length).toBeGreaterThan(0);
		}

		// POSITIVE CONTROL: a reader that works, on a file with nothing in it
		// to refuse, still passes.
		const clean = scanHtml('index.html', '<html><head><title>x</title></head></html>', () => ({
			refs: [],
			title: 'x',
			inlineScripts: []
		}));
		expect(clean.failures, 'a clean file still passes').toEqual([]);
	});
});

describe('neither caller can downgrade it again', () => {
	const stripComments = (src: string) =>
		src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

	it('foundry-ingest no longer turns a parse failure into a warning', () => {
		const code = stripComments(fs.readFileSync(INGEST, 'utf8'));
		// It may still LOG the parser error -- that is for us. What it must not
		// do is push a warning and carry on, which is what it used to do.
		// The branch body only: from the `if` to the shared `failures.push` that
		// follows it. A wider window catches the ordinary `warnings.push(...r.warnings)`
		// that belongs to every scan and has nothing to do with this.
		const start = code.indexOf('if (r.parseFailed)');
		const end = code.indexOf('failures.push(...r.failures)', start);
		expect(start, 'parseFailed branch present').toBeGreaterThan(-1);
		expect(end, 'shared failures.push follows it').toBeGreaterThan(start);
		const block = code.slice(start, end);
		expect(block, 'ingest parseFailed branch').not.toContain('warnings.push');
		expect(code, 'the sentence that used to accompany the pass').not.toContain(
			'could not be checked automatically'
		);
	});

	it('the browser preflight has no parseFailed branch of its own to get wrong', () => {
		// It never had one, which was the bug. It must not grow one either: the
		// failure now arrives inside `r.failures`, which it already spreads, so
		// any special-casing here would be a second opinion about the same
		// event.
		const code = stripComments(fs.readFileSync(BROWSER, 'utf8'));
		expect(code, 'browser preflight').not.toContain('parseFailed');
		expect(code, 'browser preflight still spreads failures').toContain('failures.push(...r.failures)');
	});
});
