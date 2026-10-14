// Ledger 0380, report bb3ce4a0: the open profile menu is above `main` on every
// page. A stylesheet rule is invisible to type checks and to every database
// test, so the one thing worth pinning is that the rule exists and raises the
// header ABOVE main only while the panel is in it (a header raised for good
// would paint over a modal's scrim, because anything fixed inside `main` is
// trapped at z-index 1).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');

describe('an open profile menu outranks main', () => {
	const rule = css.match(/\.app-header:has\(\.pm-panel\),\s*header:has\(\.pm-panel\)\s*\{([^}]*)\}/);
	it('the rule exists and its z-index beats main\'s', () => {
		expect(rule, 'no :has(.pm-panel) rule').not.toBeNull();
		const z = Number(rule![1].match(/z-index:\s*(\d+)/)?.[1]);
		const mainZ = Number(css.match(/main,\s*\.app-header\s*\{[^}]*z-index:\s*(\d+)/)?.[1]);
		expect(mainZ).toBe(1);
		expect(z).toBeGreaterThan(mainZ);
	});
	it('and the base header stays at main\'s level when the menu is closed', () => {
		expect(css).toMatch(/main,\s*\.app-header\s*\{\s*position:\s*relative;\s*z-index:\s*1;/);
	});
});
