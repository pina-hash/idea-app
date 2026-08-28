// tests/vanguard-admin-gate.test.ts
//
// THE NON-ADMIN GATE IS A SET OF STRING/REGEX REPLACES AGAINST A RAW HTML
// IMPORT, AND EACH ONE SILENTLY NO-OPS IF ITS ANCHOR TEXT DRIFTS.
//
// src/routes/vanguard/+server.ts strips DEV and TUNE from a student's copy of
// the game by string/regex .replace() against src/lib/legacy/vanguard/index.html.
// `String.prototype.replace` and `RegExp.prototype.replace` do not throw and do
// not report a miss -- an anchor that has drifted (a rename, a formatting pass,
// an upstream edit to the legacy file) makes the call a no-op, and the handler
// still returns 200 with a page that, unmodified, ships DEV and TUNE straight to
// a student. A gate that can silently stop applying is worse than no gate,
// because nobody looks again.
//
// THIS DRIVES THE REAL GET HANDLER AGAINST THE REAL FILE ON DISK, and asserts on
// what actually reaches the response body -- never on whether index.html still
// contains the anchor literal. A check against the source file only proves the
// fixture hasn't drifted; it says nothing about whether the transform ran, and
// would keep passing the moment a replace silently stopped matching.
//
// AND IT WALKS THE REAL TABLE, NOT A COPY OF IT. `_NON_ADMIN_STRIPS` is the
// shipped list; the sweep below imports it, so a strip added to the handler
// later is covered the moment it is added rather than when somebody remembers
// to add a case here. Every gated replace is asserted THREE ways: its anchor
// occurs EXACTLY ONCE in the build (so the replace cannot half-apply and cannot
// be aiming at something ambiguous), it is ABSENT from the stripped output, and
// it SURVIVES for an admin. Checking each replace independently and by name is
// what keeps one dead anchor from hiding behind the others still working: a
// single missed replace fails exactly the assertion naming it, not a combined
// "the page looks safe" bit that four-out-of-five passing would satisfy.

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { vanguardHtml } from '../src/lib/legacy';

const { GET, _NON_ADMIN_STRIPS, _stripForNonAdmin } = await import(
	'../src/routes/vanguard/+server'
);

/**
 * The functional tune query-param check, not the two nearby comments that
 * also mention "tune=1" in prose and survive the gate untouched (they explain
 * the game's own mode entry, not the check itself). A probe as loose as
 * /tune=1/ matches those comments too and would report the hook present on
 * every non-admin serve regardless of whether the replace actually fired.
 */
const TUNE_QUERY_HOOK = "tune=1\\b/.test(location.search)";

/**
 * Occurrences of a strip's anchor in `html`. Written here rather than imported
 * so the count is arrived at independently of the code under test; the
 * exactly-once assertion below doubles as its positive control, since a helper
 * that always answered 0 would fail there before it could make the
 * absent-from-output assertion pass vacuously.
 */
function countMatches(html: string, find: string | RegExp): number {
	if (typeof find === 'string') {
		let n = 0;
		let i = html.indexOf(find);
		while (i !== -1) {
			n++;
			i = html.indexOf(find, i + find.length);
		}
		return n;
	}
	const flags = find.flags.includes('g') ? find.flags : find.flags + 'g';
	return [...html.matchAll(new RegExp(find.source, flags))].length;
}

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
	expect(vanguardHtml).toContain("id='devPanel'");
}

describe('the strip table is uniquely anchored in the current build', () => {
	// A sweep that generated no cases passes vacuously, so the count is pinned.
	// Raising it is the deliberate act of adding a gate; lowering it is the
	// deliberate act of removing one.
	it('has the five gated strips, each with a distinct name', () => {
		expect(_NON_ADMIN_STRIPS).toHaveLength(5);
		const names = _NON_ADMIN_STRIPS.map((s) => s.name);
		expect(new Set(names).size).toBe(names.length);
		expect(names).toEqual([
			'modeAllowlist',
			'tuneQueryHook',
			'devModeButton',
			'tunePanel',
			'devConsole'
		]);
	});

	it('every anchor matches the build EXACTLY ONCE', () => {
		for (const strip of _NON_ADMIN_STRIPS) {
			expect(
				countMatches(vanguardHtml, strip.find),
				`${strip.name}: anchor must match the build exactly once`
			).toBe(1);
		}
	});

	it('no anchor survives the strip', () => {
		const stripped = _stripForNonAdmin(vanguardHtml);
		for (const strip of _NON_ADMIN_STRIPS) {
			expect(
				countMatches(stripped, strip.find),
				`${strip.name}: anchor survived the strip (the replace did not fire)`
			).toBe(0);
		}
	});

	it('no regex anchor is global, so "exactly once" is a real claim', () => {
		for (const strip of _NON_ADMIN_STRIPS) {
			if (strip.find instanceof RegExp) {
				expect(strip.find.flags, `${strip.name}: anchor must not be a global regex`).not.toContain(
					'g'
				);
			}
		}
	});

	it('the strip actually shortens the build', () => {
		const stripped = _stripForNonAdmin(vanguardHtml);
		expect(stripped.length).toBeLessThan(vanguardHtml.length);
	});
});

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

		// The console is a separate block from the TUNE panel and used to ship to
		// everyone, gated only by a runtime `gameMode==='dev'` test. These are its
		// three element ids plus the god-mode damage bypass it installs.
		it('has no DEV console', async () => {
			const html = await serveAs(false);
			expect(html).not.toContain("id='devPanel'");
			expect(html).not.toContain("id='devTab'");
			expect(html).not.toContain("id='devPerf'");
			// The DEFINITIONS go. The guarded call sites live outside the block
			// and correctly survive -- asserting the bare name would fail on those
			// and would be asserting the wrong thing.
			expect(html).not.toContain('window.__devSetGod=function');
			expect(html).not.toContain('window.__devDrawHitboxes=function');
		});

		// The other half of the same claim: removing the block strands nothing.
		// Each of these reads sits outside it, behind a guard, and must still be
		// in the page a student runs.
		it('keeps the guarded references that live outside the removed block', async () => {
			const html = await serveAs(false);
			expect(html).toContain('if(window.__devSetGod){ window.__devSetGod(false); }');
			expect(html).toContain('window.__devDrawHitboxes) window.__devDrawHitboxes();');
			expect(html).toContain('window.__devTime==null?1:window.__devTime');
		});

		it('changed the string at each gated anchor, individually and by name', async () => {
			const html = await serveAs(false);
			for (const strip of _NON_ADMIN_STRIPS) {
				expect(
					countMatches(html, strip.find),
					`${strip.name} did not change the served output`
				).toBe(0);
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

		it('still has the DEV console', async () => {
			const html = await serveAs(true);
			expect(html).toContain("id='devPanel'");
			expect(html).toContain("id='devTab'");
			expect(html).toContain("id='devPerf'");
		});

		// The positive control for every `not.toContain` above: each anchor is
		// present exactly once in what an admin receives, so the absences on the
		// student's copy are the strip firing and not the probe being wrong.
		it('receives every anchor, exactly once each', async () => {
			const html = await serveAs(true);
			for (const strip of _NON_ADMIN_STRIPS) {
				expect(countMatches(html, strip.find), `${strip.name} missing from the admin copy`).toBe(
					1
				);
			}
		});
	});

	describe('the two copies differ only as the table says', () => {
		it('the admin copy is strictly larger than the student copy', async () => {
			const [student, admin] = await Promise.all([serveAs(false), serveAs(true)]);
			expect(admin.length).toBeGreaterThan(student.length);
		});
	});
});

describe('dead portal globals stay deleted', () => {
	// Both were set on every load and read by nothing. __ideaIsTeacher published
	// the viewer's admin status into a global on a page that runs a student's
	// game; both consumers are resolved server-side now. __ideaGameInfo is NOT
	// one of these -- it has a live reader in the report box.
	it('neither __ideaIsTeacher nor __ideaSignedIn is injected, for either role', async () => {
		const [student, admin] = await Promise.all([serveAs(false), serveAs(true)]);
		for (const html of [student, admin]) {
			expect(html).not.toContain('__ideaIsTeacher');
			expect(html).not.toContain('__ideaSignedIn');
		}
	});

	it('__ideaGameInfo is still injected, with its reader', async () => {
		const html = await serveAs(false);
		expect(html).toContain('window.__ideaGameInfo=function()');
		expect(html).toContain('__ideaGameInfo === ');
	});
});
