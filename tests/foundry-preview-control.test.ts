// tests/foundry-preview-control.test.ts
//
// THE RULE THAT DECIDES WHETHER `/foundry/mine` OFFERS A PREVIEW, plus the one
// sentence that has to sit beside it.
//
// WHY IT IS THE PREDICATE AND NOT A RENDER, WHICH IS A FACT ABOUT THE COMPONENT
// WORTH WRITING DOWN. `FoundryMine`'s DETAIL PANE CANNOT BE SERVER-RENDERED:
// the open app is `let app = $state(null)` filled by an `$effect`, and effects
// do not run under `svelte/server`'s `render()`. Measured -- rendering the real
// component with `selected` handed in produces the list pane and an EMPTY detail
// pane (916 bytes, `cr-detail` with nothing in it), so every version row, every
// control on it and every sentence under it is absent from the markup. A test
// that asserted over that render would pass or fail for reasons having nothing
// to do with what it claims to check, and reshaping the component so a test
// could see it would be the harness dictating the code. So the OFFERING RULE
// lives in a pure predicate the template calls, which is the same arrangement
// `versionIsDeletable` has, and that predicate is what is asserted here.
//
// WHY IT IS ASSERTED AT ALL, given the repo adds tests sparingly and a missing
// button fails visibly. The claim that does NOT fail visibly is the one about
// STATUS: every other control on a version row is status-gated, so the natural
// shape of a regression is a status clause added to the one control that must
// not have one -- and the surface would look completely correct to anybody
// testing with a submitted or approved build, which is every build a reviewer
// has. Running a DRAFT is the whole feature.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { foundryPreviewUrl, foundryPreviewable } from '$lib/foundry/bundle-url';
import type { FoundryVersion, FoundryVersionStatus } from '$lib/foundry/transports';

const LIVE = { hidden_at: null };
const SHELVED = { hidden_at: '2026-08-24T12:00:00Z' };

function version(over: Partial<FoundryVersion> = {}): FoundryVersion {
	return {
		id: 'v-1',
		ordinal: 1,
		status: 'draft',
		byte_size: 4096,
		file_count: 3,
		created_at: '2026-08-20T10:00:00Z',
		reviewed_at: null,
		review_note: null,
		reject_reason: null,
		manifest: {},
		...over
	};
}

describe('every version a student owns is offered a preview', () => {
	/**
	 * THE CENTRAL CLAIM, AND THE ONE A REGRESSION WOULD BE SILENT ABOUT. All four
	 * statuses, including the two the published mounts refuse outright.
	 */
	const STATUSES: FoundryVersionStatus[] = ['draft', 'submitted', 'approved', 'rejected'];

	it.each(STATUSES)('offers it for a %s version', (status) => {
		expect(foundryPreviewable(LIVE, version({ status }))).toBe(true);
	});

	/**
	 * SAID STRUCTURALLY AS WELL AS BY CASES: the predicate cannot be reading the
	 * status, because moving ONLY the status never moves the answer. Written this
	 * way rather than as four literals so that a fifth status added to the union
	 * later is covered by the same assertion.
	 */
	it('gives the identical answer for every status, whatever else is true', () => {
		for (const hidden of [LIVE, SHELVED]) {
			for (const count of [0, 1, 500]) {
				const answers = STATUSES.map((status) =>
					foundryPreviewable(hidden, version({ status, file_count: count }))
				);
				expect(new Set(answers).size).toBe(1);
			}
		}
		// POSITIVE CONTROL: the predicate is not simply constant. The sweep above
		// would pass on a function that always returned false.
		expect(foundryPreviewable(LIVE, version())).toBe(true);
		expect(foundryPreviewable(SHELVED, version())).toBe(false);
	});
});

describe('it is withheld exactly where the gate would refuse it', () => {
	/**
	 * AN UPLOAD THAT NEVER UNPACKED has no entry document, so the route answers
	 * the same bodyless 404 an unknown app does.
	 */
	it('withholds it from a version with no files', () => {
		expect(foundryPreviewable(LIVE, version({ file_count: 0 }))).toBe(false);
		// POSITIVE CONTROL: one file is enough, so the refusal is the count.
		expect(foundryPreviewable(LIVE, version({ file_count: 1 }))).toBe(true);
	});

	/**
	 * A SHELVED APP. `previewViewerMayRun` refuses one to its OWNER -- an admin
	 * still previews it -- matching 0130 refusing their edit and 0136 their
	 * delete. This surface is the owner's, so the control goes and the shelved
	 * notice already on that pane says who to ask.
	 */
	it('withholds it for a hidden app', () => {
		expect(foundryPreviewable(SHELVED, version())).toBe(false);
		expect(foundryPreviewable(LIVE, version())).toBe(true);
	});

	it('fails closed on a missing app or version', () => {
		expect(foundryPreviewable(null, version())).toBe(false);
		expect(foundryPreviewable(LIVE, null)).toBe(false);
		expect(foundryPreviewable(undefined, undefined)).toBe(false);
	});
});

/**
 * THE SURFACE ACTUALLY CALLS IT, AND SAYS THE SENTENCE.
 *
 * WHAT THESE ARE AND WHAT THEY ARE NOT. They read the component's own source,
 * because the detail pane cannot be rendered here (see the file header). That
 * makes them presence checks over a file people edit in commits -- NOT a sweep
 * over app-written content, which is the thing this repo refuses. Each is a
 * fixed string chosen in this change, with a positive control, and each guards a
 * regression that is silent: a predicate that stopped being called still
 * type-checks, and a deleted sentence still renders a perfectly good page.
 */
describe('the surface reads the predicate and carries the sentence', () => {
	const SOURCE = readFileSync(
		fileURLToPath(new URL('../src/lib/foundry/FoundryMine.svelte', import.meta.url)),
		'utf8'
	);

	it('read the right file', () => {
		// POSITIVE CONTROL: without this, a wrong path would report every string
		// below as missing and every assertion would be about an empty file.
		expect(SOURCE.length).toBeGreaterThan(1000);
		expect(SOURCE).toContain('aria-label="Versions"');
	});

	it('gates the control on the predicate rather than on an inline expression', () => {
		expect(SOURCE).toContain('foundryPreviewable(app, v)');
		expect(SOURCE).toContain('foundryPreviewUrl(app.id, v.id)');
	});

	it('opens the preview in a new tab, with noopener', () => {
		const i = SOURCE.indexOf('foundryPreviewUrl(app.id, v.id)');
		expect(i).toBeGreaterThan(-1);
		const block = SOURCE.slice(i, i + 600);
		expect(block).toContain('target="_blank"');
		expect(block).toContain('rel="noopener"');
		// A visible word, never a glyph alone (IDEA_INTERFACE_STANDARDS 10), and a
		// 44px target on a student-facing surface.
		expect(block).toContain('Run a preview');
		expect(block).toContain('tap-44');
	});

	/**
	 * WHAT A PREVIEW DOES NOT PROVE. A preview runs in an opaque origin, so
	 * `localStorage` is the injected in-memory shim and nothing in it survives a
	 * reload; a published app is on a real origin and its saves persist. Without
	 * this sentence the first student with a high score files a bug about it.
	 */
	it('says the saved-data difference, once', () => {
		const sentence = 'saved data does not survive a reload in a preview';
		expect(SOURCE).toContain(sentence);
		// ONCE, NOT PER VERSION: it is a fact about previewing rather than about
		// any one build, and repeating it down a list of six is how a true
		// sentence stops being read.
		expect(SOURCE.split(sentence)).toHaveLength(2);
	});

	/**
	 * AND IT SAYS WHICH DIRECTION THE DIFFERENCE RUNS, which is the half that
	 * helps: preview is the published response minus one sandbox flag, so a
	 * preview that works is a published app that works, and only the reverse can
	 * surprise anybody.
	 */
	it('says the difference only runs the safe way', () => {
		expect(SOURCE).toContain('Anything that works in a preview works published');
	});
});

describe('the href the surface builds', () => {
	it('is the slash form the route serves', () => {
		expect(foundryPreviewUrl('app-1', 'ver-1')).toBe('/foundry/preview/app-1/ver-1/');
	});
});
