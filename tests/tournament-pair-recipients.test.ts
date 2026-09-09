/**
 * WHO GETS "YOUR NEXT MATCH IS SET", AFTER AN ENTRY BECAME A ROSTER.
 *
 * 0192 added `tournament_entry_members`: an entry is a team now, not one
 * account. `sweepPairNotifications` went on pushing `tournament_entries.user_id`
 * alone, so a linked teammate -- a competitor in the match -- was never told it
 * had been set. `docs/history/tournaments-surface-scroll-yqplco.md` records the
 * edit under "Outside this bundle's ownership"; prompt 0115 owns `push.ts` and
 * makes it.
 *
 * THIS IS THE KIND OF DEFECT THAT IS INVISIBLE IN NORMAL USE, which is what
 * earns it a test at all under CLAUDE.md's rule: nothing anywhere reports a
 * push that was never sent. The captain still gets theirs, the match still
 * runs, and the only symptom is a teammate who did not know.
 *
 * SO THE RECIPIENT SET IS OBSERVED AT ITS REAL BOUNDARY, NOT ASSERTED FROM THE
 * HELPER ALONE. `sendPushToUsers` narrows `push_subscriptions` with
 * `.in('user_id', targets)`, so the argument to that one call IS the audience
 * the deployed function would push. The suite drives the REAL
 * `sweepPairNotifications` through a scripted client and reads it off there --
 * which means deleting the members READ reddens this file even if the union
 * helper is left standing, and deleting the union reddens it even if the read
 * is left standing. A test of the pure helper on its own would have caught
 * neither.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/** Every call the driven code made, in order, as `<table>.<method>` + args. */
interface Recorded {
	table: string;
	calls: { method: string; args: unknown[] }[];
}

let recorded: Recorded[] = [];
/** What an awaited chain resolves to, by table. */
let answers: Record<string, unknown> = {};

/**
 * A chainable, thenable stand-in for PostgREST's builder. Faithful in the one
 * way that matters here: every filter returns the builder, and awaiting it at
 * ANY depth resolves to `{ data }` for that table -- which is exactly how the
 * real client behaves for the five chains this module builds, and is why the
 * `Promise.all` of three differently-shaped reads can be driven at once.
 */
function builder(table: string): Record<string, unknown> {
	const rec: Recorded = { table, calls: [] };
	recorded.push(rec);
	const result = () => ({ data: answers[table] ?? null, error: null });
	const chain: Record<string, unknown> = {
		then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res),
		maybeSingle: () => Promise.resolve(result())
	};
	for (const m of ['select', 'update', 'delete', 'eq', 'is', 'not', 'neq', 'in']) {
		chain[m] = (...args: unknown[]) => {
			rec.calls.push({ method: m, args });
			return chain;
		};
	}
	return chain;
}

vi.mock('@supabase/supabase-js', () => ({
	createClient: () => ({ from: (table: string) => builder(table) })
}));

const { sweepPairNotifications, pairRecipients } = await import('$lib/server/push');

const CAPTAIN_A = 'captain-a';
const CAPTAIN_B = 'captain-b';
const MATE_A = 'teammate-a';
const MATE_B = 'teammate-b';

/** The recipient set the sweep actually handed to `push_subscriptions`. */
function pushedTo(): string[] {
	const subs = recorded.find((r) => r.table === 'push_subscriptions');
	const inCall = subs?.calls.find((c) => c.method === 'in' && c.args[0] === 'user_id');
	return ((inCall?.args[1] as string[]) ?? []).slice().sort();
}

beforeEach(() => {
	recorded = [];
	// Live reads of process.env, exactly as the deployed module does them.
	process.env.PUBLIC_VAPID_PUBLIC_KEY = 'test-public-key-not-a-real-credential';
	process.env.VAPID_PRIVATE_KEY = 'test-private-key-not-a-real-credential';
	process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key-not-a-real-credential';
	answers = {
		tournament_bracket_matches: [
			{ id: 'm1', bracket: 'winners', round: 1, entry_a_id: 'e-a', entry_b_id: 'e-b' }
		],
		tournaments: { name: 'Blade' },
		tournament_entries: [
			{ id: 'e-a', user_id: CAPTAIN_A, display_name: 'Team A' },
			{ id: 'e-b', user_id: CAPTAIN_B, display_name: 'Team B' }
		],
		tournament_entry_members: [
			{ entry_id: 'e-a', user_id: MATE_A },
			{ entry_id: 'e-b', user_id: MATE_B }
		],
		// No subscription rows: nothing is ever handed to web-push, so this
		// suite makes no network call and needs no VAPID key that works.
		push_subscriptions: []
	};
});

describe('sweepPairNotifications tells the whole roster', () => {
	it('pushes both captains AND both linked teammates', async () => {
		await sweepPairNotifications('t1');
		// The defect, stated as the thing that must not be true again: the
		// audience is not the two captain columns.
		expect(pushedTo()).toEqual([CAPTAIN_A, CAPTAIN_B, MATE_A, MATE_B].sort());
		expect(pushedTo()).not.toEqual([CAPTAIN_A, CAPTAIN_B].sort());
	});

	it('reads the roster scoped to the tournament, and only linked members', async () => {
		await sweepPairNotifications('t1');
		const members = recorded.find((r) => r.table === 'tournament_entry_members');
		expect(members, 'the sweep never read tournament_entry_members').toBeTruthy();
		expect(members!.calls).toContainEqual({ method: 'eq', args: ['tournament_id', 't1'] });
		// A walk-up teammate has no account and cannot be pushed; asking the
		// database rather than filtering afterwards keeps the read small.
		expect(members!.calls).toContainEqual({ method: 'not', args: ['user_id', 'is', null] });
	});

	it('POSITIVE CONTROL: a pre-0192 database answers exactly the two captains', async () => {
		// The members table does not exist there, so PostgREST answers an
		// error and `data` is null. This is the fallback the history entry
		// asks for, and it is what makes the change safe to deploy ahead of
		// the migration rather than behind it.
		answers.tournament_entry_members = null;
		await sweepPairNotifications('t1');
		expect(pushedTo()).toEqual([CAPTAIN_A, CAPTAIN_B].sort());
	});

	it('a roster with no accounts on it still reaches the captains', async () => {
		answers.tournament_entry_members = [];
		await sweepPairNotifications('t1');
		expect(pushedTo()).toEqual([CAPTAIN_A, CAPTAIN_B].sort());
	});

	it('sends nothing when neither side has a single account', async () => {
		answers.tournament_entries = [
			{ id: 'e-a', user_id: null, display_name: 'Team A' },
			{ id: 'e-b', user_id: null, display_name: 'Team B' }
		];
		answers.tournament_entry_members = [];
		await sweepPairNotifications('t1');
		expect(recorded.find((r) => r.table === 'push_subscriptions')).toBeUndefined();
	});
});

describe('pairRecipients, the union itself', () => {
	const a = { id: 'e-a', user_id: CAPTAIN_A };
	const b = { id: 'e-b', user_id: CAPTAIN_B };

	it('is the union of both rosters and both captains', () => {
		const members = new Map([
			['e-a', [MATE_A]],
			['e-b', [MATE_B]]
		]);
		expect(pairRecipients(a, b, members).sort()).toEqual(
			[CAPTAIN_A, CAPTAIN_B, MATE_A, MATE_B].sort()
		);
	});

	it('DEDUPES a captain who is also a member of their own entry', () => {
		// The normal case, not an edge one: registering a team puts the
		// captain on its roster. Without the dedupe they get two pushes of
		// one match, which is worse than the bug this fixes.
		const members = new Map([['e-a', [CAPTAIN_A, MATE_A]]]);
		const out = pairRecipients(a, b, members);
		expect(out.filter((u) => u === CAPTAIN_A)).toHaveLength(1);
		expect(out.sort()).toEqual([CAPTAIN_A, CAPTAIN_B, MATE_A].sort());
	});

	it('never lets one entry borrow the other entry’s roster', () => {
		// A member row is keyed on its own entry. If the fold ever stopped
		// keying on entry_id, this is what would go wrong first, and silently.
		const members = new Map([['e-b', [MATE_B]]]);
		expect(pairRecipients(a, { id: 'e-c', user_id: null }, members).sort()).toEqual(
			[CAPTAIN_A].sort()
		);
	});

	it('drops nulls from both halves and answers empty for nobody', () => {
		expect(pairRecipients({ id: 'e-a', user_id: null }, { id: 'e-b', user_id: null }, new Map()))
			.toEqual([]);
	});
});
