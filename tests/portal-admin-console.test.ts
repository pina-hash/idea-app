/**
 * THE ADMIN CONSOLE IS ONE APP, AND ITS ORDER IS THE ADMIN'S OWN (ledger 0117,
 * reports 24 and 26). What is pinned here is the part that fails SILENTLY:
 *
 *  - the launcher registry carrying a second admin door again (a card nobody
 *    notices is a card that quietly re-splits the app);
 *  - `/admin` answering something other than 404 to a non-admin, which would
 *    confirm the route to a probe;
 *  - a stored preference putting the console in a state no branch renders
 *    (an unknown sort, a usage entry with no count), which the read must DROP;
 *  - the "most used" order silently being a second copy of the launcher's
 *    rule rather than the same function.
 *
 * The geometry (full window, 44px, column counts) is the harness's business
 * and is measured in `tools/browser-verify/routes/portal-admin*.mjs`.
 */
import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { PORTAL_APPS, rankByUse, visibleApps } from '$lib/portal-apps';
import {
	CONSOLE_PANELS,
	mergeConsolePrefs,
	orderPanels,
	readConsolePrefs,
	recordConsoleUse
} from '../src/routes/dashboard/console';
import Console from '../src/routes/dashboard/+page.svelte';

describe('one admin card in the launcher', () => {
	it('exactly one admin-only card points at the console, and none at /admin', () => {
		const admin = PORTAL_APPS.filter((a) => a.adminOnly);
		expect(admin.map((a) => a.id)).toContain('dashboard');
		expect(admin.filter((a) => a.href === '/dashboard')).toHaveLength(1);
		expect(PORTAL_APPS.some((a) => a.id === 'admin' || a.href === '/admin')).toBe(false);
		// Coin Desk keeps its own card: it is a tool with a room of its own.
		expect(admin.map((a) => a.id).sort()).toEqual(['coin-desk', 'dashboard']);
	});

	it('an admin sees the console card once and a student never sees it (positive and negative)', () => {
		expect(visibleApps(true).filter((a) => a.id === 'dashboard')).toHaveLength(1);
		expect(visibleApps(false).some((a) => a.id === 'dashboard')).toBe(false);
	});

	it('the launcher draws no mark for a retired `admin` id and its accent rule names only the survivor', () => {
		const src = readFileSync(new URL('../src/lib/AppLauncher.svelte', import.meta.url), 'utf8');
		expect(src).not.toMatch(/id === 'admin'/);
		expect(src).not.toMatch(/data-app='admin'\]/);
		expect(src).toMatch(/\.app-card\[data-app='dashboard'\]/);
	});
});

describe('/admin forwards an admin and 404s everyone else', () => {
	it('has no page component: every branch of its load ends in an error or a redirect', () => {
		expect(existsSync(new URL('../src/routes/admin/+page.svelte', import.meta.url))).toBe(false);
		expect(existsSync(new URL('../src/routes/admin/+page.server.ts', import.meta.url))).toBe(true);
	});

	it('404 with no session, 404 for a signed-in non-admin, 303 to the console for an admin', async () => {
		vi.doMock('$lib/server/admin', () => ({
			isAdmin: async (_s: unknown, sub: string) => sub === 'admin-user'
		}));
		const { load } = await import('../src/routes/admin/+page.server');
		const call = (claims: { sub: string } | null) =>
			(load as (e: unknown) => Promise<unknown>)({ locals: { supabase: {}, claims } });
		await expect(call(null)).rejects.toMatchObject({ status: 404 });
		await expect(call({ sub: 'student-user' })).rejects.toMatchObject({ status: 404 });
		await expect(call({ sub: 'admin-user' })).rejects.toMatchObject({
			status: 303,
			location: '/dashboard#panel-admins'
		});
		vi.doUnmock('$lib/server/admin');
	});
});

describe('the console preference read validates against its union', () => {
	it('reads a well-formed namespace and leaves its siblings alone on merge', () => {
		const stored = {
			homepage: { compact: true },
			dashboard: { sort: 'default', usage: { roster: { count: 3, last: '2026-10-01T00:00:00.000Z' } } }
		};
		const prefs = readConsolePrefs(stored);
		expect(prefs).toEqual({
			sort: 'default',
			usage: { roster: { count: 3, last: '2026-10-01T00:00:00.000Z' } }
		});
		const merged = mergeConsolePrefs(stored, { ...prefs, sort: 'used' });
		expect(merged.homepage).toEqual({ compact: true });
		expect((merged.dashboard as { sort: string }).sort).toBe('used');
	});

	it('DROPS an unknown sort and a malformed usage entry rather than coercing them', () => {
		const prefs = readConsolePrefs({
			dashboard: {
				sort: 'alphabetical',
				usage: {
					roster: { count: 2, last: '2026-10-01T00:00:00.000Z' },
					admins: { count: 'many', last: '2026-10-01T00:00:00.000Z' },
					links: { count: 0, last: '2026-10-01T00:00:00.000Z' },
					coin: { count: 1, last: 'yesterday' },
					feedback: null
				}
			}
		});
		expect(prefs.sort).toBeUndefined();
		expect(Object.keys(prefs.usage ?? {})).toEqual(['roster']);
	});

	it('answers {} for no preferences, a non-object, and a namespace that is not there', () => {
		expect(readConsolePrefs(null)).toEqual({});
		expect(readConsolePrefs('x')).toEqual({});
		expect(readConsolePrefs({ homepage: {} })).toEqual({});
	});

	it('recordConsoleUse increments and stamps, starting from nothing', () => {
		const at = new Date('2026-10-15T12:00:00Z');
		const once = recordConsoleUse({}, 'roster', at);
		expect(once.usage).toEqual({ roster: { count: 1, last: at.toISOString() } });
		const twice = recordConsoleUse(once, 'roster', new Date('2026-10-16T12:00:00Z'));
		expect(twice.usage?.roster.count).toBe(2);
		expect(twice.usage?.roster.last).toBe('2026-10-16T12:00:00.000Z');
	});
});

describe('most used first, ties in curated order, and it is the launcher\'s own rule', () => {
	const ids = (p: { id: string }[]) => p.map((x) => x.id);

	it('with nothing used, the order is the registry order (positive control)', () => {
		expect(ids(orderPanels(CONSOLE_PANELS, {}))).toEqual(ids(CONSOLE_PANELS));
		expect(ids(orderPanels(CONSOLE_PANELS, {}, 'default'))).toEqual(ids(CONSOLE_PANELS));
	});

	it('ranks by count and keeps the unused in curated order after them', () => {
		const prefs = readConsolePrefs({
			dashboard: {
				usage: {
					admins: { count: 5, last: '2026-10-01T00:00:00.000Z' },
					roster: { count: 9, last: '2026-10-02T00:00:00.000Z' },
					content: { count: 5, last: '2026-10-03T00:00:00.000Z' }
				}
			}
		});
		const got = ids(orderPanels(CONSOLE_PANELS, prefs));
		expect(got.slice(0, 3)).toEqual(['roster', 'admins', 'content']); // 9, then the two fives in curated order
		expect(got.slice(3)).toEqual(ids(CONSOLE_PANELS).filter((id) => !['roster', 'admins', 'content'].includes(id)));
	});

	it('is `rankByUse` from portal-apps, not a second spelling of it', () => {
		const usage = { links: { count: 2, last: '2026-10-01T00:00:00.000Z' } };
		expect(ids(orderPanels(CONSOLE_PANELS, { usage }))).toEqual(ids(rankByUse(CONSOLE_PANELS, usage)));
		const src = readFileSync(new URL('../src/routes/dashboard/console.ts', import.meta.url), 'utf8');
		expect(src).toMatch(/rankByUse\(/);
		expect(src).not.toMatch(/\.sort\(/); // no local comparator
	});

	it('`default` as the stored sort is honoured even with usage recorded', () => {
		const prefs = readConsolePrefs({
			dashboard: { sort: 'default', usage: { links: { count: 7, last: '2026-10-01T00:00:00.000Z' } } }
		});
		expect(ids(orderPanels(CONSOLE_PANELS, prefs))).toEqual(ids(CONSOLE_PANELS));
	});
});

describe('the rendered console', () => {
	function consoleData(extra: Record<string, unknown> = {}) {
		return {
			profile: { full_name: 'Teresa Vargas', email: 't@boscotech.edu', avatar_url: null, role: 'teacher' },
			email: 't@boscotech.edu',
			students: [],
			rosterReady: true,
			frcProgress: {},
			frcProgressReady: true,
			frcReviewQueue: [],
			frcReviewReady: true,
			greenlineDecalQueue: [],
			greenlineDecalReady: true,
			greenlinePending: { ready: true, tracks: 0, decals: 0, total: 0 },
			feedbackNewCount: 0,
			admins: [
				{ email: 'apina@boscotech.edu', is_owner: true, granted_by: null, granted_at: '2026-01-01T00:00:00Z', note: null },
				{ email: 't@boscotech.edu', is_owner: false, granted_by: 'apina@boscotech.edu', granted_at: '2026-02-01T00:00:00Z', note: null }
			],
			isOwner: false,
			myEmail: 't@boscotech.edu',
			notebookDrive: { connectReady: true, configured: true },
			claims: { sub: 'u1', email: 't@boscotech.edu' },
			userProfile: { id: 'u1', role: 'teacher', display_name: null, full_name: 'Teresa Vargas', avatar: null, avatar_url: null, pathway: null, section_id: null, preferences: {} },
			isAdmin: true,
			supabase: {},
			...extra
		};
	}
	const draw = (extra?: Record<string, unknown>) =>
		render(Console as never, { props: { data: consoleData(extra) as never } }).body;
	const panelOrder = (html: string) => [...html.matchAll(/data-panel="([a-z-]+)"/g)].map((m) => m[1]);

	it('renders every registered panel exactly once, in the registry order by default', () => {
		const html = draw();
		expect(panelOrder(html)).toEqual(CONSOLE_PANELS.map((p) => p.id));
		for (const p of CONSOLE_PANELS) expect(html.split(`id="panel-${p.id}"`).length - 1, p.id).toBe(1);
	});

	it('orders the panels by the stored usage, and the nav strip follows', () => {
		const html = draw({
			userProfile: {
				id: 'u1', role: 'teacher', display_name: null, full_name: 'T', avatar: null, avatar_url: null, pathway: null, section_id: null,
				preferences: { dashboard: { usage: { drive: { count: 4, last: '2026-10-01T00:00:00.000Z' }, links: { count: 2, last: '2026-10-01T00:00:00.000Z' } } } }
			}
		});
		const order = panelOrder(html);
		expect(order.slice(0, 2)).toEqual(['drive', 'links']);
		const chips = [...html.matchAll(/data-chip="([a-z-]+)"/g)].map((m) => m[1]);
		expect(chips).toEqual(order);
	});

	it('shows the owner controls only to the owner (both directions)', () => {
		expect(draw()).not.toContain('data-testid="admin-grant-form"');
		expect(draw({ isOwner: true })).toContain('data-testid="admin-grant-form"');
	});

	it('carries the old /admin content: coin links, short links, the Drive connection', () => {
		const html = draw();
		expect(html).toContain('href="/admin/links"');
		expect(html).toContain('href="/coin-desk/students"');
		expect(html).toContain('href="/admin/drive-connect"');
	});
});
