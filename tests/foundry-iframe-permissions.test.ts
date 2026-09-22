// tests/foundry-iframe-permissions.test.ts
//
// WHAT A BUNDLE'S FRAME IS ALLOWED TO DO, AND WHAT IT IS NOT (report 33b).
//
// WHY THIS IS A TEST. Removing `allow="fullscreen"` from the frame changes
// NOTHING anybody looking at the portal can see: the page renders identically,
// `AppStage`'s own full-screen control still works (it is the parent's, and it
// asks the Fullscreen API for the stage element), and the only thing that
// breaks is the button INSIDE a student's game, on their device, with the
// browser refusing silently. That is the exact shape `CLAUDE.md` says to write
// a test for.
//
// THE MECHANISM, MEASURED RATHER THAN ASSUMED. In a real Chromium, with the
// production sandbox set and a genuinely cross-origin child, the attribute is
// the whole difference:
//
//   with allow="fullscreen"   document.fullscreenEnabled true, the request
//                             from a real gesture resolves
//   without it                document.fullscreenEnabled false, the request
//                             throws "TypeError: Disallowed by permissions
//                             policy"
//
// The Permissions-Policy default allowlist for `fullscreen` is `self`, no
// response in this repository sends a Permissions-Policy header, and a bundle
// is cross-origin by design -- so `self` never includes it.
//
// THE REFUSALS BELOW MATTER AS MUCH AS THE GRANT. `allow` is an allowlist of
// powerful features, and the easy wrong move is to widen it to whatever a
// student's app happens to want next. Each of those is its own decision.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
	fileURLToPath(new URL('../src/lib/foundry/AppFrame.svelte', import.meta.url)),
	'utf8'
);

/**
 * THE FILE WITH ITS PROSE TAKEN OUT, AND THAT IS NOT TIDINESS.
 *
 * Both kinds of comment in this component TALK ABOUT the markup they sit above
 * -- the JSDoc block mentions `<iframe>` in a sentence, and the HTML comment
 * above the tag explains why `allowfullscreen` was NOT used. A first draft
 * read the raw file and got both wrong in the same direction: it counted two
 * iframes where there is one, and it found the word `allowfullscreen` in the
 * explanation of why the file does not use it, so the row asserting its
 * absence failed on a file that is correct.
 *
 * That is the shape `CLAUDE.md` warns about for the coverage-note sweep and
 * for `cssText` under CSS nesting: a sweep that reads prose as code comes back
 * with a confident wrong answer. Strip the prose, then parse.
 */
const FRAME = SOURCE.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

/** The `allow` attribute as it is written on the one iframe in this repo. */
function allowAttribute(): string | null {
	const tag = /<iframe[\s\S]*?><\/iframe>/.exec(FRAME)?.[0];
	if (!tag) return null;
	return /\ballow="([^"]*)"/.exec(tag)?.[1] ?? null;
}

describe('the bundle frame grants fullscreen and nothing else', () => {
	it('carries allow="fullscreen" on the iframe', () => {
		// ON THE TAG, not merely somewhere in the file: the word appears in the
		// comment above it several times, so a file-wide `toContain` would pass
		// on a frame that lost the attribute and kept the explanation.
		expect(allowAttribute()).toBe('fullscreen');
	});

	it('there is exactly one iframe in the feature, so there is one place to get this wrong', () => {
		expect(FRAME.split('<iframe').length - 1).toBe(1);
		// POSITIVE CONTROL FOR THE STRIPPING ABOVE: the raw file really does
		// mention it twice, so a stripper that silently removed everything
		// would not pass this pair.
		expect(SOURCE.split('<iframe').length - 1).toBe(2);
	});

	it('grants no other powerful feature', () => {
		/*
		 * EVERY ONE OF THESE DEFAULTS TO `self` AND IS THEREFORE REFUSED TODAY
		 * FOR THE SAME REASON FULLSCREEN WAS. A gamepad in a student's racing
		 * game silently doing nothing is this defect one feature over -- it has
		 * not been reported, and adding it here without a report is widening
		 * what a student's code may reach on a hunch.
		 */
		const granted = (allowAttribute() ?? '').split(/[;,]/).map((s) => s.trim().split(/\s+/)[0]);
		for (const feature of [
			'camera',
			'microphone',
			'geolocation',
			'gamepad',
			'autoplay',
			'payment',
			'usb',
			'serial',
			'bluetooth',
			'midi',
			'display-capture',
			'xr-spatial-tracking',
			'clipboard-read',
			'clipboard-write'
		]) {
			expect(granted, `${feature} must not be granted without its own decision`).not.toContain(
				feature
			);
		}
		// POSITIVE CONTROL: the list really was read, and it really does hold
		// the one thing it is supposed to.
		expect(granted).toEqual(['fullscreen']);
	});

	it('uses the Permissions-Policy spelling, not the legacy boolean attribute', () => {
		// The two are synonyms by specification. Using `allow` means there is
		// ONE place to read what this frame may do, rather than one attribute
		// and one list that can disagree.
		const tag = /<iframe[\s\S]*?><\/iframe>/.exec(FRAME)?.[0] ?? '';
		expect(/\ballowfullscreen\b/.test(tag)).toBe(false);
	});

	it('still carries the sandbox and the referrer policy it always did', () => {
		// A regression that replaced the whole tag would satisfy every row above
		// and quietly drop the isolation. These two are the frame's real
		// boundary and the grant sits beside them, never instead of them.
		const tag = /<iframe[\s\S]*?><\/iframe>/.exec(FRAME)?.[0] ?? '';
		expect(tag).toContain('sandbox={sandboxFlags}');
		expect(tag).toContain('referrerpolicy="no-referrer"');
	});
});
