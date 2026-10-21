// tests/foundry-html-cover.test.ts
//
// HTML COVERS (ledger 0422, feedback 1cc58a6e). The frame address, the policy
// a cover is served under, the route that serves it, and the card that frames
// it. What would fail SILENTLY is a cover that can reach something: a sandbox
// that grants same-origin, a policy that allows a network request, or the
// route answering on the host that holds the session. Each is asserted with
// its control.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import {
	FOUNDRY_COVER_SANDBOX,
	foundryCoverCsp,
	foundryCoverHtmlUrl,
	looksLikeHtmlCover
} from '../src/lib/foundry/html-cover';
import { foundryOverrideMap } from '../src/lib/foundry/gallery-extras';
import FoundryCard from '../src/lib/foundry/FoundryCard.svelte';
import { GET } from '../src/routes/c/[appId]/+server';

const APP = '0b7f5d1e-3c2a-4e7b-9a10-5d6e7f8a9b0c';
const APPS = 'https://apps.ideabosco.com';
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('the frame address', () => {
	it('is the apps origin, the app, and the revision; null without any of them', () => {
		expect(foundryCoverHtmlUrl(APPS, APP, 3)).toBe(`${APPS}/c/${APP}?v=3`);
		expect(foundryCoverHtmlUrl(`${APPS}/`, APP, 1)).toBe(`${APPS}/c/${APP}?v=1`);
		expect(foundryCoverHtmlUrl('', APP, 3)).toBeNull();
		expect(foundryCoverHtmlUrl(APPS, 'not-a-uuid', 3)).toBeNull();
		expect(foundryCoverHtmlUrl(APPS, APP, null)).toBeNull();
		expect(foundryCoverHtmlUrl(APPS, APP, 0)).toBeNull();
	});

	it('the gallery read carries the revision through, and nothing else becomes one', () => {
		const map = foundryOverrideMap([
			{ subject: `app:${APP}`, title: null, description: null, thumbnail_path: null, cover_html_rev: 4 },
			{ subject: 'app:x', title: 'T', description: null, thumbnail_path: null, cover_html_rev: 'html' },
			{ subject: 'app:y', title: 'T', description: null, thumbnail_path: null }
		]);
		expect(map[`app:${APP}`].cover_html_rev).toBe(4);
		expect(map['app:x'].cover_html_rev).toBeNull();
		expect(map['app:y'].cover_html_rev).toBeNull();
	});
});

describe('the policy a cover runs under', () => {
	const csp = foundryCoverCsp(APPS, '');
	it('scripts only, an opaque origin, and no network at all', () => {
		expect(FOUNDRY_COVER_SANDBOX).toBe('allow-scripts');
		expect(csp).toMatch(/(^|; )sandbox allow-scripts(;|$)/);
		expect(csp).not.toContain('allow-same-origin');
		for (const d of ["default-src 'none'", "connect-src 'none'", "frame-src 'none'", "worker-src 'none'", "form-action 'none'", "base-uri 'none'"]) {
			expect(csp, d).toContain(d);
		}
		// No fetch directive names a host it could reach (frame-ancestors names
		// who may frame it, not where it may go).
		const fetches = csp.split('; ').filter((d) => !d.startsWith('frame-ancestors'));
		expect(fetches.join('; ')).not.toMatch(/https?:|wss?:|\*/);
	});
	it('only the portal frames it when the origins are split; unset, no frame-ancestors (the bundle rule)', () => {
		expect(csp).toContain('frame-ancestors https://ideabosco.com');
		expect(foundryCoverCsp('', '')).not.toContain('frame-ancestors');
	});
	it('a file is HTML by its name or its first tag', () => {
		expect(looksLikeHtmlCover('c.html', 'x')).toBe(true);
		expect(looksLikeHtmlCover('c.txt', '<!doctype html><p>')).toBe(true);
		expect(looksLikeHtmlCover('c.txt', 'just words')).toBe(false);
	});
});

describe('the route', () => {
	const saved = process.env.PUBLIC_FOUNDRY_APPS_ORIGIN;
	beforeEach(() => {
		process.env.PUBLIC_FOUNDRY_APPS_ORIGIN = APPS;
	});
	afterEach(() => {
		if (saved === undefined) delete process.env.PUBLIC_FOUNDRY_APPS_ORIGIN;
		else process.env.PUBLIC_FOUNDRY_APPS_ORIGIN = saved;
	});
	const call = (origin: string, appId: string, answer: { data: unknown; error: unknown }) => {
		const asked: unknown[] = [];
		const event = {
			params: { appId },
			url: new URL(`${origin}/c/${appId}?v=1`),
			locals: { supabase: { rpc: async (name: string, args: unknown) => (asked.push([name, args]), answer) } }
		};
		return { res: (GET as unknown as (e: typeof event) => Promise<Response>)(event), asked };
	};

	it('on the apps origin it serves the document under the cover policy', async () => {
		const { res, asked } = call(APPS, APP, { data: '<!doctype html><p>spin</p>', error: null });
		const r = await res;
		expect(r.status).toBe(200);
		expect(r.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(r.headers.get('content-security-policy')).toContain('sandbox allow-scripts');
		expect(r.headers.get('content-security-policy')).toContain("connect-src 'none'");
		expect(r.headers.get('x-content-type-options')).toBe('nosniff');
		expect(await r.text()).toBe('<!doctype html><p>spin</p>');
		expect(asked).toEqual([['foundry_cover_html', { p_app: APP }]]);
	});

	it('on the session host, for a bad id, and for no cover it is the one bodyless 404 and reads nothing it need not', async () => {
		const main = call('https://ideabosco.com', APP, { data: '<p>x</p>', error: null });
		expect((await main.res).status).toBe(404);
		expect(main.asked).toEqual([]);
		const bad = call(APPS, 'nope', { data: '<p>x</p>', error: null });
		expect((await bad.res).status).toBe(404);
		expect(bad.asked).toEqual([]);
		for (const answer of [{ data: null, error: null }, { data: null, error: { code: 'PGRST202' } }]) {
			const r = await call(APPS, APP, answer).res;
			expect(r.status).toBe(404);
			expect(await r.text()).toBe('');
		}
	});
});

describe('the card frames it', () => {
	const app = { id: APP, slug: 'blade-run', title: 'Blade Run', cover_path: null, owner_display_name: 'Ana' } as never;
	it('with the cover sandbox, no referrer and out of the tab order; no frame without an address', () => {
		const withCover = render(FoundryCard, { props: { app, href: '/foundry?app=blade-run', htmlCover: `${APPS}/c/${APP}?v=2` } }).body;
		expect(withCover).toMatch(/<iframe[^>]*class="fdy-card-html[^"]*"/);
		expect(withCover).toContain('sandbox="allow-scripts"');
		expect(withCover).toContain('referrerpolicy="no-referrer"');
		expect(withCover).toContain('tabindex="-1"');
		expect(withCover).not.toContain('allow-same-origin');
		const without = render(FoundryCard, { props: { app, href: '/foundry?app=blade-run' } }).body;
		expect(without).not.toContain('<iframe');
	});

	it('the editor and the card use the one sandbox constant, never a typed copy', () => {
		for (const f of ['src/lib/foundry/FoundryCard.svelte', 'src/lib/foundry/FoundryCoverEditor.svelte']) {
			const src = read(f);
			expect(src, f).toContain('sandbox={FOUNDRY_COVER_SANDBOX}');
			expect(src, f).not.toMatch(/sandbox="/);
		}
	});
});
