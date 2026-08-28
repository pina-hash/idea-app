// tests/vanguard-universal-rewrites.test.ts
//
// THE REWRITES EVERY VISITOR GETS ARE STRING/REGEX REPLACES AGAINST A RAW HTML
// IMPORT, AND EACH ONE SILENTLY NO-OPS IF ITS ANCHOR TEXT DRIFTS.
//
// This is the sibling of tests/vanguard-admin-gate.test.ts, and it exists
// because the two tables are applied at different times to different people.
// `_NON_ADMIN_STRIPS` runs inside `if (!isAdminUser)`; `_UNIVERSAL_REWRITES`
// runs for EVERYONE. None of its entries is a gate: one bolts a reader for
// three closure-scoped values onto the game, one points the game's own
// feedback composer away from a third-party Apps Script endpoint nobody reads
// and at `app_feedback`, which is the queue that gets read, and one corrects a
// comment in the build that says removals stay local (they do not, since the
// injection wraps `removeItem`). Put any of them in the strip table and an
// admin's copy keeps the old behaviour.
//
// WHY THE ASSERTIONS ARE NOT THE STRIP SUITE'S. A strip proves it fired by its
// anchor being GONE afterwards. A rewrite may APPEND -- `gameInfoReader` keeps
// the `const VERSION` line it hangs off -- so the anchor is still in the output
// and its presence proves nothing whatsoever. Each entry therefore names a
// `marker` its replacement introduces, and every entry is asserted FOUR ways:
//
//   1. its anchor matches the raw build EXACTLY ONCE, so the replace cannot
//      half-apply and cannot be aiming at something ambiguous;
//   2. its marker occurs ZERO times in the raw build -- the positive control,
//      without which (3) could pass on a marker that was always there and would
//      keep passing after the replace stopped firing entirely;
//   3. its marker reaches the served page EXACTLY ONCE, for an admin, a
//      non-admin AND a signed-out visitor, which is the actual claim: this table
//      is not gated on anybody;
//   4. no anchor is a global regex, so "exactly once" is a real claim.
//
// AND IT WALKS THE REAL TABLE, NOT A COPY. A rewrite added to the handler later
// is covered the moment it is added, rather than when somebody remembers to add
// a case here. Checking each entry independently and BY NAME is what keeps one
// dead anchor from hiding behind the others still working.

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { vanguardHtml } from '../src/lib/legacy';

const { GET, _UNIVERSAL_REWRITES, _rewriteForEveryone } = await import(
	'../src/routes/vanguard/+server'
);

/**
 * Occurrences of `find` in `html`. Written here rather than imported so the
 * count is arrived at independently of the code under test.
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

/** Exactly the calls the handler makes for a signed-in caller. */
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

/** The signed-out serve: no claims at all, so no table is read. */
async function serveSignedOut(): Promise<string> {
	const res = await GET({
		locals: {
			supabase: {
				from: () => {
					throw new Error('a signed-out serve must read no table');
				}
			},
			claims: null
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any);
	expect(res.status).toBe(200);
	return res.text();
}

describe('the universal rewrite table is uniquely anchored in the current build', () => {
	// A sweep that generated no cases passes vacuously, so the count is pinned.
	it('has the three rewrites, each with a distinct name', () => {
		expect(_UNIVERSAL_REWRITES).toHaveLength(3);
		const names = _UNIVERSAL_REWRITES.map((r) => r.name);
		expect(new Set(names).size).toBe(names.length);
		expect(names).toEqual(['gameInfoReader', 'composerSend', 'removalWrappedNote']);
	});

	it('every anchor matches the build EXACTLY ONCE', () => {
		for (const rw of _UNIVERSAL_REWRITES) {
			expect(
				countMatches(vanguardHtml, rw.find),
				`${rw.name}: anchor must match the build exactly once`
			).toBe(1);
		}
	});

	// THE POSITIVE CONTROL. Without it, a marker that was already in the file
	// would make every "reaches the page" assertion below pass on a rewrite that
	// never fired at all.
	it('no marker exists in the raw build, so finding one proves the rewrite fired', () => {
		for (const rw of _UNIVERSAL_REWRITES) {
			expect(
				countMatches(vanguardHtml, rw.marker),
				`${rw.name}: marker must be absent from the raw build`
			).toBe(0);
		}
	});

	it('every marker appears exactly once after the rewrite', () => {
		const rewritten = _rewriteForEveryone(vanguardHtml);
		for (const rw of _UNIVERSAL_REWRITES) {
			expect(
				countMatches(rewritten, rw.marker),
				`${rw.name}: marker missing (the replace did not fire)`
			).toBe(1);
		}
	});

	it('no regex anchor is global, so "exactly once" is a real claim', () => {
		for (const rw of _UNIVERSAL_REWRITES) {
			if (rw.find instanceof RegExp) {
				expect(rw.find.flags, `${rw.name}: anchor must not be a global regex`).not.toContain('g');
			}
		}
	});
});

describe('the rewrites are ungated: everyone gets them', () => {
	// The whole reason this is a second table. A student, an admin and a visitor
	// with no session must all receive every marker exactly once.
	it('every marker reaches an admin, a non-admin and a signed-out visitor', async () => {
		const copies: [string, string][] = [
			['admin', await serveAs(true)],
			['non-admin', await serveAs(false)],
			['signed-out', await serveSignedOut()]
		];
		for (const [who, html] of copies) {
			for (const rw of _UNIVERSAL_REWRITES) {
				expect(countMatches(html, rw.marker), `${rw.name} missing from the ${who} copy`).toBe(1);
			}
		}
	});
});

describe('the in-game composer no longer files to Apps Script', () => {
	// The defect, stated as the thing that must be absent. `action=feedback` was
	// an <img> GET at VANGUARD's own Apps Script backend, which nobody reads and
	// which cannot report a failure, so a student got the same silent "THANKS!"
	// whether the message landed or vanished.
	it('no serve carries an action=feedback beacon, for any role', async () => {
		expect(countMatches(vanguardHtml, 'action=feedback')).toBe(1); // positive control
		for (const html of [await serveAs(true), await serveAs(false), await serveSignedOut()]) {
			expect(html).not.toContain('action=feedback');
		}
	});

	// THE OPTIMISTIC BLOCK GOES WITH IT. These three lines sat OUTSIDE the
	// `if(API_URL)` guard and ran unconditionally: the box was cleared and the
	// button painted THANKS! before anything could possibly have been confirmed.
	// Redirecting the request and leaving these behind would have reproduced the
	// exact defect one layer in, so their absence is asserted separately.
	it('does not clear the box or say THANKS! before an answer', async () => {
		for (const html of [await serveAs(true), await serveAs(false), await serveSignedOut()]) {
			expect(html).not.toContain("ta.value=''; cnt.textContent='0 / 500'; grow();");
			expect(html).not.toContain("btn.textContent='THANKS!'; btn.disabled=true;");
		}
	});

	// THIS IS A REDIRECT OF ONE CALL, NOT A REMOVAL OF AN ENDPOINT. API_URL also
	// carries the leaderboard and the run telemetry; removing it would take those
	// with it, silently.
	it('leaves API_URL and its telemetry and leaderboard calls alone', async () => {
		for (const html of [await serveAs(true), await serveAs(false), await serveSignedOut()]) {
			expect(html).toContain("const API_URL='https://script.google.com/macros/s/");
			expect(html).toContain('telemetryFieldList(dc,gameMode)');
			expect(html).toContain("action=submit&name=");
			expect(html).toContain("action=top&mode=");
		}
	});
});

describe('the injected bootstrap is syntactically whole', () => {
	// THE HOOK LIVES INSIDE A TEMPLATE LITERAL, AND A TEMPLATE LITERAL HIDES A
	// SYNTAX ERROR UNTIL A BROWSER RUNS IT. Nothing in the TypeScript build looks
	// inside that string: an unbalanced brace, a stray backtick or a bad escape
	// compiles, deploys, serves 200, and takes the whole bootstrap down at parse
	// time in front of a class -- which means no cloud save, no nav, no report
	// panel and no redirected composer, all at once and with nothing on screen
	// saying why. Parsing what actually reaches the page is the cheapest guard
	// against that, and it is a guard the strip table never needed because a
	// strip only ever REMOVES bytes.
	//
	// It PARSES and never runs: `new Function` compiles the body and returns,
	// so nothing here touches a DOM that does not exist.
	it('parses as JavaScript, and carries the hook when it does', async () => {
		for (const html of [await serveAs(true), await serveAs(false), await serveSignedOut()]) {
			const start = html.indexOf('<script>\n(function () {');
			expect(start).toBeGreaterThan(-1);
			const src = html.slice(start + '<script>'.length, html.indexOf('</script>', start));
			// The positive control: a parse assertion over an empty string passes.
			expect(src).toContain('window.__ideaVanguardReport = function');
			expect(() => new Function(src)).not.toThrow();
		}
	});
});

describe('the redirected send reaches the same endpoint the panel resolved', () => {
	// The endpoint decision is made ONCE, server-side, into FB.endpoint. The hook
	// must read that and not resolve it a second time -- two spellings of "signed
	// in or not" is the pair that stops agreeing.
	it('the hook posts to FB.endpoint and nowhere else', async () => {
		const html = await serveAs(false);
		const hook = html.slice(html.indexOf('window.__ideaVanguardReport = function'));
		const body = hook.slice(0, hook.indexOf('function buildNav'));
		expect(body).toContain('fetch(FB.endpoint');
		// No second endpoint decision, and no second literal route.
		expect(body).not.toContain('/api/vanguard-feedback');
		expect(body).not.toContain('/api/feedback');
		expect(body).not.toContain('SIGNED_IN');
	});

	it('the signed-in serve resolves the authenticated route, the signed-out one the anonymous route', async () => {
		expect(await serveAs(false)).toContain('"endpoint":"/api/vanguard-feedback"');
		expect(await serveSignedOut()).toContain('"endpoint":"/api/feedback"');
	});

	// A failure has to be sayable. The old path could not report one at all.
	it('can report a failure, and keeps the writing when it does', async () => {
		const html = await serveAs(false);
		expect(html).toContain('That did not send. Check your connection, then press SEND again.');
		expect(html).toContain(
			'That did not send. Your message is still here, press SEND to try again.'
		);
		// The refusal vocabulary is the shared one, not a second copy.
		expect(html).toContain('reason ? fbWords(reason)');
		// The box is cleared only on a confirmed landing.
		expect(html).toContain("if (ok && ta) { ta.value = '';");
	});
});

describe('a report from the composer is not a second-class row', () => {
	it('captures through the same fbMeta the panel uses, and says which control it was', async () => {
		const html = await serveAs(false);
		expect(html).toContain("fbMeta('in-game-composer')");
		expect(html).toContain("fbMeta('report-panel')");
		// `surface` is projected by fbMeta itself, so neither caller can forget it.
		expect(html).toContain('surface: surface,');
	});

	// The one field the composer knows and the panel cannot. There is no column
	// for it; `meta` is the free-form context blob and is where it goes.
	it('carries the leaderboard initials in meta, and invents no column for them', async () => {
		const html = await serveAs(false);
		expect(html).toContain('meta.initials = initials');
		// The payload's top level is the shape both feedback routes read. An
		// `initials` key there would be dropped on the floor by both.
		const hook = html.slice(html.indexOf('window.__ideaVanguardReport = function'));
		const payload = hook.slice(hook.indexOf('body: JSON.stringify({'), hook.indexOf('}).then('));
		expect(payload).toContain("app: 'vanguard'");
		expect(payload).toContain("context: '/vanguard'");
		expect(payload).toContain('meta: meta');
		expect(payload).not.toContain('initials');
	});

	// The composer is deliberately one channel with no dropdown, so nobody chose
	// a kind. 'other' is the catch-all; guessing 'bug' would put a made-up
	// answer in a filterable column.
	it('files as the catch-all kind rather than guessing one', async () => {
		const html = await serveAs(false);
		const hook = html.slice(html.indexOf('window.__ideaVanguardReport = function'));
		expect(hook.slice(0, hook.indexOf('}).then('))).toContain("kind: 'other'");
	});
});
