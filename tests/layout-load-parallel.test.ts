import { describe, expect, it } from 'vitest';
import { load } from '../src/routes/+layout.server';

/**
 * THE ROOT LAYOUT'S TWO READS RUN TOGETHER, AND THIS FAILS IF THEY GO BACK TO
 * RUNNING IN SEQUENCE.
 *
 * `loadProfile` and `isAdmin` are independent -- `is_admin()` resolves the
 * caller from their own JWT claims and consumes nothing the profile load
 * produces -- but they were two sequential `await`s, so every authenticated
 * page load in the site paid both round trips end to end.
 *
 * THE ASSERTION IS AN ORDERING ONE, NOT A TIMING ONE, which is what makes it
 * deterministic rather than flaky. A wall-clock test ("both finished inside
 * N ms") measures the machine; this holds the profile read OPEN and asks
 * whether the admin read has been ISSUED. Under `Promise.all` it has, because
 * nothing is waiting on the first. Under two sequential awaits it cannot have
 * been, because the statement that issues it has not been reached. Verified
 * against the sequential form: `rpc` is never called and the expectation below
 * fails.
 */

type Deferred = { promise: Promise<unknown>; resolve: (v: unknown) => void };
function deferred(): Deferred {
	let resolve!: (v: unknown) => void;
	const promise = new Promise((r) => (resolve = r));
	return { promise, resolve };
}

/** The narrowest client the real `load` touches: one select chain, one rpc. */
function client(profileGate: Promise<unknown>, onRpc: () => void) {
	return {
		from: () => ({
			select: () => ({
				eq: () => ({
					maybeSingle: () => profileGate
				})
			})
		}),
		rpc: (name: string) => {
			if (name === 'is_admin') onRpc();
			return Promise.resolve({ data: true, error: null });
		}
	};
}

const CLAIMS = { sub: 'user-1' };
const cookies = { getAll: () => [] };

describe('the root layout load', () => {
	it('issues the admin read WITHOUT waiting for the profile read', async () => {
		const gate = deferred();
		let rpcCalled = false;
		const supabase = client(gate.promise, () => (rpcCalled = true));

		/* Deliberately NOT awaited: the profile read is still open. */
		const pending = load({
			locals: { supabase, claims: CLAIMS },
			cookies
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);

		/* Let every already-scheduled microtask drain. `Promise.all` has issued
		   both calls by now; a sequential pair has issued only the first. */
		await new Promise((r) => setTimeout(r, 0));

		expect(rpcCalled).toBe(true);

		gate.resolve({ data: { id: 'user-1' }, error: null });
		await pending;
	});

	it('still returns both answers, and the admin flag is the rpc result', async () => {
		const gate = deferred();
		gate.resolve({ data: { id: 'user-1', role: 'student' }, error: null });
		const supabase = client(gate.promise, () => {});

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = (await load({ locals: { supabase, claims: CLAIMS }, cookies } as any)) as {
			userProfile: { id: string } | null;
			isAdmin: boolean;
			claims: unknown;
		};

		expect(data.userProfile?.id).toBe('user-1');
		expect(data.isAdmin).toBe(true);
		expect(data.claims).toBe(CLAIMS);
	});

	it('asks nothing at all with no session, and never rejects on it', async () => {
		let touched = false;
		const supabase = client(Promise.resolve({ data: null, error: null }), () => (touched = true));

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = (await load({ locals: { supabase, claims: null }, cookies } as any)) as {
			userProfile: unknown;
			isAdmin: boolean;
		};

		expect(touched).toBe(false);
		expect(data.userProfile).toBeNull();
		expect(data.isAdmin).toBe(false);
	});
});
