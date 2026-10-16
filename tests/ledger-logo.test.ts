// The Ledger's mark is the site's mark (ledger 0392, report cead7265). The
// lockup is the REAL AnimatedLogo rendered on the server, so its markup cannot
// drift; the layout rules restated for a raw HTML page are checked against the
// component's own stylesheet here, number by number.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const COMPONENT = readFileSync(new URL('../src/lib/brand/AnimatedLogo.svelte', import.meta.url), 'utf8');
const LEDGER = readFileSync(new URL('../src/lib/legacy/coins/index.html', import.meta.url), 'utf8');
const MODULE = readFileSync(new URL('../src/lib/server/ledger-logo.ts', import.meta.url), 'utf8');

describe('the Ledger logo', () => {
	test('the frozen file still carries the anchor the swap replaces (control: the swap has something to find)', () => {
		expect(LEDGER).toContain('<a class="logo" href="/">IDEA.</a>');
	});

	test('every geometry number the module restates is the component\'s own', () => {
		for (const n of ['2560 / 1204', 'top: -1.2%', 'width: 46.95%', 'transform-origin: 50% 50%', "data-theme='space-white'", 'prefers-reduced-motion: no-preference']) {
			expect(COMPONENT, n).toContain(n);
			expect(MODULE, n).toContain(n);
		}
	});

	test('the module renders the component, never a hand-typed copy of its markup', () => {
		expect(MODULE).toContain("import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte'");
		expect(MODULE).toContain('render(AnimatedLogo');
		expect(MODULE).not.toMatch(/<img/);
	});

	test('both Ledger routes inject it', () => {
		for (const route of ['../src/routes/coins/[...path]/+server.ts', '../src/routes/dev/coins/+server.ts']) {
			expect(readFileSync(new URL(route, import.meta.url), 'utf8'), route).toContain('injectLedgerLogo(');
		}
	});
});
