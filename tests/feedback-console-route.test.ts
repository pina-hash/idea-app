// tests/feedback-console-route.test.ts
//
// THE FEEDBACK CONSOLE MOVED TO /admin/feedback (report R03, decision 42), and
// its old address forwards. Both halves are a privacy boundary as much as a
// routing change, which is why they are driven through the REAL loads:
//
//   * an admin reaches the console at the new address, and the old address
//     answers them a 307 to it;
//   * a signed-in non-admin gets a 404 at BOTH, and no Location header at
//     either -- a redirect answered to them would confirm the console exists;
//   * a caller with no session gets a 404 from both loads too (on a real
//     request `/classroom` sends them to `/` from hooks.server.ts first, the
//     same answer every classroom address gives);
//   * an `is_admin` that ERRORS fails closed, at both.
//
// The supabase client is a stub rather than a database because what is under
// test is the ROUTING and the gate's order: `is_admin` is the database's
// question and `isAdmin` is exercised against the real chain elsewhere. The
// stub throws on any read the loads are not expected to make, so a load that
// starts reading something new cannot pass by accident.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { load as consoleLoad } from '../src/routes/admin/feedback/+page.server';
import { load as legacyLoad } from '../src/routes/classroom/feedback/+page.server';
import { sitePlateInScope } from '../src/lib/shell/site-plate';
import { feedbackExclusion } from '../src/lib/feedback/context';

const ROOT = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), 'utf8');
const exists = (p: string) => existsSync(new URL(p, ROOT));

type Who = 'admin' | 'student' | 'broken' | null;

function stubSupabase(who: Who) {
	const reads: string[] = [];
	return {
		reads,
		rpc(fn: string) {
			reads.push(`rpc:${fn}`);
			if (fn === 'is_admin') {
				if (who === 'broken') {
					return Promise.resolve({ data: null, error: { code: '57014', message: 'timeout' } });
				}
				return Promise.resolve({ data: who === 'admin', error: null });
			}
			if (fn === 'app_feedback_admin_list') {
				if (who !== 'admin') throw new Error('the queue was read for a non-admin');
				return Promise.resolve({ data: [], error: null });
			}
			throw new Error(`unexpected rpc: ${fn}`);
		},
		from(table: string) {
			throw new Error(`unexpected table read: ${table}`);
		}
	};
}

type Outcome =
	| { kind: 'redirect'; status: number; location: string }
	| { kind: 'error'; status: number }
	| { kind: 'returned'; data: unknown };

async function drive(load: unknown, path: string, who: Who): Promise<{ outcome: Outcome; reads: string[] }> {
	const supabase = stubSupabase(who);
	const event = {
		url: new URL(`http://localhost${path}`),
		params: {},
		locals: {
			supabase,
			claims: who ? { sub: `uuid-${who}`, email: `${who}@boscotech.edu` } : null
		}
	};
	try {
		const data = await (load as (e: unknown) => Promise<unknown>)(event);
		return { outcome: { kind: 'returned', data }, reads: supabase.reads };
	} catch (e) {
		if (isRedirect(e)) return { outcome: { kind: 'redirect', status: e.status, location: e.location }, reads: supabase.reads };
		if (isHttpError(e)) return { outcome: { kind: 'error', status: e.status }, reads: supabase.reads };
		throw e;
	}
}

describe('the console at /admin/feedback', () => {
	it('an admin reaches it, and the queue is read', async () => {
		const { outcome, reads } = await drive(consoleLoad, '/admin/feedback', 'admin');
		expect(outcome.kind).toBe('returned');
		expect((outcome as { data: { ready: boolean; rows: unknown[] } }).data).toMatchObject({
			ready: true,
			rows: []
		});
		expect(reads).toEqual(['rpc:is_admin', 'rpc:app_feedback_admin_list']);
	});

	it('a signed-in non-admin gets a 404, and the queue is never read', async () => {
		const { outcome, reads } = await drive(consoleLoad, '/admin/feedback', 'student');
		expect(outcome).toEqual({ kind: 'error', status: 404 });
		expect(reads).toEqual(['rpc:is_admin']);
	});

	it('no session gets a 404 before anything is asked', async () => {
		const { outcome, reads } = await drive(consoleLoad, '/admin/feedback', null);
		expect(outcome).toEqual({ kind: 'error', status: 404 });
		expect(reads).toEqual([]);
	});

	it('an is_admin that errors fails closed', async () => {
		const { outcome } = await drive(consoleLoad, '/admin/feedback', 'broken');
		expect(outcome).toEqual({ kind: 'error', status: 404 });
	});
});

describe('the old address, /classroom/feedback', () => {
	it('answers an admin a 307 to the new address', async () => {
		const { outcome, reads } = await drive(legacyLoad, '/classroom/feedback', 'admin');
		expect(outcome).toEqual({ kind: 'redirect', status: 307, location: '/admin/feedback' });
		// The gate ran, and the redirect did no work the new page will redo.
		expect(reads).toEqual(['rpc:is_admin']);
	});

	it('answers a signed-in non-admin the SAME 404, with no Location', async () => {
		const { outcome } = await drive(legacyLoad, '/classroom/feedback', 'student');
		expect(outcome).toEqual({ kind: 'error', status: 404 });
	});

	it('answers no session a 404, and an erroring is_admin a 404', async () => {
		expect((await drive(legacyLoad, '/classroom/feedback', null)).outcome).toEqual({
			kind: 'error',
			status: 404
		});
		expect((await drive(legacyLoad, '/classroom/feedback', 'broken')).outcome).toEqual({
			kind: 'error',
			status: 404
		});
	});

	it('forwards to a real page, and keeps no page of its own that could render', () => {
		expect(exists('src/routes/admin/feedback/+page.svelte')).toBe(true);
		expect(exists('src/routes/admin/feedback/+page.server.ts')).toBe(true);
		expect(exists('src/routes/classroom/feedback/+page.server.ts')).toBe(true);
		expect(exists('src/routes/classroom/feedback/+page.svelte')).toBe(false);
	});
});

describe('the console is a site page now, not a classroom one', () => {
	it('takes the site plate and the root layout report control', () => {
		expect(sitePlateInScope('/admin/feedback')).toBe(true);
		// Positive control for the report-control half: a classroom route is
		// excluded (the classroom docks the control in its header), this is not.
		expect(feedbackExclusion('/classroom/[sectionId]')?.id).toBe('classroom');
		expect(feedbackExclusion('/admin/feedback')).toBeNull();
	});

	it('mounts the portal header, not the classroom shell', () => {
		const page = read('src/routes/admin/feedback/+page.svelte');
		expect(page).toContain('<ProfileMenu />');
		expect(page).toContain('class="app-header"');
		expect(page).not.toMatch(/ClassroomShell|cr-root/);
		// The undo window is the console's constant in production; only a
		// harness holds it open (report R02).
		expect(page).not.toContain('undoMs');
	});

	it('every link in the app names the new address, and none the old one', () => {
		const admin = read('src/lib/classroom/AdminConsole.svelte');
		const dashboard = read('src/routes/dashboard/+page.svelte');
		for (const src of [admin, dashboard]) {
			expect(src).toContain('href="/admin/feedback"');
			expect(src).not.toContain('href="/classroom/feedback"');
		}
	});
});
