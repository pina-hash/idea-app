// tests/foundry-room-layout.test.ts
//
// THE FOUNDRY PAGES USE THE WINDOW, AND THE REVIEW LANE IS TWO PAGES (ledger
// 0360, reports 162057f0, 94e312c4 and 647d1201).
//
// THE GEOMETRY IS `npm run verify:browser`'s (`tools/browser-verify/routes/
// foundry-room*.mjs` measures the list pane, the mosaic, the queue's height
// and the author page's reach). What is pinned here is the wiring a refactor
// could quietly undo with every page still rendering: the one explicit width
// that ends the shrink-to-fit, the room's measure, which pages mount the shared
// wrapper, the roster's move off the full-height page, and the hoisted gate.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { load as reviewLayoutLoad } from '../src/routes/foundry/review/+layout.server';
import { load as publishersLoad } from '../src/routes/foundry/review/publishers/+page.server';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** The body of the first rule whose selector is exactly `selector`. */
function ruleBody(css: string, selector: string): string {
	const at = css.indexOf(`${selector} {`);
	if (at < 0) return '';
	const open = css.indexOf('{', at);
	return css.slice(open + 1, css.indexOf('}', open));
}

describe('the shrink-to-fit gallery cannot come back by accident', () => {
	it('gives the shared page wrapper an explicit full width', () => {
		const src = read('src/lib/foundry/FoundryPage.svelte');
		expect(ruleBody(src, '\t.fdy-page')).toMatch(/\bwidth:\s*100%/);
	});

	it('points the room measure at the window, on the room itself', () => {
		const css = read('src/lib/foundry/forge.css');
		expect(ruleBody(css, '.fg-root')).toMatch(/--measure-split:\s*var\(--measure-console/);
	});

	it('mounts the wrapper on the gallery and the queue, each as a split page', () => {
		for (const f of ['src/routes/foundry/+page.svelte', 'src/routes/foundry/review/+page.svelte']) {
			const src = read(f);
			expect(src, f).toContain("import FoundryPage from '$lib/foundry/FoundryPage.svelte'");
			expect(src, f).toMatch(/<FoundryPage[^>]*\bsplit\b/);
			// The two copied page blocks that each carried the defect are gone.
			expect(src, f).not.toMatch(/\.fdy-(rev-)?page\s*\{/);
		}
	});
});

describe('the review lane is two pages', () => {
	it('mounts no roster on the full-height queue page, and the roster on the publishers page', () => {
		const queue = read('src/routes/foundry/review/+page.svelte');
		const people = read('src/routes/foundry/review/publishers/+page.svelte');
		expect(queue).not.toContain('FoundryTrustRoster');
		expect(people).toContain('<FoundryTrustRoster');
		expect(people).toContain('<FoundryPublisherApplications');
		expect(people).toContain('<FoundryPublisherQuestions');
		// The queue's load stopped reading the roster it no longer renders.
		expect(read('src/routes/foundry/review/+page.server.ts')).not.toContain('foundry_trusted_roster');
	});

	const client = (admin: boolean) => ({
		rpc: async (fn: string) => {
			if (fn === 'is_admin') return { data: admin, error: null };
			if (fn === 'foundry_publisher_applications') return { data: [], error: null };
			if (fn === 'foundry_publisher_questions_admin') return { data: [], error: null };
			if (fn === 'foundry_trusted_roster') return { data: [], error: null };
			return { data: null, error: { code: 'PGRST202' } };
		}
	});

	async function status(fn: () => Promise<unknown>): Promise<number | 'ok'> {
		try {
			await fn();
			return 'ok';
		} catch (e) {
			return (e as { status?: number }).status ?? -1;
		}
	}

	it('hoists the admin gate to the area: 404 for a student and for nobody, through for an admin', async () => {
		const ev = (admin: boolean, signedIn = true) =>
			({ locals: { claims: signedIn ? { sub: 'u' } : null, supabase: client(admin) } }) as never;
		expect(await status(() => reviewLayoutLoad(ev(false)) as Promise<unknown>)).toBe(404);
		expect(await status(() => reviewLayoutLoad(ev(false, false)) as Promise<unknown>)).toBe(404);
		expect(await status(() => reviewLayoutLoad(ev(true)) as Promise<unknown>)).toBe('ok');
	});

	it('keeps the publishers page own check as defence in depth', async () => {
		const ev = (admin: boolean) =>
			({ locals: { claims: { sub: 'u' }, supabase: client(admin) } }) as never;
		expect(await status(() => publishersLoad(ev(false)) as Promise<unknown>)).toBe(404);
		const ok = (await publishersLoad(ev(true))) as Record<string, unknown>;
		expect(ok.pending).toEqual({ state: 'ready', value: [] });
		expect(ok.trusted).toEqual([]);
	});

	it('degrades a database without 0230 to "not on yet", never a broken page', async () => {
		const old = {
			rpc: async (fn: string) =>
				fn === 'is_admin'
					? { data: true, error: null }
					: fn === 'foundry_trusted_roster'
						? { data: [], error: null }
						: { data: null, error: { code: 'PGRST202' } }
		};
		const out = (await publishersLoad({ locals: { claims: { sub: 'u' }, supabase: old } } as never)) as Record<string, unknown>;
		expect(out.pending).toEqual({ state: 'unavailable' });
		expect(out.questions).toEqual({ state: 'unavailable' });
		expect(out.pendingApplications).toBeNull();
	});
});
