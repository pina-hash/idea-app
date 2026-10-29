// tests/html-thumbnail-shell.test.ts
//
// LEDGER 0458, REPORT f3a3a687: a post thumbnail's shell carries the site's
// faces and the kit's tokens for both themes, and the generated module is
// what tools/hx-thumb-shell.mjs writes today.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { thumbnailDocument } from '$lib/classroom/html-assignment/thumbnail';
import { THUMB_SHELL_CSS } from '$lib/classroom/html-assignment/thumbnail-shell.generated';
// THE TOOL IS PLAIN JS, imported by a computed address so the type checker does
// not walk it (and the kit's build.mjs it calls) as TypeScript.
const TOOL = new URL('../tools/hx-thumb-shell.mjs', import.meta.url).href;
const { generatedModule, OUT, shellCss } = (await import(/* @vite-ignore */ TOOL)) as {
	generatedModule: (css: string) => string;
	OUT: string;
	shellCss: () => string;
};

describe('the thumbnail shell', () => {
	it('is current with the kit tokens and the font files', () => {
		expect(readFileSync(OUT, 'utf8')).toBe(generatedModule(shellCss()));
	});

	it('carries both faces as data URIs and the tokens for both themes, switched by the shim', () => {
		expect(THUMB_SHELL_CSS.match(/@font-face/g)).toHaveLength(2);
		expect(THUMB_SHELL_CSS).toContain("font-family:'Rajdhani'");
		expect(THUMB_SHELL_CSS).toContain("font-family:'Share Tech Mono'");
		expect(THUMB_SHELL_CSS).not.toMatch(/url\((?!data:)/);
		expect(THUMB_SHELL_CSS).toContain(':root[data-idea-scheme="light"]{color-scheme:light;');
		expect(THUMB_SHELL_CSS).toContain(':root,:root[data-idea-scheme="dark"]{color-scheme:dark;');
		expect(THUMB_SHELL_CSS).not.toContain('data-theme');
		expect(THUMB_SHELL_CSS).toMatch(/--accent:/);
	});

	it('is in every thumbnail document, ahead of the template', () => {
		const doc = thumbnailDocument('<div class="t">Gear ratios</div>', { interactive: false });
		const at = doc.indexOf('@font-face');
		expect(at).toBeGreaterThan(0);
		expect(at).toBeLessThan(doc.indexOf('<div class="t">'));
		expect(doc).toContain('body{font-family:var(--font-display)}');
	});
});
