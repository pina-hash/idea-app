// tests/link-preload-policy.test.ts
//
// A LINK HOVER NEVER RUNS A SERVER LOAD (ledger 0360, report R08).
//
// `src/app.html` shipped with the SvelteKit template's
// `data-sveltekit-preload-data="hover"`, never a decision: a pointer resting on
// any link for 20ms ran that route's whole server chain (hooks, the auth round
// trip, every layout and page load -- about 18 database calls for /classroom
// and 33 to 36 for an item page) through a one-slot preload cache that
// discards the previous entry and never aborts its fetch. Every row of the home
// feed, every launcher card and every class-stream row is a link, so moving a
// pointer across the page during class cost the database a page load per link.
//
// The policy now is: preload the DATA on tap (mousedown/touchstart, about 100ms
// before the click lands) and the CODE on hover (JS chunks only, no server).
// This file pins the body attributes and sweeps every component and the shell
// for a per-element override that would put a hover-shaped data preload back.
//
// It is a text sweep, deliberately: the regression is silent -- nothing on
// screen changes, only the database load does -- so it belongs in the suite.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const APP_HTML = join(ROOT, 'src', 'app.html');

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		const st = statSync(p);
		if (st.isDirectory()) walk(p, out);
		else if (/\.(svelte|html)$/.test(name)) out.push(p);
	}
	return out;
}

/** Every file that could carry a preload attribute on a link: components, pages, the shell. */
const FILES = walk(join(ROOT, 'src')).filter((p) => !p.includes(`${join('src', 'lib', 'legacy')}`));

const bodyTag = (html: string) => html.match(/<body\b[^>]*>/)?.[0] ?? '';

const attr = (name: string, value: string) => new RegExp(`${name}\\s*=\\s*["']${value}["']`, 'g');

function hits(re: RegExp): string[] {
	const found: string[] = [];
	for (const file of FILES) {
		const text = readFileSync(file, 'utf8');
		const m = text.match(re);
		if (m) for (const _ of m) found.push(relative(ROOT, file));
	}
	return found;
}

describe('the site link preload policy', () => {
	it('the sweep read the tree (a positive control on the file list)', () => {
		expect(FILES.length).toBeGreaterThan(100);
		expect(FILES.map((f) => relative(ROOT, f))).toContain(join('src', 'app.html'));
	});

	it('the <body> preloads data on TAP and code on HOVER', () => {
		const body = bodyTag(readFileSync(APP_HTML, 'utf8'));
		expect(body).not.toBe('');
		expect(body).toMatch(attr('data-sveltekit-preload-data', 'tap'));
		expect(body).toMatch(attr('data-sveltekit-preload-code', 'hover'));
		expect(body).not.toMatch(attr('data-sveltekit-preload-data', 'hover'));
	});

	it('no component, page or shell asks for a hover, eager or viewport DATA preload', () => {
		const bad = hits(attr('data-sveltekit-preload-data', '(?:hover|eager|viewport)'));
		expect(bad).toEqual([]);
	});

	it('the same sweep finds the tap attribute it is looking for (positive control: exactly one, in app.html)', () => {
		expect(hits(attr('data-sveltekit-preload-data', 'tap'))).toEqual([join('src', 'app.html')]);
	});
});
