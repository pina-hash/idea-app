// tests/html-assignment-pacing.test.ts
//
// LEDGER 0439: THE `pacing` KEY IS A DISPLAY KEY, AND A DISPLAY KEY NEVER
// DECIDES WHETHER A DOCUMENT IMPORTS (SPEC 4.8, section 17).
//
// THE GATE-WIDENING PROOF, against every stored document. CLAUDE.md requires a
// widened gate to answer every already stored document exactly as before. The
// manifest gate in the database (0195, 0301) never reads `pacing`, so the only
// gate this push touches is `validateHtmlManifest`, and only by adding WARNINGS.
// So, for every HTML assignment exported under `materials/` (one per document
// ever imported, ledger 0431), taken with its own `pacing` removed (the
// document as it was before the key existed):
//   1. the reader and the warnings say nothing about the bare document;
//   2. the document AS STORED, with whatever plan its author gave it, validates
//      with the identical errors, and only gains the warnings its own plan
//      earns (none for a well-formed plan);
//   3. the same document with a well-formed `pacing` added validates with the
//      identical errors and warnings, and the reader returns the steps;
//   4. the same document with a malformed `pacing` added still validates with
//      the identical ERRORS (no refusal) and only gains warnings.
// The positive control is (3)'s reader output and (4)'s extra warnings: a
// no-op reader or a validator that never ran would fail them.
//
// LEDGER 0473: this used to assert that NO stored document carries the key,
// which was true on the day the gate widened (ledger 0439) and stopped being
// true the day a teacher used the feature: the two IDEA209H Launcher posts
// were given real plans on 2026-10-29 and the sweep went red over content
// that is exactly what the key is for. That assertion was a fact about
// `materials/`, a directory the app writes (docs/subsystems/testing.md, "never
// assert over a directory the app writes"); the rule it stood in for, that a
// plan never decides whether a document imports, is what (2) now asserts over
// every stored plan, whatever is in the directory on the day.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	extractManifestScript,
	validateHtmlManifest,
	HTML_MANIFEST_SCRIPT_ID
} from '../src/lib/classroom/html-assignment/manifest';
import {
	PACING_MAX_DAY,
	manifestPacing,
	manifestPacingWarnings
} from '../src/lib/classroom/html-assignment/pacing';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function documentsUnder(dir: string): { name: string; html: string }[] {
	const out: { name: string; html: string }[] = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) out.push(...documentsUnder(path));
		else if (entry === 'assignment.html') out.push({ name: path.slice(ROOT.length), html: readFileSync(path, 'utf8') });
	}
	return out;
}

const CORPUS = documentsUnder(join(ROOT, 'materials'));

/** The document with its manifest replaced by `manifest`, everything else byte for byte. */
function withManifest(html: string, manifest: unknown): string {
	const re = new RegExp(`(<script[^>]*id=["']${HTML_MANIFEST_SCRIPT_ID}["'][^>]*>)([\\s\\S]*?)(</script>)`);
	return html.replace(re, (_m, open, _body, close) => `${open}${JSON.stringify(manifest)}${close}`);
}

describe('pacing on every stored HTML assignment', () => {
	it('the corpus is there to test', () => {
		expect(CORPUS.length).toBeGreaterThanOrEqual(20);
	});

	for (const doc of CORPUS) {
		it(`${doc.name} validates exactly as before, with pacing added or broken`, () => {
			const json = extractManifestScript(doc.html).json;
			expect(json).not.toBeNull();
			const stored = JSON.parse(json!) as Record<string, unknown>;
			const { pacing: ownPacing, ...manifest } = stored;
			const bareHtml = ownPacing === undefined ? doc.html : withManifest(doc.html, manifest);
			const before = validateHtmlManifest(bareHtml);

			// 1. With no plan, the reader is silent.
			expect(manifestPacing(manifest)).toEqual([]);
			expect(manifestPacingWarnings(manifest)).toEqual([]);

			// 2. The document as stored: its own plan never changes the errors, and
			// adds only the warnings that plan earns.
			const asStored = validateHtmlManifest(doc.html);
			expect(asStored.errors).toEqual(before.errors);
			expect([...asStored.warnings].sort()).toEqual([...before.warnings, ...manifestPacingWarnings(stored)].sort());

			const moduleIds = (manifest.modules as { id: string }[]).map((m) => m.id);
			const good = {
				...manifest,
				pacing: [
					{ id: 'd1', day: 1, title: 'Start the first part', modules: [moduleIds[0]] },
					{ id: 'd2', date: '2026-11-02', title: 'Everything ready', modules: moduleIds }
				]
			};
			const withGood = validateHtmlManifest(withManifest(doc.html, good));
			// 3. Identical answer; the reader sees both steps.
			expect(withGood.errors).toEqual(before.errors);
			expect(withGood.warnings).toEqual(before.warnings);
			expect(manifestPacing(good).map((s) => s.id)).toEqual(['d1', 'd2']);

			const bad = { ...manifest, pacing: [{ id: 'bad id', day: 0 }, { id: 'x', title: 'Both', day: 2, date: '2026-11-02' }] };
			const withBad = validateHtmlManifest(withManifest(doc.html, bad));
			// 4. No refusal, only warnings.
			expect(withBad.errors).toEqual(before.errors);
			expect(withBad.warnings.length).toBe(before.warnings.length + 2);
			expect(manifestPacing(bad)).toEqual([]);
		});
	}
});

describe('manifestPacing', () => {
	const base = { modules: [{ id: 'brief' }, { id: 'sizing' }] };

	it('reads day and date steps, keeping only declared modules', () => {
		const steps = manifestPacing({
			...base,
			pacing: [
				{ id: 'd1', day: 1, title: '  Read the brief  ', modules: ['brief', 'ghost', 'brief'] },
				{ id: 'review', date: '2026-11-02', title: 'Review ready' }
			]
		});
		expect(steps).toEqual([
			{ id: 'd1', title: 'Read the brief', day: 1, date: null, modules: ['brief'] },
			{ id: 'review', title: 'Review ready', day: null, date: '2026-11-02', modules: [] }
		]);
	});

	it('drops a step with no title, both or neither of day and date, an impossible date, a repeated id or a day out of range', () => {
		const steps = manifestPacing({
			...base,
			pacing: [
				{ id: 'a', day: 1 },
				{ id: 'b', title: 'Both', day: 1, date: '2026-11-02' },
				{ id: 'c', title: 'Neither' },
				{ id: 'd', title: 'Feb 30', date: '2026-02-30' },
				{ id: 'e', title: 'Good', day: 3 },
				{ id: 'e', title: 'Repeat', day: 4 },
				{ id: 'f', title: 'Too far', day: PACING_MAX_DAY + 1 },
				{ id: 'g', title: 'Half', day: 1.5 }
			]
		});
		expect(steps.map((s) => s.id)).toEqual(['e']);
	});

	it('says why each step is ignored, and names a weekday and an unknown module', () => {
		const w = manifestPacingWarnings({
			...base,
			pacing: [{ id: 'a', day: 1 }, { id: 'b', title: 'Due Friday', day: 2, modules: ['ghost'] }]
		});
		expect(w).toHaveLength(3);
		expect(w[0]).toMatch(/Pacing step 1 needs a title/);
		expect(w[1]).toMatch(/weekday/);
		expect(w[2]).toMatch(/"ghost"/);
		expect(manifestPacingWarnings({ ...base, pacing: 'soon' })[0]).toMatch(/must be a list/);
		expect(manifestPacingWarnings(base)).toEqual([]);
	});
});
