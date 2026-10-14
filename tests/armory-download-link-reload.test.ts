// tests/armory-download-link-reload.test.ts
//
// "GET THE WINDOWS APP" MUST REACH THE SERVER (Mr. Pina, 2026-10: "when I
// click get the windows app it downloads the wrong thing"). `/armory/get` is a
// `+server.ts` with no page, and SvelteKit's client router only knows PAGE
// routes, so a plain `<a href="/armory/get">` is matched to the page route
// `/armory/[project]` with `project = "get"`: the router fetches that page's
// data, gets a 404 and paints the error page, and the installer never starts.
// Nothing reports it: the link renders, type-checks and works when typed into
// the address bar. So every anchor in `src/` that names a `+server.ts`-only
// route under /armory must carry `data-sveltekit-reload` (or `download`, or
// `rel="external"`, which the router also leaves alone).
//
// The set of server-only routes is DERIVED from the route tree, so a download
// route added later is swept with no edit here; the planted anchors are the
// positive control that the sweep can see an offender at all.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const ROUTES = join(ROOT, 'src', 'routes');

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) walk(full, out);
		else out.push(full);
	}
	return out;
}

/** Route ids (`/armory/get`) whose directory has a `+server.ts` and no page. */
function serverOnlyRoutes(base: string): string[] {
	const dirs = new Map<string, Set<string>>();
	for (const f of walk(join(ROUTES, base))) {
		const dir = f.slice(0, f.lastIndexOf(sep));
		const set = dirs.get(dir) ?? new Set<string>();
		set.add(f.slice(f.lastIndexOf(sep) + 1));
		dirs.set(dir, set);
	}
	const ids: string[] = [];
	for (const [dir, files] of dirs) {
		if (files.has('+server.ts') && ![...files].some((n) => n.startsWith('+page.svelte'))) {
			ids.push('/' + relative(ROUTES, dir).split(sep).join('/'));
		}
	}
	return ids.sort();
}

/** The route as a pattern over an href's text: a param is a word or a `${...}`. */
function routePattern(id: string): RegExp {
	const body = id
		.split('/')
		.map((seg) => (/^\[.+\]$/.test(seg) ? '(?:\\$\\{[^}]*\\}|[^/"\'`\\s{}?#]+)' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
		.join('/');
	return new RegExp(`^${body}(?:[?#].*)?$`);
}

/** Every `<a ...>` opening tag in a Svelte source, with its href text. */
function anchors(source: string): { tag: string; href: string }[] {
	const out: { tag: string; href: string }[] = [];
	for (const m of source.matchAll(/<a\b(?:[^>{}]|\{(?:[^{}]|\{[^{}]*\})*\})*>/g)) {
		const tag = m[0];
		const h = tag.match(/\shref=(?:"([^"]*)"|'([^']*)'|\{\s*(?:`([^`]*)`|'([^']*)'|"([^"]*)")\s*\})/);
		if (!h) continue;
		out.push({ tag, href: h[1] ?? h[2] ?? h[3] ?? h[4] ?? h[5] ?? '' });
	}
	return out;
}

/** The anchors naming a server-only route that the client router would take. */
function offenders(source: string, patterns: RegExp[]): { tag: string; href: string }[] {
	return anchors(source).filter(
		(a) =>
			patterns.some((p) => p.test(a.href)) &&
			!/\sdata-sveltekit-reload(?:[\s>=]|$)/.test(a.tag) &&
			!/\sdownload(?:[\s>=]|$)/.test(a.tag) &&
			!/\srel=["'][^"']*\bexternal\b/.test(a.tag)
	);
}

function matching(source: string, patterns: RegExp[]): number {
	return anchors(source).filter((a) => patterns.some((p) => p.test(a.href))).length;
}

describe('links to a server-only Armory route bypass the client router', () => {
	const routes = serverOnlyRoutes('armory');
	const patterns = routes.map(routePattern);

	it('the route tree is read: /armory/get is one, and no page route is mistaken for one', () => {
		expect(routes).toContain('/armory/get');
		expect(routes).toContain('/armory/download/[file]');
		expect(routes).not.toContain('/armory/start');
		expect(routes).not.toContain('/armory/[project]');
	});

	it('the sweep sees an offender (positive control), and the attribute clears it', () => {
		const planted = [
			'<a class="btn secondary ar-btn" href="/armory/get">Get the Windows app</a>',
			'<a\n\tclass="btn"\n\thref="/armory/get?from=setup"\n>x</a>',
			'<a href={`/armory/${p.id}/file/${f.id}/version/${v}`}>Download</a>',
			'<a href={`/armory/download/${name}`}>Flash drive</a>'
		].join('\n');
		expect(offenders(planted, patterns)).toHaveLength(4);
		const fixed = planted.replace(/<a\b/g, '<a data-sveltekit-reload');
		expect(offenders(fixed, patterns)).toHaveLength(0);
		expect(matching(fixed, patterns)).toBe(4);
		// A page route under the same prefix is not swept.
		expect(offenders('<a href="/armory/start">Setup</a><a href={`/armory/${id}?view=files`}>x</a>', patterns)).toHaveLength(0);
	});

	it('no anchor in src/ sends a download through the client router', () => {
		const files = walk(join(ROOT, 'src')).filter((f) => f.endsWith('.svelte'));
		let seen = 0;
		const bad: string[] = [];
		for (const f of files) {
			const source = readFileSync(f, 'utf8');
			seen += matching(source, patterns);
			for (const a of offenders(source, patterns)) bad.push(`${relative(ROOT, f)}: ${a.tag}`);
		}
		expect(bad).toEqual([]);
		// The three "Get the Windows app" keys (two on /armory, one on setup)
		// are the anchors this exists for; fewer means the sweep stopped seeing them.
		expect(seen).toBeGreaterThanOrEqual(3);
	});
});
