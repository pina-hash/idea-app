import { describe, expect, it } from 'vitest';

import {
	FOUNDRY_ENTRY_FILE,
	PLATFORM_FONTS_URL,
	classifyReference,
	foundryStarterFile,
	scanHtml,
	scanJs,
	type HtmlFacts,
	type HtmlReader
} from '../src/lib/foundry/preflight.ts';
import { FOUNDRY_STORAGE_SHIM_TAG } from '../src/lib/foundry/storage-shim.ts';

/**
 * THE STARTER FILE HAS TO PASS THE PLATFORM'S OWN PREFLIGHT.
 *
 * `/foundry/starter` hands a student a complete `index.html` to build on. A
 * starter the platform gives out and then REFUSES is the worst thing this
 * feature can do: the student did exactly what they were told, the upload
 * stops, and the message blames their file. Nothing on any screen would say
 * where it came from.
 *
 * IT FAILS SILENTLY TOO, which is why it is a test rather than a browser pass.
 * The starter is generated, so a rule change or a constant move rewrites it
 * without anybody looking at it, and the next person to notice is a student.
 *
 * THE READER IS STUBBED, WHICH IS THE SEAM AND NOT A BYPASS. `scanHtml` takes
 * its `HtmlReader` as a parameter precisely because Deno and the browser parse
 * differently, and this suite runs in Node where there is no DOM. The refs
 * below are pulled OUT OF THE GENERATED FILE by a regex rather than typed, so
 * the facts handed to the scanner are this file's own facts and a tag added to
 * the starter later is a tag this test sees.
 */

const STARTER = foundryStarterFile();

/** Every `src`/`href` in the generated file, in source order. */
function refsIn(html: string): HtmlFacts['refs'] {
	const out: HtmlFacts['refs'] = [];
	const re = /<(script|link|img|iframe)\b[^>]*?\b(src|href)\s*=\s*"([^"]*)"/gi;
	for (let m = re.exec(html); m !== null; m = re.exec(html)) {
		out.push({ tag: m[1].toLowerCase(), attr: m[2].toLowerCase(), value: m[3] });
	}
	return out;
}

/** Every inline `<script>` body -- the ones with no `src`. */
function inlineScriptsIn(html: string): string[] {
	const out: string[] = [];
	const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
	for (let m = re.exec(html); m !== null; m = re.exec(html)) {
		if (/\bsrc\s*=/i.test(m[1])) continue;
		out.push(m[2]);
	}
	return out;
}

const reader: HtmlReader = (): HtmlFacts => ({
	refs: refsIn(STARTER),
	title: 'My App',
	inlineScripts: inlineScriptsIn(STARTER)
});

describe('the starter file passes the checks it will be put through', () => {
	it('produces no failures', () => {
		const scan = scanHtml(FOUNDRY_ENTRY_FILE, STARTER, reader);
		expect(scan.failures.map((f) => f.message)).toEqual([]);
	});

	/**
	 * POSITIVE CONTROLS FOR THE ABSENCE ABOVE. A scanner handed nothing reports
	 * nothing, and "the starter is clean" and "the extraction found no tags"
	 * are the same empty array. These say the extraction worked.
	 */
	it('really did hand the scanner the file s own tags', () => {
		const refs = refsIn(STARTER);
		expect(refs.length, 'references extracted').toBeGreaterThanOrEqual(4);
		expect(inlineScriptsIn(STARTER).length, 'inline scripts extracted').toBeGreaterThanOrEqual(2);

		// And a deliberately broken copy of the same file IS refused, so the
		// clean result is the checks running rather than the checks being off.
		const broken = STARTER.replace(PLATFORM_FONTS_URL, '/_platform/fonts.css');
		const scan = scanHtml(FOUNDRY_ENTRY_FILE, broken, () => ({
			refs: refsIn(broken),
			title: 'My App',
			inlineScripts: inlineScriptsIn(broken)
		}));
		expect(scan.failures.length, 'the broken copy is refused').toBeGreaterThan(0);
	});

	/**
	 * THE SHIM IS THE REASON THE STARTER EXISTS AT ALL for most students, so it
	 * is asserted BY IDENTITY rather than by looking for the word localStorage.
	 * A hand-typed second copy in the starter is exactly the drift this catches.
	 */
	it('carries the one shim, byte for byte, first inside <head>', () => {
		expect(STARTER).toContain(FOUNDRY_STORAGE_SHIM_TAG);
		const head = STARTER.indexOf('<head>') + '<head>'.length;
		const shim = STARTER.indexOf(FOUNDRY_STORAGE_SHIM_TAG);
		const firstOtherScript = STARTER.indexOf('<script', head);
		const firstLink = STARTER.indexOf('<link', head);
		expect(shim, 'the shim is the first script').toBe(firstOtherScript);
		expect(shim, 'the shim precedes the stylesheet').toBeLessThan(firstLink);
	});

	it('links the platform fonts by their whole URL', () => {
		expect(STARTER).toContain(`href="${PLATFORM_FONTS_URL}"`);
		// The root-relative spelling cannot resolve from a bundle's origin and
		// is refused at upload, so the starter must never carry it.
		expect(STARTER).not.toContain('href="/_platform/fonts.css"');
		expect(classifyReference(PLATFORM_FONTS_URL).kind).toBe('ok');
	});

	/**
	 * NO ROOT-RELATIVE PATH ANYWHERE, which is the single rule most likely to
	 * be reintroduced by copying a line out of an older starter.
	 */
	it('holds no absolute path at all', () => {
		for (const ref of refsIn(STARTER)) {
			expect(classifyReference(ref.value).kind, `${ref.tag} ${ref.attr}=${ref.value}`).toBe('ok');
		}
	});

	/**
	 * The starter's own inline script uses no storage, so the warning it would
	 * otherwise earn -- pointing at the shim that is already three lines above
	 * it -- never fires.
	 */
	it('warns about nothing', () => {
		const scan = scanHtml(FOUNDRY_ENTRY_FILE, STARTER, reader);
		expect(scan.warnings.map((w) => w.message)).toEqual([]);
		// POSITIVE CONTROL: the storage warning is still reachable from the same
		// scanner, so the empty array is the starter and not a dead rule.
		expect(scanJs('x.js', "localStorage.getItem('a');").warnings).toHaveLength(1);
	});
});
