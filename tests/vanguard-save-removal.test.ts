// tests/vanguard-save-removal.test.ts
//
// A DELETION THAT LOOKS LIKE IT WORKED AND DID NOT.
//
// The injected bootstrap wrapped `localStorage.setItem` and pushed every write
// to `/api/vanguard-save`. It wrapped neither `removeItem` nor `clear`, so a
// deletion changed the local copy and nothing else -- and because the seed
// merges the cloud save back INTO localStorage before the game reads it, the
// next load restored the value the student had just deleted. The game deletes
// `vanguard_ach_title` when a player unwears an earned title, so unwearing was
// silently undone on every reload, on the one device that had done it.
//
// TWO INDEPENDENT HALVES HAD TO MOVE, AND FIXING EITHER ALONE FIXES NOTHING:
//
//   1. THE SHAPE. `StoredSave.progression` is `Record<string, string>`: every
//      value is a present string, and the only other state is ABSENT. Absence
//      already means "this device has nothing to say about this key" -- which is
//      what stops a second device wiping the first one's progress -- so
//      `mergeProgression` keeps `a` on every branch where `b` is missing. The
//      stored shape could not express a deletion, so a wrapped `removeItem`
//      would have pushed a snapshot the merge handed straight back. `REMOVED` is
//      the reserved value that closes that.
//   2. THE TRIGGER. Nothing scheduled a push on a removal.
//
// WHAT THIS FILE CAN AND CANNOT PROVE. It cannot drive a signed-in browser, so
// it does not prove a removal reaches the server over the wire. It proves the
// three things that ARE provable here: the emitted bootstrap wraps the right
// method, against the right endpoint, and stays inert signed out; the merge
// applies a removal and keeps every other guarantee; and a sentinel can never be
// served back to a game as a value.

import { describe, expect, it } from 'vitest';
import { vanguardHtml } from '../src/lib/legacy';
import {
	REMOVED,
	mergeIntoStored,
	normalizeStored,
	splitSnapshot,
	type StoredSave
} from '../src/lib/vanguard-save';

const { GET } = await import('../src/routes/vanguard/+server');

const TS = '2026-08-28T00:00:00.000Z';

/** Occurrences of `find`, counted here so the count is independent of the code. */
function countMatches(html: string, find: string): number {
	let n = 0;
	let i = html.indexOf(find);
	while (i !== -1) {
		n++;
		i = html.indexOf(find, i + find.length);
	}
	return n;
}

/* ------------------------------------------------------------------ *
 * 1. THE SHAPE                                                        *
 * ------------------------------------------------------------------ */

describe('the stored shape can express a removal, and could not before', () => {
	// THE CHARACTERIZATION, and the reason the fix is not in the wrapper alone.
	// A snapshot with the key simply MISSING is what a wrapped removeItem would
	// have sent if the shape had had no way to say "gone". It must still be a
	// no-op, because that is also what a second device with nothing to say sends.
	it('an ABSENT key still means "nothing to contribute", never "delete"', () => {
		const stored = mergeIntoStored(
			null,
			{ vanguard_ach_title: 'first_boss', vanguard_games: '9' },
			'desktop',
			TS
		);
		expect(stored.progression.vanguard_ach_title).toBe('first_boss');

		const afterSilence = mergeIntoStored(stored, { vanguard_games: '9' }, 'desktop', TS);
		expect(afterSilence.progression.vanguard_ach_title).toBe('first_boss');
	});

	it('the sentinel deletes the key from progression', () => {
		const stored = mergeIntoStored(
			null,
			{ vanguard_ach_title: 'first_boss', vanguard_games: '9' },
			'desktop',
			TS
		);
		const after = mergeIntoStored(
			stored,
			{ vanguard_ach_title: REMOVED, vanguard_games: '9' },
			'desktop',
			TS
		);
		expect(after.progression).not.toHaveProperty('vanguard_ach_title');
		// The positive control: the rest of progression is untouched, so this is a
		// deletion of one key and not a blanked blob.
		expect(after.progression.vanguard_games).toBe('9');
	});

	it('never stores the sentinel as a value, in progression or in a pref bucket', () => {
		const after = mergeIntoStored(
			null,
			{ vanguard_ach_title: REMOVED, vanguard_sfx_lvl: REMOVED, vanguard_gfx: 'low' },
			'desktop',
			TS
		);
		const serialized = JSON.stringify(after);
		expect(serialized).not.toContain(REMOVED);
		expect(after.prefs.desktop?.vanguard_gfx).toBe('low');
	});

	// A REMOVAL IS AN EVENT, NOT A TOMBSTONE. Re-earning must be accepted: a
	// student who resets and then plays again writes a real value, and nothing
	// stored from the reset may refuse it.
	it('a value written after a removal is accepted normally', () => {
		let stored: StoredSave = mergeIntoStored(null, { vanguard_ach_title: 'first_boss' }, 'desktop', TS);
		stored = mergeIntoStored(stored, { vanguard_ach_title: REMOVED }, 'desktop', TS);
		expect(stored.progression).not.toHaveProperty('vanguard_ach_title');
		stored = mergeIntoStored(stored, { vanguard_ach_title: 'sector5' }, 'desktop', TS);
		expect(stored.progression.vanguard_ach_title).toBe('sector5');
	});

	// A PREFERENCE NEEDS NO EXPLICIT DELETE, because the bucket is REPLACED --
	// but only if the sentinel was routed out of `prefs` first. Left in, it would
	// be written back as the key's new value. This asserts the routing, via the
	// outcome a student sees.
	it('a removed preference leaves the device bucket, and the other class is untouched', () => {
		let stored = mergeIntoStored(null, { vanguard_sfx_lvl: '{"master":-6}' }, 'desktop', TS);
		stored = mergeIntoStored(stored, { vanguard_gfx: 'low' }, 'mobile', TS);
		expect(stored.prefs.desktop?.vanguard_sfx_lvl).toBe('{"master":-6}');

		const after = mergeIntoStored(stored, { vanguard_sfx_lvl: REMOVED }, 'desktop', TS);
		expect(after.prefs.desktop).not.toHaveProperty('vanguard_sfx_lvl');
		// Preferences are per device class by design: a desktop reset is not a
		// claim about the phone.
		expect(after.prefs.mobile?.vanguard_gfx).toBe('low');
	});

	// ORDERING. The migrated-pref fold runs BEFORE the merge and carries a stale
	// bucket copy of an achievement key into progression. If removals were
	// applied before that fold, unwearing a title would be undone by the fold on
	// the very same request.
	it('a removal outranks a stale pref-bucket copy of the same key', () => {
		const legacy = {
			v: 2,
			progression: { vanguard_ach_title: 'first_boss' },
			prefs: { desktop: { vanguard_ach_title: 'first_boss', _ts: TS } }
		};
		const after = mergeIntoStored(legacy, { vanguard_ach_title: REMOVED }, 'desktop', TS);
		expect(after.progression).not.toHaveProperty('vanguard_ach_title');
		expect(after.prefs.desktop).not.toHaveProperty('vanguard_ach_title');
	});

	// The device-local key is never synced in either direction, so a removal of
	// it is not the cloud save's business either.
	it('ignores a removal of a device-local key and of a non-vanguard key', () => {
		const split = splitSnapshot({
			vanguard_did: REMOVED,
			some_other_app_key: REMOVED,
			vanguard_ach_title: REMOVED
		});
		expect(split.removed).toEqual(['vanguard_ach_title']);
	});
});

describe('a sentinel can never be served back to a game as a value', () => {
	// FAIL-SAFE. `REMOVED` is a wire value with no meaning in the stored blob. A
	// copy that landed there anyway -- a browser posting to a serverless instance
	// still running the previous build during a rollout is the realistic window --
	// would otherwise come back through GET and be seeded into localStorage.
	it('normalizeStored strips it from progression and from both pref buckets', () => {
		const poisoned = {
			v: 2,
			progression: { vanguard_ach_title: REMOVED, vanguard_games: '4' },
			prefs: {
				desktop: { vanguard_gfx: REMOVED, vanguard_mute: '1' },
				mobile: { vanguard_gfx: 'low' }
			}
		};
		const clean = normalizeStored(poisoned);
		expect(clean.progression).not.toHaveProperty('vanguard_ach_title');
		expect(clean.prefs.desktop).not.toHaveProperty('vanguard_gfx');
		// Positive controls, so the assertions above cannot pass on an empty blob.
		expect(clean.progression.vanguard_games).toBe('4');
		expect(clean.prefs.desktop?.vanguard_mute).toBe('1');
		expect(clean.prefs.mobile?.vanguard_gfx).toBe('low');
	});

	// The sentinel is only safe because no game write can produce it. If a NUL
	// ever appears in the build this assumption needs re-deciding, so it is
	// pinned rather than assumed.
	it('the raw build contains no NUL byte, so no game write can spell the sentinel', () => {
		expect(REMOVED.charCodeAt(0)).toBe(0);
		expect(vanguardHtml.indexOf(String.fromCharCode(0))).toBe(-1);
	});
});

/* ------------------------------------------------------------------ *
 * 2. THE EMITTED BOOTSTRAP                                            *
 * ------------------------------------------------------------------ */

/** Exactly the calls the handler makes for a signed-in caller. */
function stubSupabase(): unknown {
	const maybeSingle = async (data: unknown) => ({ data, error: null });
	return {
		rpc: () => Promise.resolve({ data: false, error: null }),
		from: (table: string) => {
			if (table === 'vanguard_saves') {
				return { select: () => ({ eq: () => ({ maybeSingle: () => maybeSingle(null) }) }) };
			}
			if (table === 'profiles') {
				return {
					select: () => ({
						eq: () => ({
							maybeSingle: () =>
								maybeSingle({
									full_name: 'Test Student',
									display_name: null,
									avatar_url: null,
									role: 'student'
								})
						})
					})
				};
			}
			if (table === 'vanguard_run_state') {
				return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
			}
			throw new Error(`unexpected table: ${table}`);
		}
	};
}

async function serveSignedIn(): Promise<string> {
	const res = await GET({
		locals: { supabase: stubSupabase(), claims: { sub: 'u1', email: 'x@boscotech.net' } }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any);
	expect(res.status).toBe(200);
	return res.text();
}

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

/** The injected bootstrap, sliced out of the served page. */
function bootstrapOf(html: string): string {
	const start = html.indexOf('<script>\n(function () {');
	expect(start).toBeGreaterThan(-1);
	return html.slice(start + '<script>'.length, html.indexOf('</script>', start));
}

describe('the served bootstrap wraps removeItem', () => {
	it('installs the wrapper and captures the native method to call through to', async () => {
		const src = bootstrapOf(await serveSignedIn());
		expect(countMatches(src, 'localStorage.removeItem = function (key) {')).toBe(1);
		expect(countMatches(src, 'var nativeRemove = localStorage.removeItem.bind(localStorage);')).toBe(
			1
		);
		// The wrapper must delete for real before doing anything else, or a
		// "removal" that only schedules a push leaves the value on the device.
		expect(src).toContain('nativeRemove(key);');
	});

	it('the two literals that must agree, agree', async () => {
		const src = bootstrapOf(await serveSignedIn());
		// The bootstrap cannot import the module, so the sentinel is written twice.
		// A drift is a removal the server files as an ordinary string value.
		expect(src).toContain("var REMOVED = '\\u0000vanguard:removed';");
		expect(REMOVED).toBe('\u0000vanguard:removed');
	});

	it('pushes to the save endpoint and mints no second route for a removal', async () => {
		const src = bootstrapOf(await serveSignedIn());
		// A removal rides the snapshot the POST body already carries, so the
		// endpoint set is unchanged: the one POST in doPush, the one GET in
		// doRestore, the one unload beacon. It needs no new route and gets none --
		// which is also what lets the fix ship without touching the API handler.
		expect(countMatches(src, "fetch('/api/vanguard-save', {")).toBe(1);
		expect(countMatches(src, "fetch('/api/vanguard-save')")).toBe(1);
		expect(countMatches(src, "sendBeacon('/api/vanguard-save'")).toBe(1);
		expect(countMatches(src, '/api/vanguard-save')).toBe(3);
		expect(src).not.toContain('vanguard-save/remove');
		// And the body is still the shape the deployed handler reads.
		expect(src).toContain("body: JSON.stringify({ deviceClass: DEVICE, snapshot: sent })");
	});

	// THE STALE-CLEAR BUG THE WRAPPER WOULD OTHERWISE HAVE. A pending removal is
	// cleared on a CONFIRMED landing, never on dispatch.
	it('clears a pending removal only on an acknowledged push', async () => {
		const src = bootstrapOf(await serveSignedIn());
		const push = src.slice(src.indexOf('function doPush()'), src.indexOf('// Run history:'));
		expect(push).toContain('var sentRemovals = [];');
		expect(push).toContain('if (r.ok) { for (var i = 0; i < sentRemovals.length; i++)');
		// Nothing clears the set outside the ok branch.
		expect(countMatches(push, 'delete pendingRemovals[')).toBe(1);
	});

	// A write supersedes a pending deletion of the same key, so a remove-then-set
	// inside one debounce window cannot send a deletion for a key that is back.
	it('a later write supersedes a pending removal of the same key', async () => {
		const src = bootstrapOf(await serveSignedIn());
		const setter = src.slice(src.indexOf('localStorage.setItem = function'));
		expect(setter.slice(0, setter.indexOf('};'))).toContain('delete pendingRemovals[key];');
		// And the snapshot re-reads localStorage rather than trusting the set.
		expect(src).toContain('try { if (localStorage.getItem(rk) != null) continue; } catch (e) {}');
	});
});

describe('the removal path is inert when signed out', () => {
	// HOW INERTNESS IS ACTUALLY ESTABLISHED HERE, which is not what it looks like.
	// The bootstrap is emitted BYTE-IDENTICALLY for everyone -- `SIGNED_IN` is a
	// runtime `var` written from the server -- so the wrappers, `doPush` and the
	// save endpoint are all in the signed-out page's source too. What makes them
	// inert is the single `if (SIGNED_IN)` block they are installed inside. A test
	// asserting the strings are ABSENT would be asserting a mechanism this file
	// does not use, and would pass for the wrong reason.
	it('the signed-out serve says so, and the signed-in one says so', async () => {
		expect(bootstrapOf(await serveSignedOut())).toContain('var SIGNED_IN = false;');
		expect(bootstrapOf(await serveSignedIn())).toContain('var SIGNED_IN = true;');
	});

	// ONE GUARD, NOT TWO. The removal wrapper must be installed by the SAME
	// `if (SIGNED_IN)` that installs the setItem wrapper. A second check beside it
	// is a second spelling of "is this player signed in", which is the pair that
	// stops agreeing.
	it('both wrappers are installed by the same guard', async () => {
		const src = bootstrapOf(await serveSignedIn());
		const guardFor = (needle: string): number => {
			const at = src.indexOf(needle);
			expect(at, `${needle} is not in the bootstrap`).toBeGreaterThan(-1);
			return src.lastIndexOf('if (SIGNED_IN) {', at);
		};
		const setGuard = guardFor('localStorage.setItem = function');
		const removeGuard = guardFor('localStorage.removeItem = function');
		expect(setGuard).toBeGreaterThan(-1);
		expect(removeGuard).toBe(setGuard);
	});

	// The push itself refuses independently, so an installed wrapper could not
	// send anything even if the guard above were ever opened.
	it('the push refuses for itself as well', async () => {
		const src = bootstrapOf(await serveSignedIn());
		const push = src.slice(src.indexOf('function doPush()'));
		expect(push.slice(0, push.indexOf('setStatus('))).toContain('if (!SIGNED_IN) return;');
		expect(src).toContain('function schedulePush() {\n\t\tif (!SIGNED_IN) return;');
	});
});

describe('localStorage.clear is deliberately not wrapped', () => {
	// THE EVIDENCE FOR THE DECISION, PINNED. The game never calls clear(), so any
	// caller is code we cannot attribute -- and propagating an unattributable
	// wipe would let one call destroy a student's entire cloud save. If a build
	// ever DOES call it, this reddens and the decision gets made again with that
	// call site in front of whoever makes it.
	it('nothing in the build calls it, which is why nothing propagates it', () => {
		expect(countMatches(vanguardHtml, 'localStorage.clear')).toBe(0);
	});

	it('no serve installs a clear wrapper', async () => {
		for (const html of [await serveSignedIn(), await serveSignedOut()]) {
			expect(html).not.toContain('localStorage.clear = function');
		}
	});
});

describe('the bootstrap still parses with the removal path in it', () => {
	// The hook lives inside a template literal and nothing in the TypeScript
	// build looks inside that string: an unbalanced brace deploys, serves 200 and
	// takes the whole bootstrap down at parse time in front of a class. The
	// sentinel's backslash escape is exactly the kind of edit that does it.
	it('parses as JavaScript, and carries the removal wrapper when it does', async () => {
		for (const html of [await serveSignedIn(), await serveSignedOut()]) {
			const src = bootstrapOf(html);
			// The positive control: a parse assertion over an empty string passes.
			expect(src).toContain('var pendingRemovals = {};');
			expect(() => new Function(src)).not.toThrow();
		}
	});

	// The escape must survive into the page as an escape, not as a raw NUL byte
	// in the HTML -- and the string it builds must be the sentinel.
	it('the emitted sentinel evaluates to REMOVED and ships no raw NUL', async () => {
		const html = await serveSignedIn();
		expect(html.indexOf(String.fromCharCode(0))).toBe(-1);
		const built = new Function("return '\\u0000vanguard:removed';")();
		expect(built).toBe(REMOVED);
	});
});
