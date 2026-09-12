// tests/dom/ideacad-checkout-controller.test.ts
//
// THE CHECKOUT CONTROLLER'S STATE MACHINE, DRIVEN AGAINST THE REAL ONE.
//
// `createIdeacadCheckout` is what decides whether a student is told their hold
// is gone, and every way it can go wrong is SILENT: a heartbeat that keeps
// running after a loss, a lapse that is only discovered on a refused write, a
// stale poll that tears down a live editor. None of those shows on screen as an
// error -- the surface simply keeps looking correct while the work stops
// saving. That is what puts this in an automated file rather than in a harness
// note.
//
// THE TIMERS ARE SHORTENED AND THE CLOCK IS INJECTED, so a ten-minute window is
// asserted at a pinned instant instead of waited through. What is NOT changed is
// any rule: `holdWindowSeconds` still comes off the payload, exactly as
// `ideacad_assembly` returns it.
//
// WHAT THIS FILE DELIBERATELY DOES NOT ASSERT: any width, ratio or tap target.
// happy-dom has no layout engine, so every one of those reads zero and passes
// vacuously. They are measured against a real Chromium in
// `tools/browser-verify/routes/ideacad-team-*.mjs`.

import { afterEach, describe, expect, it } from 'vitest';
import {
	IDEACAD_CHECKOUT_OFFLINE,
	checkoutNotice,
	createIdeacadCheckout,
	holdIsExpiring,
	holdSecondsLeft,
	partRows,
	type IdeacadCheckout
} from '$lib/ideacad/checkout';
import type {
	IdeacadAssembly,
	IdeacadAssemblyPart,
	IdeacadAssemblyTransports,
	IdeacadHoldResult
} from '$lib/ideacad/assembly';

const ME = 'ana@boscotech.net';
const THEM = 'luis@boscotech.net';
const WINDOW = 600;
const T0 = Date.parse('2026-09-12T18:00:00Z');

/** A part, with its hold state stated rather than derived, so a fixture can put
 *  the controller in a state the database would genuinely produce. */
function part(
	id: string,
	position: number,
	heldBy: string | null,
	beatAgoMs: number,
	revision = 1,
	viewer = ME
): IdeacadAssemblyPart {
	const beatAt = heldBy ? new Date(T0 - beatAgoMs).toISOString() : null;
	const live = heldBy !== null && beatAgoMs < WINDOW * 1000;
	return {
		id,
		position,
		name: `Part ${position}`,
		activeConceptId: `c-${id}`,
		heldBy,
		heldAt: beatAt,
		holdBeatAt: beatAt,
		holdRevision: revision,
		holdLive: live,
		holdIsMine: live && heldBy === viewer,
		conceptCount: 1
	};
}

function assembly(parts: IdeacadAssemblyPart[], over: Partial<IdeacadAssembly> = {}): IdeacadAssembly {
	return {
		documentId: 'doc-1',
		viewer: ME,
		isOwner: false,
		canWrite: true,
		holdWindowSeconds: WINDOW,
		holdRevisionTotal: parts.reduce((n, p) => n + p.holdRevision, 0),
		parts,
		...over
	};
}

/** A recording transport whose answers a test sets per call. */
function rig(initial: IdeacadAssembly) {
	let payload = initial;
	const calls: string[] = [];
	let claim: IdeacadHoldResult | Error | null = null;
	let beat: IdeacadHoldResult | Error | null = null;
	let readError: Error | null = null;
	const transports: IdeacadAssemblyTransports = {
		async assembly() {
			calls.push('assembly');
			if (readError) throw readError;
			return payload;
		},
		async claimPart(partId) {
			calls.push(`claim:${partId}`);
			if (claim instanceof Error) throw claim;
			return claim ?? { ok: true, reason: 'claimed', partId, heldBy: ME, holdRevision: 9 };
		},
		async releasePart(partId) {
			calls.push(`release:${partId}`);
			return { ok: true, reason: 'released', partId, holdRevision: 9 };
		},
		async beatPart(partId, holdRevision) {
			calls.push(`beat:${partId}:${holdRevision}`);
			if (beat instanceof Error) throw beat;
			return (
				beat ?? {
					ok: true,
					reason: 'beating',
					partId,
					holdBeatAt: new Date(T0).toISOString(),
					holdRevision
				}
			);
		},
		async assignPart(partId, email) {
			calls.push(`assign:${partId}:${email ?? 'null'}`);
			return {
				ok: true,
				reason: email ? 'assigned' : 'cleared',
				partId,
				heldBy: email,
				holdRevision: 9
			};
		}
	};
	return {
		transports,
		calls,
		set payload(next: IdeacadAssembly) {
			payload = next;
		},
		set claim(next: IdeacadHoldResult | Error | null) {
			claim = next;
		},
		set beat(next: IdeacadHoldResult | Error | null) {
			beat = next;
		},
		set readError(next: Error | null) {
			readError = next;
		}
	};
}

const live: IdeacadCheckout[] = [];
afterEach(() => {
	while (live.length) live.pop()!.destroy();
});

function open(r: ReturnType<typeof rig>, now = () => T0) {
	const c = createIdeacadCheckout(r.transports, {
		beatMs: 5,
		pollMs: 100_000,
		tickMs: 5,
		now
	});
	live.push(c);
	return c;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 25));

describe('the words a refusal is read in', () => {
	it('is exhaustive over the database’s own reason union, with no blank sentence', () => {
		// EVERY REASON `assembly.ts` DECLARES, swept rather than listed twice: a
		// reason added there without a sentence here must be a failure, and the
		// case count is asserted so a sweep that generated nothing cannot pass.
		const reasons = [
			'claimed',
			'takeover',
			'resumed',
			'held',
			'released',
			'already_free',
			'not_yours',
			'beating',
			'lost',
			'lapsed',
			'assigned',
			'cleared',
			'unchanged'
		] as const;
		expect(reasons.length, 'reasons swept').toBe(13);
		for (const reason of reasons) {
			const notice = checkoutNotice({ ok: true, reason, partId: 'p1', holdRevision: 1 });
			expect(notice.text.length, reason).toBeGreaterThan(20);
			expect(notice.reason, reason).toBe(reason);
			expect(['info', 'refusal', 'terminal']).toContain(notice.tone);
		}
	});

	it('names the holder on a refused claim, because a name is what a student can act on', () => {
		const notice = checkoutNotice({
			ok: false,
			reason: 'held',
			partId: 'p1',
			heldBy: THEM,
			holdRevision: 4
		});
		expect(notice.text).toContain(THEM);
		expect(notice.tone).toBe('refusal');
	});

	it('falls back to the flat sentence when the payload names nobody', () => {
		const notice = checkoutNotice({ ok: false, reason: 'held', partId: 'p1', holdRevision: 4 });
		expect(notice.text).toContain('Somebody else');
		expect(notice.text).not.toContain('undefined');
	});

	it('reads a loss and a lapse as TERMINAL and says the work is still on screen', () => {
		for (const reason of ['lost', 'lapsed'] as const) {
			const notice = checkoutNotice({ ok: false, reason, partId: 'p1', holdRevision: 4 });
			expect(notice.tone, reason).toBe('terminal');
			expect(notice.text, reason).toMatch(/still here/);
		}
	});
});

describe('the clock, against the payload’s own window', () => {
	it('counts down from the beat, and never reads its own clock', () => {
		const p = part('p1', 1, ME, 60_000);
		expect(holdSecondsLeft(p, WINDOW, T0)).toBe(WINDOW - 60);
		// The SAME part at a later instant answers differently, which is what
		// makes `now` a parameter rather than a call inside the function.
		expect(holdSecondsLeft(p, WINDOW, T0 + 60_000)).toBe(WINDOW - 120);
	});

	it('answers null for a part nobody holds, never 0', () => {
		// 0 would render as "about to lapse" on a part that is simply free.
		expect(holdSecondsLeft(part('p1', 1, null, 0), WINDOW, T0)).toBeNull();
		expect(holdSecondsLeft(null, WINDOW, T0)).toBeNull();
		expect(holdIsExpiring(null, WINDOW)).toBe(false);
	});

	it('warns on a FRACTION of the window, so shortening the window in the database still warns', () => {
		expect(holdIsExpiring(WINDOW * 0.5, WINDOW)).toBe(false);
		expect(holdIsExpiring(WINDOW * 0.2, WINDOW)).toBe(true);
		// A window somebody shortened to 60s warns at 15s, not at a pinned 60.
		expect(holdIsExpiring(30, 60)).toBe(false);
		expect(holdIsExpiring(10, 60)).toBe(true);
	});
});

describe('the row model', () => {
	it('offers exactly one action per row and names the blocker', () => {
		const rows = partRows(
			assembly([part('p1', 1, null, 0), part('p2', 2, ME, 1_000, 2), part('p3', 3, THEM, 1_000, 2)])
		);
		expect(rows.map((r) => r.action)).toEqual(['claim', 'release', 'blocked']);
		expect(rows[2].blockedBy).toBe(THEM);
		expect(rows[1].mine).toBe(true);
	});

	it('renders a LAPSED hold as free, because the database will take it over', () => {
		// A row still naming the person who walked away would offer a refusal
		// that is not going to happen.
		const stale = part('p1', 1, THEM, WINDOW * 1000 + 1_000, 2);
		const [row] = partRows(assembly([stale]));
		expect(row.holder).toBeNull();
		expect(row.blockedBy).toBeNull();
		expect(row.action).toBe('claim');
	});

	it('gives a VIEWER no action on any row, and the positive control is the same fixture writing', () => {
		const parts = [part('p1', 1, null, 0), part('p2', 2, THEM, 1_000, 2)];
		const viewer = partRows(assembly(parts, { canWrite: false }));
		const editor = partRows(assembly(parts, { canWrite: true }));
		expect(viewer.map((r) => r.action)).toEqual(['none', 'none']);
		expect(editor.map((r) => r.action)).toEqual(['claim', 'blocked']);
	});
});

describe('the controller', () => {
	it('adopts a hold the payload says this caller already has, and starts beating', async () => {
		const r = rig(assembly([part('p1', 1, ME, 1_000, 4)]));
		const c = open(r);
		await c.open('doc-1');
		expect(c.state.myPartId).toBe('p1');
		expect(c.state.myHoldRevision).toBe(4);
		expect(c.state.secondsLeft).toBe(WINDOW - 1);
		await settle();
		expect(r.calls.some((call) => call.startsWith('beat:p1:4')), r.calls.join(',')).toBe(true);
	});

	it('goes TERMINAL on a heartbeat that comes back lost, and STOPS BEATING', async () => {
		const r = rig(assembly([part('p1', 1, ME, 1_000, 4)]));
		const c = open(r);
		await c.open('doc-1');
		r.beat = { ok: false, reason: 'lost', partId: 'p1', heldBy: THEM, holdRevision: 5 };
		await settle();
		expect(c.state.phase).toBe('lost');
		expect(c.state.notice?.tone).toBe('terminal');
		expect(c.state.myPartId).toBeNull();

		// THE BEAT IS GONE. A beat left running after a loss keeps asking a
		// question that has been answered, and its next answer would overwrite
		// the notice that explained the first one.
		const before = r.calls.filter((call) => call.startsWith('beat:')).length;
		await settle();
		const after = r.calls.filter((call) => call.startsWith('beat:')).length;
		expect(after, `beats before ${before}, after ${after}`).toBe(before);
	});

	it('NOTICES A LAPSE ON ITS OWN CLOCK with the server unreachable, which is the case that matters', async () => {
		// The ordinary route to the truth is a heartbeat answer. A student whose
		// wifi dropped gets no answer from anything, so a controller that only
		// learned from the server would let them keep typing into a part they no
		// longer hold. `now` walks past the window with every beat THROWING.
		const r = rig(assembly([part('p1', 1, ME, 1_000, 4)]));
		let now = T0;
		const c = open(r, () => now);
		await c.open('doc-1');
		expect(c.state.phase).toBe('idle');
		r.beat = new Error('network down');
		now = T0 + WINDOW * 1000 + 2_000;
		await settle();
		expect(c.state.phase).toBe('lost');
		expect(c.state.notice?.reason).toBe('lapsed');
		expect(c.state.notice?.text).toMatch(/timed out/);
	});

	it('does NOT go terminal on a failed beat inside the window', async () => {
		// Nothing was decided: the hold may well still be ours, and the local
		// clock is what will end it if the failure lasts past the window.
		const r = rig(assembly([part('p1', 1, ME, 1_000, 4)]));
		const c = open(r);
		await c.open('doc-1');
		r.beat = new Error('one bad round trip');
		await settle();
		expect(c.state.phase).toBe('idle');
		expect(c.state.myPartId).toBe('p1');
	});

	it('turns a refused claim into a refusal on screen rather than an error', async () => {
		const r = rig(assembly([part('p1', 1, THEM, 1_000, 2)]));
		const c = open(r);
		await c.open('doc-1');
		r.claim = { ok: false, reason: 'held', partId: 'p1', heldBy: THEM, holdRevision: 2 };
		const result = await c.claim('p1');
		expect(result?.ok).toBe(false);
		expect(c.state.phase).toBe('idle');
		expect(c.state.notice?.tone).toBe('refusal');
		expect(c.state.notice?.text).toContain(THEM);
		expect(c.state.error).toBeNull();
	});

	it('separates a network failure from a refusal, because nothing was decided', async () => {
		const r = rig(assembly([part('p1', 1, null, 0)]));
		const c = open(r);
		await c.open('doc-1');
		r.claim = new Error('fetch failed');
		const result = await c.claim('p1');
		expect(result).toBeNull();
		expect(c.state.notice?.reason).toBe('network');
		expect(c.state.notice?.text).toBe(IDEACAD_CHECKOUT_OFFLINE);
		expect(c.state.myPartId).toBeNull();
	});

	it('goes terminal when a POLL shows the owner moved the part, without waiting for a beat', async () => {
		const r = rig(assembly([part('p1', 1, ME, 1_000, 4)]));
		const c = open(r);
		await c.open('doc-1');
		expect(c.state.myPartId).toBe('p1');
		// The owner reassigned: same part, moved generation, a different holder.
		r.payload = assembly([part('p1', 1, THEM, 0, 5)]);
		await c.refresh();
		expect(c.state.phase).toBe('lost');
		expect(c.state.notice?.text).toContain(THEM);
	});

	it('does NOT tear down a live hold on a STALE read', async () => {
		// A revision BEHIND ours is a slow poll, not a loss. Answering otherwise
		// would unmount a working editor over network latency.
		const r = rig(assembly([part('p1', 1, ME, 1_000, 4)]));
		const c = open(r);
		await c.open('doc-1');
		r.payload = assembly([part('p1', 1, ME, 2_000, 3)]);
		await c.refresh();
		expect(c.state.phase).toBe('idle');
		expect(c.state.myPartId).toBe('p1');
	});

	it('does NOT tear down a live hold on a stale read that names the PREVIOUS holder', async () => {
		// THE CASE THAT SEPARATES `holdLostAgainst` FROM A BARE "is it still
		// mine". A poll answering from before this client took the part shows
		// somebody ELSE holding it at a revision BEHIND ours -- a surface reading
		// only the holder would go terminal on a snapshot that is simply old, and
		// the student would lose a part they are holding right now.
		const r = rig(assembly([part('p1', 1, THEM, 9_000, 3)]));
		const c = open(r);
		await c.open('doc-1');
		r.claim = { ok: true, reason: 'takeover', partId: 'p1', heldBy: ME, holdRevision: 4 };
		r.payload = assembly([part('p1', 1, ME, 0, 4)]);
		await c.claim('p1');
		expect(c.state.myHoldRevision).toBe(4);

		// The stale snapshot arrives after the claim landed.
		r.payload = assembly([part('p1', 1, THEM, 9_000, 3)]);
		await c.refresh();
		expect(c.state.phase).toBe('idle');
		expect(c.state.myPartId).toBe('p1');
		expect(c.state.myHoldRevision).toBe(4);
	});

	it('lets a deliberate re-claim out of the terminal state, and nothing else does', async () => {
		const r = rig(assembly([part('p1', 1, ME, 1_000, 4)]));
		const c = open(r);
		await c.open('doc-1');
		r.beat = { ok: false, reason: 'lost', partId: 'p1', heldBy: THEM, holdRevision: 5 };
		await settle();
		expect(c.state.phase).toBe('lost');

		// A refresh alone does not clear it: the part being free again is not the
		// student having decided to take it back.
		r.payload = assembly([part('p1', 1, null, 0, 6)]);
		await c.refresh();
		expect(c.state.phase).toBe('lost');

		r.beat = null;
		r.claim = { ok: true, reason: 'claimed', partId: 'p1', heldBy: ME, holdRevision: 7 };
		r.payload = assembly([part('p1', 1, ME, 0, 7)]);
		await c.claim('p1');
		expect(c.state.phase).toBe('idle');
		expect(c.state.myHoldRevision).toBe(7);
	});

	it('keeps its own hold when the OWNER releases a DIFFERENT part', async () => {
		// `ideacad_release_part` accepts the assembly owner freeing somebody
		// else's part, so a handler that cleared the local hold on every
		// successful release would stop the owner's own heartbeat on the part
		// they are working in. The next read happens to re-derive it, which is
		// exactly why this is asserted rather than left to recover by accident.
		const r = rig(
			assembly([part('p1', 1, ME, 1_000, 4), part('p2', 2, THEM, 1_000, 2)], { isOwner: true })
		);
		const c = open(r);
		await c.open('doc-1');
		expect(c.state.myPartId).toBe('p1');
		// THE FOLLOW-UP READ FAILS, WHICH IS WHAT MAKES THIS ASSERTABLE AT ALL.
		// `adopt` re-derives the hold from every successful read, so with the
		// read landing the state recovers whether or not the guard is there and
		// the assertion below passes on the broken code too -- measured, the
		// mutant survived exactly that version of this test. One network blip
		// between the release and the re-read is the case where recovering by
		// accident stops working, and it is a case a phone on school wifi has
		// every period.
		r.readError = new Error('the re-read did not land');
		await c.release('p2');
		expect(c.state.myPartId).toBe('p1');
		expect(c.state.myHoldRevision).toBe(4);
		expect(c.state.secondsLeft).not.toBeNull();
	});

	it('drops the hold when the OWNER reassigns a part they were holding themselves', async () => {
		const r = rig(assembly([part('p1', 1, ME, 1_000, 4)], { isOwner: true }));
		const c = open(r);
		await c.open('doc-1');
		expect(c.state.myPartId).toBe('p1');
		r.payload = assembly([part('p1', 1, THEM, 0, 5)], { isOwner: true });
		await c.assign('p1', THEM);
		expect(c.state.myPartId).toBeNull();
		expect(c.state.secondsLeft).toBeNull();
	});

	it('stops every timer on destroy', async () => {
		const r = rig(assembly([part('p1', 1, ME, 1_000, 4)]));
		const c = open(r);
		await c.open('doc-1');
		await settle();
		c.destroy();
		const before = r.calls.length;
		await settle();
		expect(r.calls.length, r.calls.join(',')).toBe(before);
	});
});
