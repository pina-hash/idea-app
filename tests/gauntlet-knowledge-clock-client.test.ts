// tests/gauntlet-knowledge-clock-client.test.ts
//
// THE CLIENT HALF OF 0148: the ladder, and what the three play routes send.
//
// 0148 is applied BY HAND and separately from this deploy, so a deployment
// sitting between the two is a real state (CLAUDE.md, select ladders). The
// consequence is sharper here than for an ordinary ladder, because the pre-0148
// `gauntlet_submit` scores a MISSING `p_elapsed_ms` as ZERO: a client that
// stopped sending one before the migration landed would not degrade, it would
// quietly fill every knowledge board on the site with 0.00 rows. So "when may
// the browser stop sending its own number" is a correctness claim, not a tidy-up,
// and it is the claim this file exists for.
//
// THE ROUTE ACTIONS ARE DRIVEN, NOT DESCRIBED. Each `submit` action is imported
// from its own `+page.server.ts` and called with a real FormData and a stub
// client that records the RPC arguments, so what is asserted is what PostgREST
// would receive.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	AHEAD_NOTE,
	CLOCK_STARTING,
	clockAcceptsAnswers,
	clockIsServerSide,
	reviewNote,
	startKnowledgeClock,
	type KnowledgeClockClient
} from '$lib/gauntlet/knowledge-clock';

const answering = (
	res: { data: unknown; error: { code?: string; message?: string } | null } | Error
): KnowledgeClockClient => ({
	rpc: async () => {
		if (res instanceof Error) throw res;
		return res;
	}
});

describe('the ladder degrades on the CODE alone', () => {
	it('a stamped clock is the server rung', async () => {
		const c = await startKnowledgeClock(answering({ data: { ok: true, timed: true }, error: null }), 'c1');
		expect(c.state).toBe('server');
		expect(c.timed).toBe(true);
		expect(clockIsServerSide(c)).toBe(true);
		expect(clockAcceptsAnswers(c)).toBe(true);
	});

	it('PGRST202 means the migration is not applied here, and is not a failure', async () => {
		const c = await startKnowledgeClock(
			answering({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }),
			'c1'
		);
		expect(c.state).toBe('client');
		expect(c.message).toBe('');
		// THE WHOLE POINT: on this rung the browser MUST keep sending its own
		// elapsed time, because the deployed function scores a missing one as 0.
		expect(clockIsServerSide(c)).toBe(false);
		// And it must not stop the student answering.
		expect(clockAcceptsAnswers(c)).toBe(true);
	});

	it('any OTHER error fails closed, message and all', async () => {
		// A runtime error INSIDE the function must not fall through to the weaker
		// path. P0001 is a `raise`; 42501 is RLS; both are considered refusals.
		for (const code of ['P0001', '42501', '40001', undefined]) {
			const c = await startKnowledgeClock(
				answering({ data: null, error: { code, message: 'boom' } }),
				'c1'
			);
			expect(c.state).toBe('failed');
			expect(clockIsServerSide(c)).toBe(false);
			expect(c.message).toMatch(/Reload the page/i);
		}
	});

	it('a transport throw is caught, never propagated into the mount', async () => {
		const c = await startKnowledgeClock(answering(new Error('offline')), 'c1');
		expect(c.state).toBe('failed');
		expect(c.message).toMatch(/Reload the page/i);
	});

	it('a server rung that says the clock is closed reports it', async () => {
		const c = await startKnowledgeClock(
			answering({ data: { ok: true, timed: false, restarted: false }, error: null }),
			'c1'
		);
		expect(c.state).toBe('server');
		expect(c.timed).toBe(false);
	});

	it('an unknown payload does NOT claim the clock is closed', async () => {
		// `timed` absent is "cannot tell", and claiming a run will not count when
		// it will is the worse of the two mistakes.
		const c = await startKnowledgeClock(answering({ data: {}, error: null }), 'c1');
		expect(c.timed).toBe(true);
	});

	it('nothing may be submitted while the start is still in flight', () => {
		expect(clockAcceptsAnswers(CLOCK_STARTING)).toBe(false);
		expect(clockIsServerSide(CLOCK_STARTING)).toBe(false);
	});
});

describe('the review note', () => {
	it('says nothing when this run was the timed one', () => {
		expect(reviewNote(true)).toBeNull();
	});

	it('says nothing when the server did not report at all', () => {
		// Pre-0148 the key is simply absent, and an absent key must not be read as
		// "this did not count" -- on that server it did.
		expect(reviewNote(undefined)).toBeNull();
	});

	it('names the ranked time only when the server said this was a review', () => {
		expect(reviewNote(false)).toMatch(/ranked time/i);
		expect(reviewNote(false)).toMatch(/practice/i);
	});

	it('and the same fact is available BEFORE a second attempt is spent', () => {
		expect(AHEAD_NOTE).toMatch(/already set/i);
		expect(AHEAD_NOTE).toMatch(/does not change/i);
	});
});

// ---------------------------------------------------------------------------
// The three real submit actions.
// ---------------------------------------------------------------------------
interface Recorded {
	fn: string;
	args: Record<string, unknown>;
}

function stubLocals(recorded: Recorded[]) {
	return {
		supabase: {
			rpc: async (fn: string, args: Record<string, unknown>) => {
				recorded.push({ fn, args });
				return { data: { is_correct: true, score_metric: 12 }, error: null };
			}
		},
		claims: { sub: 'user-1', email: 'reader@boscotech.net' }
	};
}

const formEvent = (recorded: Recorded[], fields: Record<string, string>) => ({
	request: { formData: async () => {
		const fd = new FormData();
		for (const [k, v] of Object.entries(fields)) fd.set(k, v);
		return fd;
	} },
	params: { id: 'challenge-1' },
	locals: stubLocals(recorded)
});

const ROUTES = [
	'src/routes/gauntlet/drawing-reading/[id]/+page.server.ts',
	'src/routes/gauntlet/gdt-tolerance/[id]/+page.server.ts',
	'src/routes/gauntlet/spot-the-error/[id]/+page.server.ts'
] as const;

const loadAction = async (path: string) => {
	const mod = await import(/* @vite-ignore */ join(process.cwd(), path));
	return mod.actions.submit as (event: unknown) => Promise<unknown>;
};

describe('what each play route actually sends', () => {
	it('OMITS p_elapsed_ms entirely when the form carries none', async () => {
		expect(ROUTES.length).toBe(3);
		for (const path of ROUTES) {
			const recorded: Recorded[] = [];
			const submit = await loadAction(path);
			// The surface DELETES the field once the server clock is stamped, so
			// this is the post-0148 shape.
			await submit(formEvent(recorded, { answer: 'c' }));
			expect(recorded).toHaveLength(1);
			expect(recorded[0].fn).toBe('gauntlet_submit');
			expect(Object.keys(recorded[0].args).sort()).toEqual(['p_challenge_id', 'p_value']);
			expect(recorded[0].args).not.toHaveProperty('p_elapsed_ms');
		}
	});

	it('POSITIVE CONTROL: passes it through on the pre-0148 rung', async () => {
		for (const path of ROUTES) {
			const recorded: Recorded[] = [];
			const submit = await loadAction(path);
			await submit(formEvent(recorded, { answer: 'c', elapsed_ms: '8421' }));
			expect(recorded[0].args.p_elapsed_ms).toBe(8421);
		}
	});

	it('an empty or junk field is not a claim of zero elapsed time', async () => {
		for (const path of ROUTES) {
			const empty: Recorded[] = [];
			await (await loadAction(path))(formEvent(empty, { answer: 'c', elapsed_ms: '' }));
			// Empty means the surface sent nothing, not "zero".
			expect(empty[0].args).not.toHaveProperty('p_elapsed_ms');

			const junk: Recorded[] = [];
			await (await loadAction(path))(formEvent(junk, { answer: 'c', elapsed_ms: 'nope' }));
			// A present but unparseable field keeps the pre-0148 behaviour, which
			// floored it at 0 rather than dropping the parameter.
			expect(junk[0].args.p_elapsed_ms).toBe(0);
		}
	});

	it('and none of them still reads the form unconditionally', () => {
		// A route that went back to `p_elapsed_ms: elapsed` would pass every
		// assertion above only until somebody re-added the field to the form, so
		// the source is swept too, with its own positive control.
		let swept = 0;
		for (const path of ROUTES) {
			const src = readFileSync(join(process.cwd(), path), 'utf8');
			expect(src).toMatch(/if \(typeof elapsedField === 'string' && elapsedField !== ''\)/);
			expect(src).not.toMatch(/p_elapsed_ms: elapsed\b/);
			swept += 1;
		}
		expect(swept).toBe(3);
	});
});

describe('there is ONE implementation of the clock ladder', () => {
	const SURFACES = [
		'src/lib/gauntlet/KnowledgePlay.svelte',
		'src/routes/gauntlet/drawing-reading/[id]/+page.svelte'
	] as const;

	it('every knowledge play surface calls the shared module and spells no second check', () => {
		let swept = 0;
		for (const path of SURFACES) {
			const src = readFileSync(join(process.cwd(), path), 'utf8');
			expect(src).toContain("from '$lib/gauntlet/knowledge-clock'");
			expect(src).toMatch(/startKnowledgeClock\(supabase, challenge\.id\)/);
			// A second spelling of "is the server timing this" is the pair that
			// stops agreeing, and PGRST202 written out here is what that looks like.
			expect(src).not.toContain('PGRST202');
			swept += 1;
		}
		expect(swept).toBe(2);
	});

	it('and the start is NOT called from any knowledge route load, where a hover prefetch would fire it', () => {
		// A load runs on hover prefetch, so a start call there would stamp a clock
		// for every question a student's mouse passed over. The QUOTED name is the
		// call form; the routes are free to mention it in a comment, and one does.
		const CALL = "'gauntlet_knowledge_start'";
		let swept = 0;
		for (const path of ROUTES) {
			expect(readFileSync(join(process.cwd(), path), 'utf8')).not.toContain(CALL);
			swept += 1;
		}
		expect(swept).toBe(3);
		// POSITIVE CONTROL: that exact string is what the shared module calls, so
		// the sweep is looking for something that genuinely exists somewhere.
		expect(
			readFileSync(join(process.cwd(), 'src/lib/gauntlet/knowledge-clock.ts'), 'utf8')
		).toContain(CALL);
	});
});
