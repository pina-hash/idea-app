// tests/html-assignment-handshake.test.ts
//
// A PORTED DOCUMENT THAT CANNOT TALK TO THE CLASSROOM IS REFUSED, AND IT USED
// TO BE ACCEPTED IN SILENCE.
//
// Every other check in `validateHtmlManifest` reads the manifest and the
// markup. None of them reads a line of the document's JavaScript -- so a
// document with a perfect manifest, perfect `[data-field]` correspondence and
// NO BRIDGE CODE AT ALL validated with ZERO errors, and importing it would have
// produced a worksheet that takes typing and stores nothing. That is the one
// failure this whole feature is written to avoid.
//
// THE BEFORE-STATE WAS MEASURED, NOT ASSUMED. `src/lib/legacy/assignments/_TEMPLATE.html`
// put through the validator as shipped at `89b8154` answered
// `errors: 0, warnings: 0, manifest: PARSED`. It is refused here.
//
// THE FIXTURES ARE REAL COMMITTED DOCUMENTS, never hand-written HTML. A
// hand-written one would be a document whose author knew what the check was
// looking for, which is the case that cannot fail. `hx-smoke-test.html` is the
// document behind Mr. Pina's own live IDEA100 item, byte for byte.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HX_READY_TYPE } from '../src/lib/classroom/html-assignment/bridge';
import {
	HX_SANDBOX_TRAPS,
	documentScripts,
	validateHtmlManifest
} from '../src/lib/classroom/html-assignment/manifest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const SMOKE = read('./fixtures/hx-smoke-test.html');
const TEMPLATE = read('../src/lib/legacy/assignments/_TEMPLATE.html');
const PORTED = read('../src/routes/dev/html-assignment/fixtures/idea100-blade-01.ported.html');

const handshakeErrors = (errors: string[]) => errors.filter((e) => e.includes(HX_READY_TYPE));

describe('the handshake refusal', () => {
	it('refuses a document that never sends it, naming what to post', () => {
		const v = validateHtmlManifest(TEMPLATE);
		expect(handshakeErrors(v.errors)).toHaveLength(1);
		// The sentence hands back the message to send, because the next thing
		// that happens to a refusal is being pasted into whatever generated the
		// document.
		expect(handshakeErrors(v.errors)[0]).toContain('"schemaVersion":3');
		// NO PARTIAL RESULT. A refused document yields no manifest at all, so
		// nothing downstream can import half of it.
		expect(v.manifest).toBeNull();
	});

	it('accepts the two documents that DO send it -- the positive control', () => {
		// Without this pair the refusal above could be a validator that refuses
		// everything, which passes just as green.
		for (const [name, html] of [
			['the smoke test', SMOKE],
			['the ported Blade fixture', PORTED]
		] as const) {
			const v = validateHtmlManifest(html);
			expect(v.errors, `${name} should validate clean`).toEqual([]);
			expect(v.manifest, `${name} should yield a manifest`).not.toBeNull();
		}
	});

	it('is not satisfied by a COMMENT, which is the template the refusal exists to catch', () => {
		// The file most likely to gain `// TODO: send idea:ready` is the very one
		// being refused, so a scan over raw bytes would quietly stop biting.
		const commented = TEMPLATE.replace(
			'<script>',
			`<script>\n// TODO: send ${HX_READY_TYPE} once the fields are wired\n/* ${HX_READY_TYPE} */\n`
		);
		expect(commented, 'the fixture edit must actually land').toContain(HX_READY_TYPE);
		expect(handshakeErrors(validateHtmlManifest(commented).errors)).toHaveLength(1);
	});

	it('IS satisfied by a real send in a script -- the other half of that control', () => {
		const wired = TEMPLATE.replace(
			'<script>',
			`<script>\nparent.postMessage({ type: '${HX_READY_TYPE}', schemaVersion: 3 }, '*');\n`
		);
		expect(handshakeErrors(validateHtmlManifest(wired).errors)).toHaveLength(0);
	});
});

describe('documentScripts', () => {
	it('is the complement of the inert strip: the manifest block is not in it', () => {
		const scripts = documentScripts(SMOKE);
		// The manifest is a <script>, and reading it here would make every
		// message type named inside a manifest look like code.
		expect(scripts).not.toContain('"schemaVersion": 3');
		expect(scripts).toContain(HX_READY_TYPE);
	});

	it('drops both comment forms and keeps the code around them', () => {
		const html = `<script>/* ${HX_READY_TYPE} */ var a = 1; // ${HX_READY_TYPE}\nvar b = 2;</script>`;
		const out = documentScripts(html);
		expect(out).not.toContain(HX_READY_TYPE);
		expect(out).toContain('var a = 1;');
		expect(out).toContain('var b = 2;');
	});
});

describe('the opaque-origin warnings', () => {
	it('warns on localStorage and does not refuse over it', () => {
		// A document may legitimately guard one in a `try` and fall back to the
		// bridge, which is what a correctly ported document does -- so refusing
		// would refuse the fixed version along with the broken one.
		const v = validateHtmlManifest(TEMPLATE);
		expect(v.warnings.some((w) => w.includes('localStorage'))).toBe(true);
		expect(v.errors.some((e) => e.includes('localStorage'))).toBe(false);
	});

	it('says NOTHING AT ALL about a correctly ported document', () => {
		// THE ONE THAT MATTERS, AND IT FAILED IN THIS BUNDLE'S FIRST DRAFT. Every
		// correct ported document reaches the classroom through
		// `window.parent.postMessage` and checks `e.source !== window.parent`,
		// because that is the bridge contract -- so a scan that merely looked for
		// `window.parent` warned "the frame has no reach into the parent
		// document" about the smoke test, the Blade port, and every document
		// anybody will ever write correctly. A warning false on every working
		// document is a thing authors learn to scroll past, which costs the four
		// real traps beside it.
		for (const [name, html] of [
			['the smoke test', SMOKE],
			['the ported Blade fixture', PORTED]
		] as const) {
			expect(validateHtmlManifest(html).warnings, `${name} should warn about nothing`).toEqual(
				[]
			);
		}
	});

	it('STILL warns when the parent is reached for something the bridge is not', () => {
		// The other half of that control: taking the idioms out must not take the
		// trap out. A document reading the parent's DOM is exactly what throws.
		const v = validateHtmlManifest(
			SMOKE.replace('<script>', '<script>\nvar t = window.parent.document.title;\n')
		);
		expect(v.warnings.some((w) => w.includes('window.parent'))).toBe(true);
	});

	it('names every trap it carries, so a silent list cannot pass', () => {
		expect(HX_SANDBOX_TRAPS.length).toBeGreaterThan(0);
		for (const trap of HX_SANDBOX_TRAPS) {
			// `.foo` so a parent trap is a genuine reach rather than one of the two
			// bridge idioms, which are taken out before the scan runs.
			const v = validateHtmlManifest(
				SMOKE.replace('<script>', `<script>\nvar probe = ${trap.name}.foo;\n`)
			);
			expect(
				v.warnings.some((w) => w.includes(trap.name)),
				`${trap.name} should warn`
			).toBe(true);
		}
	});
});
