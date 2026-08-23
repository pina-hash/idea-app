// tests/vanguard-admin-gate.test.ts
//
// THE NON-ADMIN GATE IS FIVE STRING/REGEX REPLACES AGAINST A RAW HTML IMPORT,
// AND EACH ONE SILENTLY NO-OPS IF ITS ANCHOR TEXT DRIFTS.
//
// src/routes/vanguard/+server.ts strips DEV and TUNE from a student's copy of
// the game by string/regex .replace() against src/lib/legacy/vanguard/index.html.
// `String.prototype.replace` and `RegExp.prototype.replace` do not throw and do
// not report a miss -- an anchor that has drifted (a rename, a formatting pass,
// an upstream edit to the legacy file) makes the call a no-op, and the handler
// still returns 200 with a page that, unmodified, ships DEV and TUNE straight to
// a student.
//
// THIS DRIVES THE REAL GET HANDLER AGAINST THE REAL FILE ON DISK, and asserts on
// what actually reaches the response body -- never on whether index.html still
// contains the anchor literal. A check against the source file only proves the
// fixture hasn't drifted; it says nothing about whether the transform ran, and
// would keep passing the moment a replace silently stopped matching.
//
// Each of the four gated replaces is asserted TWICE: once against the non-admin
// output (must have fired) and once against the admin output (must NOT have
// fired -- an admin serves the unmodified file). Checking both directions on
// each replace independently is what keeps one dead anchor from hiding behind
// the other three still working: a single missed replace fails exactly the
// pair naming it, not a single combined "the page looks safe" assertion that
// three-out-of-four passing would satisfy.

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { vanguardHtml } from '../src/lib/legacy';

const { GET } = await import('../src/routes/vanguard/+server');

/**
 * The functional tune query-param check, not the two nearby comments that
 * also mention "tune=1" in prose and survive the gate untouched (they explain
 * the game's own mode entry, not the check itself). A probe as loose as
 * /tune=1/ matches those comments too and would report the hook present on
 * every non-admin serve regardless of whether the replace actually fired.
 */
const TUNE_QUERY_HOOK = "tune=1\\b/.test(location.search)";

/**
 * A minimal stand-in for `locals.supabase`, covering exactly the calls the
 * handler makes when `claims` is present: the cloud save, the profile (for
 * display name/avatar/role), the run-state list, and the `is_admin()` RPC that
 * every privileged surface in this app gates on.
 */
function stubSupabase(opts: { isAdmin: boolean }): SupabaseClient {
	const maybeSingle = async (data: unknown) => ({ data, error: null });
	return {
		rpc: (fn: string) => {
			if (fn === 'is_admin') return Promise.resolve({ data: opts.isAdmin, error: null });
			throw new Error(`unexpected rpc: ${fn}`);
		},
		from: (table: string) => {
			if (table === 'vanguard_saves') {
				return { select: () => ({ eq: () => ({ maybeSingle: () => maybeSingle(null) }) }) };
			}
			if (table === 'profiles') {
				return {
					select: () => ({
						eq: () =>
							({
								maybeSingle: () =>
									maybeSingle({
										full_name: 'Test Student',
										display_name: null,
										avatar_url: null,
										role: opts.isAdmin ? 'teacher' : 'student'
									})
							}) as unknown
					})
				};
			}
			if (table === 'vanguard_run_state') {
				return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
			}
			throw new Error(`unexpected table: ${table}`);
		}
	} as unknown as SupabaseClient;
}

async function serveAs(isAdmin: boolean): Promise<string> {
	const res = await GET({
		locals: { supabase: stubSupabase({ isAdmin }), claims: { sub: 'u1', email: 'x@boscotech.net' } }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any);
	expect(res.status).toBe(200);
	return res.text();
}

/** The real file on disk still carries every anchor this suite exercises. Not
 *  the test itself -- a sanity precondition so a failure below is legible as
 *  "the transform didn't fire" rather than "the fixture already changed out
 *  from under this suite". */
function assertFixtureHasAnchors() {
	expect(vanguardHtml).toContain('data-m="dev"');
	expect(vanguardHtml).toMatch(/m!=='normal'&&m!=='hardcore'&&m!=='dev'&&m!=='tune'/);
	expect(vanguardHtml).toContain(TUNE_QUERY_HOOK);
	expect(vanguardHtml).toContain("id='tunePanel'");
}

describe('VANGUARD non-admin gate, driven through the real GET handler', () => {
	it('the fixture on disk still carries the anchors this suite exercises', () => {
		assertFixtureHasAnchors();
	});

	describe('a non-admin caller', () => {
		it('receives no DEV mode button', async () => {
			const html = await serveAs(false);
			expect(html).not.toContain('data-m="dev"');
		});

		it('has a mode allowlist admitting only normal and hardcore', async () => {
			const html = await serveAs(false);
			const clamp = html.match(/if\(m!=='normal'&&m!=='hardcore'([^)]*)\)\s*m='normal';/);
			expect(clamp).not.toBeNull();
			// The captured group is whatever extra `&&m!=='...'` clauses remain. A
			// live 'dev' or 'tune' clause here is exactly the bug this suite exists
			// to catch: the button gone but the value still admitted.
			expect(clamp![1]).toBe('');
		});

		it('has no tune query-param hook', async () => {
			const html = await serveAs(false);
			expect(html).not.toContain(TUNE_QUERY_HOOK);
		});

		it('has no TUNE balancing panel', async () => {
			const html = await serveAs(false);
			expect(html).not.toContain("id='tunePanel'");
			expect(html).not.toContain("id='tuneTab'");
			expect(html).not.toContain("id='teachTuneBtn'");
		});

		it('changed the string at each of the four gated anchors, individually', async () => {
			const html = await serveAs(false);
			// Named per-anchor so a single dead one is identified by name rather
			// than folded into one pass/fail bit.
			const perAnchor: Record<string, boolean> = {
				devButtonRemoved: !html.includes('data-m="dev"'),
				modeAllowlistNarrowed: !/m!=='normal'&&m!=='hardcore'&&m!=='dev'/.test(html),
				tuneQueryHookRemoved: !html.includes(TUNE_QUERY_HOOK),
				tunePanelRemoved: !html.includes("id='tunePanel'")
			};
			for (const [name, changed] of Object.entries(perAnchor)) {
				expect(changed, `${name} did not change the served output`).toBe(true);
			}
		});
	});

	describe('an admin caller', () => {
		it('still receives the DEV mode button', async () => {
			const html = await serveAs(true);
			expect(html).toContain('data-m="dev"');
		});

		it('still has a mode allowlist admitting dev and tune', async () => {
			const html = await serveAs(true);
			const clamp = html.match(/if\(m!=='normal'&&m!=='hardcore'([^)]*)\)\s*m='normal';/);
			expect(clamp).not.toBeNull();
			expect(clamp![1]).toContain("m!=='dev'");
			expect(clamp![1]).toContain("m!=='tune'");
		});

		it('still has the tune query-param hook', async () => {
			const html = await serveAs(true);
			expect(html).toContain(TUNE_QUERY_HOOK);
		});

		it('still has the TUNE balancing panel', async () => {
			const html = await serveAs(true);
			expect(html).toContain("id='tunePanel'");
			expect(html).toContain("id='tuneTab'");
			expect(html).toContain("id='teachTuneBtn'");
		});
	});
});
