// tests/html-assignment-python-mint.test.ts
//
// A LOOKUP IS NOT A MINT, AND THE PYTHON TOOL COULD NOT TELL THEM APART.
//
// `tools/validate-assignment-spec.py` refuses a document that BUILDS a
// `data-field` at runtime: a minted per-cell field names nothing in the
// manifest, so a student's answer there is dropped silently (ledger 0128's
// `addMfgRow`, which produced `mfg-06-p`). The check is right and the regex was
// one character short -- `data-field\s*=\s*[`'"][^`'"]*\$\{` with nothing in
// front of it also matched
//     document.querySelector(`[data-field="${f}"]`)
// which READS a field that already exists. Measured on the ported Blade
// fixture, which carries two of those.
//
// THE DISCRIMINATOR IS THE CHARACTER BEFORE THE ATTRIBUTE. A minted attribute
// is written into MARKUP, so it follows the whitespace after a tag name; a CSS
// attribute selector follows `[`. The leading `\s` is also exactly what
// `DATA_FIELD_RE` in the same file already requires, so the two checks now
// agree about what an attribute looks like.
//
// IT DRIVES THE REAL TOOL over real temporary documents rather than re-testing
// the regex in TypeScript, which would be a second copy of the thing under
// test and would pass whatever python did.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const TOOL = fileURLToPath(new URL('../tools/validate-assignment-spec.py', import.meta.url));
const SMOKE = fileURLToPath(new URL('./fixtures/hx-smoke-test.html', import.meta.url));

let dir: string;
beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), 'hx-mint-'));
});
afterAll(() => {
	rmSync(dir, { recursive: true, force: true });
});

/**
 * The tool's whole output for one document.
 *
 * IT EXITS NON-ZERO ON A REFUSAL, so `execFileSync` THROWS on exactly the runs
 * this file is most interested in. The verdict is on stdout either way, and
 * reading it off the thrown error is what keeps a refusal a RESULT here rather
 * than a crashed test -- which is what the first shape of this helper produced,
 * four failures that all read as the tool being broken.
 */
function run(args: string[]): string {
	try {
		return execFileSync('python3', args, { encoding: 'utf8' });
	} catch (e) {
		const err = e as { stdout?: string; stderr?: string };
		if (typeof err.stdout === 'string') return err.stdout;
		throw e;
	}
}

function validate(html: string): string {
	const path = join(dir, `doc-${Math.random().toString(36).slice(2)}.html`);
	writeFileSync(path, html, 'utf8');
	return run([TOOL, path]);
}

const MINT_MESSAGE = 'builds a data-field at runtime';
const BASE = readFileSync(SMOKE, 'utf8');

/** The smoke document with one line spliced into its script. */
const withScript = (line: string) => BASE.replace('<script>\n(function () {', `<script>\n(function () {\n${line}`);

describe('the runtime-mint check', () => {
	it('passes the smoke document untouched -- the baseline', () => {
		// Without this the two cases below could both be a tool that refuses
		// everything or accepts everything.
		expect(validate(BASE)).toContain('PASS');
	});

	it('does NOT match a querySelector lookup', () => {
		const out = validate(
			withScript('var el = document.querySelector(`[data-field="${name}"]`);')
		);
		expect(out).not.toContain(MINT_MESSAGE);
		expect(out).toContain('PASS');
	});

	it('does NOT match a querySelectorAll lookup either', () => {
		const out = validate(
			withScript('var all = document.querySelectorAll(`[data-field="${key}"]`);')
		);
		expect(out).not.toContain(MINT_MESSAGE);
	});

	it('STILL matches a template literal that builds the attribute into markup', () => {
		const out = validate(
			withScript('row.innerHTML = `<td><input data-field="mfg-${n}-p"></td>`;')
		);
		expect(out).toContain(MINT_MESSAGE);
		expect(out).toContain('FAIL');
	});

	it('STILL matches setAttribute, which the leading \\s never governed', () => {
		const out = validate(withScript("el.setAttribute('data-field', 'mfg-' + n);"));
		expect(out).toContain(MINT_MESSAGE);
	});
});

describe('the ported Blade fixture', () => {
	/**
	 * IT IS STILL REFUSED, AND THAT IS CORRECT RATHER THAN THE BUG ABOVE.
	 *
	 * It carries BOTH shapes: two `querySelector` lookups (the false positive,
	 * now gone) and four genuine mints in `addMfgRow` -- literally the
	 * `mfg-${n}-p` case the check's own comment names. Fixing the regex removes
	 * the lookups from the match set and does not change this file's verdict,
	 * which is worth pinning so nobody reads the fix as having made it pass.
	 */
	it('fails on its real mints, not on its lookups', () => {
		const ported = fileURLToPath(
			new URL('../src/routes/dev/html-assignment/fixtures/idea100-blade-01.ported.html', import.meta.url)
		);
		const out = run([TOOL, ported]);
		expect(out).toContain(MINT_MESSAGE);
		const html = readFileSync(ported, 'utf8');
		expect(html, 'the lookups are what the old regex matched').toContain(
			'querySelector(`[data-field="${f}"]`)'
		);
		expect(html, 'the mints are what it is refused for').toContain('data-field="mfg-${n}-p"');
	});
});

describe('the handshake refusal, mirrored', () => {
	it('refuses the template in python exactly as the TypeScript validator does', () => {
		const template = fileURLToPath(
			new URL('../src/lib/legacy/assignments/_TEMPLATE.html', import.meta.url)
		);
		const out = run([TOOL, template]);
		expect(out).toContain('never sends idea:ready');
		expect(out).toContain('FAIL');
	});

	it('passes the smoke document, which does send it', () => {
		expect(validate(BASE)).not.toContain('never sends idea:ready');
	});
});
