// tests/foundry-viewport-rule.test.ts
//
// REPORT 33b's SECOND HALF: a bundle whose entry file does not tell a phone how
// wide it is lays out at about 980 CSS pixels and is scaled down to fit, so the
// app renders correct, complete and unreadably small -- inside the stage, in
// full screen, and on any phone.
//
// WHY THIS IS A TEST. The regression is silent in both directions and both are
// bad in a way nobody would notice from a screen:
//
//   * THE RULE GOING MISSING costs a warning a student never sees. Nothing
//     fails, nothing renders wrong on the desktop it was built on, and the
//     first person to find out is whoever opens the app on a phone.
//
//   * THE RULE OVER-FIRING is worse, and is the thing the loose regex could
//     actually get wrong: a false warning on a correct file, addressed to a
//     student who already did the right thing, teaches them the platform is
//     arbitrary. So every accepted spelling below is a case that must NOT warn.
//
// IT IS A WARNING AND NEVER A FAILURE, which is asserted rather than assumed:
// an app may legitimately be desktop-only, and every app already published
// without the tag would start failing a check it passed on the day it was
// uploaded.

import { describe, expect, it } from 'vitest';
import {
	FOUNDRY_ENTRY_FILE,
	htmlDeclaresViewport,
	scanHtml,
	viewportWarning,
	type HtmlFacts
} from '$lib/foundry/preflight';

const EMPTY: HtmlFacts = { refs: [], title: 'Fixture', inlineScripts: [] };

function scan(path: string, source: string) {
	return scanHtml(path, source, () => EMPTY);
}

/** The warnings whose sentence is this rule's, so a count cannot drift. */
function viewportWarnings(source: string, path = FOUNDRY_ENTRY_FILE) {
	return scan(path, source).warnings.filter((w) => w.message.includes('viewport meta tag'));
}

describe('htmlDeclaresViewport accepts every spelling a correct page uses', () => {
	// EACH OF THESE IS A REAL FILE SOMEBODY WOULD WRITE. The double-quoted form
	// is what the starter emits; the rest are what hand-written and
	// tool-generated pages actually look like.
	const ACCEPTED: [string, string][] = [
		['the starter\'s own spelling', '<meta name="viewport" content="width=device-width, initial-scale=1">'],
		['single quotes', "<meta name='viewport' content='width=device-width'>"],
		['no quotes at all', '<meta name=viewport content=width=device-width>'],
		['upper case', '<META NAME="VIEWPORT" CONTENT="width=device-width">'],
		['attributes the other way round', '<meta content="width=device-width" name="viewport">'],
		['self closing', '<meta name="viewport" content="width=device-width" />'],
		['whitespace round the equals', '<meta name = "viewport" content="width=device-width">'],
		['split across lines', '<meta\n\tname="viewport"\n\tcontent="width=device-width">']
	];

	for (const [label, tag] of ACCEPTED) {
		it(`accepts ${label}`, () => {
			expect(htmlDeclaresViewport(`<!doctype html><head>${tag}</head>`)).toBe(true);
			expect(viewportWarnings(`<!doctype html><head>${tag}</head>`)).toEqual([]);
		});
	}
});

describe('htmlDeclaresViewport refuses what is not a viewport tag', () => {
	// THE POSITIVE CONTROL FOR THE WHOLE BLOCK ABOVE. Without at least one case
	// that DOES warn, a `htmlDeclaresViewport` stubbed to return true would
	// pass every accepted case and prove nothing.
	const REFUSED: [string, string][] = [
		['nothing at all', '<!doctype html><head><title>x</title></head>'],
		['a charset meta only', '<!doctype html><head><meta charset="utf-8"></head>'],
		['a description meta', '<meta name="description" content="a viewport of the sea">'],
		[
			'the WORD viewport in ordinary text',
			'<!doctype html><body><p>Set the viewport to 640 wide.</p></body>'
		],
		['a name that merely starts with viewport', '<meta name="viewport-hint" content="x">']
	];

	for (const [label, source] of REFUSED) {
		it(`warns for ${label}`, () => {
			expect(htmlDeclaresViewport(source)).toBe(false);
			const found = viewportWarnings(source);
			expect(found).toHaveLength(1);
			expect(found[0].message).toBe(viewportWarning(FOUNDRY_ENTRY_FILE));
		});
	}
});

describe('where and how the warning lands', () => {
	it('is a WARNING and never a failure', () => {
		const result = scan(FOUNDRY_ENTRY_FILE, '<!doctype html><head></head>');
		expect(result.failures).toEqual([]);
		expect(result.warnings).toHaveLength(1);
	});

	it('fires on the entry file only, never on another page of the bundle', () => {
		// A fragment fetched into a div is not laid out on its own, so warning
		// about it would be noise on a correct bundle.
		expect(viewportWarnings('<div>panel</div>', 'parts/panel.html')).toEqual([]);
		// The same source under the entry file's name DOES warn, which is the
		// control proving the line above is about the path and not the content.
		expect(viewportWarnings('<div>panel</div>')).toHaveLength(1);
	});

	it('fires once even on a page with several meta tags', () => {
		const source =
			'<!doctype html><head><meta charset="utf-8"><meta name="author" content="a"></head>';
		expect(viewportWarnings(source)).toHaveLength(1);
	});

	it('names the entry file and hands back the tag to paste', () => {
		const message = viewportWarning(FOUNDRY_ENTRY_FILE);
		expect(message).toContain(FOUNDRY_ENTRY_FILE);
		expect(message).toContain('width=device-width');
		// The sentence says the limit is a choice, because a desktop-only app is
		// a legitimate thing for a student to build.
		expect(message).toContain('desktop');
		// House rule: no em dashes in anything a student reads.
		expect(message).not.toContain('—');
	});
});
