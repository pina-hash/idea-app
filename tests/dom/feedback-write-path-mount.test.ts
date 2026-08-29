// tests/dom/feedback-write-path-mount.test.ts
//
// `SiteFeedback.anonymous`: BOTH branches, driven through the REAL component,
// each asserted to reach ITS OWN endpoint.
//
// WHAT WAS ALREADY COVERED, checked before writing a line of this, because a
// second copy of an existing assertion is worse than none:
//
//   * `tests/dom/feedback-contact-field-mount.test.ts` already mounts the real
//     `SiteFeedback` and drives `anonymous: true` AND `anonymous: false`. It
//     asserts the optional contact field is offered in one and absent in the
//     other, and that the entry carries or omits the contact key.
//   * `tests/feedback-anonymous-route.test.ts` drives the real `/api/feedback`
//     route against a real Postgres, and asserts `feedbackWriter` is non-null
//     for a signed-out caller.
//   * `/dev/feedback` passes `anonymous` at two of its nine mounts.
//
// So the claim that "no harness passes it" is not true, and neither is the
// claim that the signed-out branch is untested. WHAT IS GENUINELY UNTESTED is
// the join between them: every existing mount injects a stand-in `submit`, so
// nothing has ever checked that a box mounted the way production mounts it
// reaches `app_feedback` on one branch and `POST /api/feedback` on the other.
// `feedbackWriter` is proven in isolation and `SiteFeedback` is proven against
// a fake -- the wiring that decides which of two write paths a real report
// takes has never been driven end to end.
//
// THAT WIRING IS THE WHOLE POINT OF THE PROP. `feedbackIsAnonymous` and
// `feedbackWriter` branch on the same pair of values and are called SEPARATELY
// at each mount site (`+layout.svelte:59` and `:85`, `gauntlet/+layout.svelte:48`
// and `:76`, and the classroom deck route). The day those two calls disagree is
// the day the box says a name is attached to a row that carries none, or offers
// a contact field for a report that will be attributed anyway. Both branches
// are driven here from ONE pair of inputs, so a disagreement has somewhere to
// fail.
//
// Structure, events and which transport was touched. No geometry, contrast or
// tap-target claim: happy-dom has no layout engine.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import SiteFeedback from '$lib/feedback/SiteFeedback.svelte';
import { describeBuild, type BuildStamp } from '$lib/feedback/context';
import {
	APP_FEEDBACK_TABLE,
	ANONYMOUS_FEEDBACK_ENDPOINT,
	feedbackIsAnonymous,
	feedbackWriter,
	type FeedbackEntry
} from '$lib/feedback/feedback';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mountInto, type Mounted } from './mount';

const Feedback = SiteFeedback as unknown as Component<Record<string, unknown>>;
const BUILD: BuildStamp = describeBuild({ sha: 'a1b2c3d', complete: true }, null);

const TYPED = 'The launch button did nothing on the third try.';
const USER_ID = 'u-1';

/** Everything either write path touched, so an assertion can name the OTHER one. */
interface Wire {
	/** Tables `.from()` was asked for, in order. */
	tables: string[];
	/** Rows handed to `.insert()`. */
	inserted: Record<string, unknown>[];
	/** URLs `fetch` was called with. */
	fetched: string[];
	/** Parsed bodies of those POSTs. */
	posted: Record<string, unknown>[];
}

function wire(): Wire {
	return { tables: [], inserted: [], fetched: [], posted: [] };
}

/**
 * The narrowest client `submitFeedback` actually uses: `.from(table).insert(row)`.
 *
 * Deliberately not a fuller fake. The question is which path a report takes,
 * and a client that answered more than `submitFeedback` asks for would let a
 * different code path pass unnoticed.
 */
function tableClient(w: Wire): SupabaseClient {
	return {
		from(table: string) {
			w.tables.push(table);
			return {
				insert: async (row: Record<string, unknown>) => {
					w.inserted.push(row);
					return { error: null };
				}
			};
		}
	} as unknown as SupabaseClient;
}

/** A fetch that records and answers the shape the anonymous path reads. */
function recordingFetch(w: Wire): typeof fetch {
	return (async (url: string, init?: RequestInit) => {
		w.fetched.push(String(url));
		w.posted.push(JSON.parse(String(init?.body ?? '{}')));
		return {
			ok: true,
			status: 202,
			json: async () => ({ ok: true })
		} as unknown as Response;
	}) as unknown as typeof fetch;
}

/**
 * Mount the box THE WAY PRODUCTION MOUNTS IT: both `submit` and `anonymous`
 * derived from the same (client, userId) pair through the two real helpers,
 * exactly as `src/routes/+layout.svelte` lines 59 and 85 do.
 *
 * That is the part under test. Passing `anonymous` by hand, which is what every
 * existing mount does, would assert the component's rendering and skip the
 * decision entirely.
 */
function mountAsProduction(
	w: Wire,
	who: { client: SupabaseClient | null; userId: string | null }
): { m: Mounted; anonymous: boolean } {
	const submit = feedbackWriter(who.client, who.userId, { fetchImpl: recordingFetch(w) });
	const anonymous = feedbackIsAnonymous(who.client, who.userId);
	const m = mountInto(Feedback, {
		routeId: '/notebook',
		pathname: '/notebook',
		build: BUILD,
		submit,
		anonymous
	});
	return { m, anonymous };
}

function click(el: Element): void {
	el.dispatchEvent(new Event('click', { bubbles: true }));
}

/**
 * The primary control in the box. Matched on the class and not on the word:
 * the label is `SEND` and becomes `SENDING` mid-write (FeedbackBox.svelte:271),
 * so a text match is a match on a state as well as on a control.
 */
function sendButton(m: Mounted): HTMLButtonElement {
	const el = m.target.querySelector('button.fb-btn-primary');
	if (!el) throw new Error('no send control rendered');
	return el as HTMLButtonElement;
}

/** Open the box, type a message, press Send, and let the write settle. */
async function report(m: Mounted): Promise<void> {
	click(m.one('.sfb-trigger'));
	m.flush();
	const msg = m.one<HTMLTextAreaElement>('#fb-msg');
	msg.value = TYPED;
	msg.dispatchEvent(new Event('input', { bubbles: true }));
	msg.dispatchEvent(new Event('change', { bubbles: true }));
	m.flush();
	const send = sendButton(m);
	// The control is genuinely enabled by this point; a disabled one would mean
	// the typing never reached `canSend` and the press below would prove nothing.
	expect(send.disabled).toBe(false);
	click(send);
	await m.settle();
}

let open: Mounted[] = [];
function track(m: Mounted): Mounted {
	open.push(m);
	return m;
}
afterEach(async () => {
	for (const m of open) await m.stop();
	open = [];
});

describe('a signed-in report goes to the table and touches no route', () => {
	it('inserts into app_feedback, attributed, and makes NO request', async () => {
		const w = wire();
		const { m, anonymous } = mountAsProduction(w, {
			client: tableClient(w),
			userId: USER_ID
		});
		track(m);
		// The two helpers agreed about who this is.
		expect(anonymous).toBe(false);

		await report(m);

		expect(w.tables).toEqual([APP_FEEDBACK_TABLE]);
		expect(w.inserted).toHaveLength(1);
		expect(w.inserted[0].user_id).toBe(USER_ID);
		expect(w.inserted[0].message).toBe(TYPED);
		// THE OTHER PATH WAS NOT TAKEN. Asserted explicitly rather than left
		// implied: a writer that fell through to the route would still land the
		// report, and the row would arrive carrying no account.
		expect(w.fetched).toEqual([]);
	});
});

describe('a signed-out report goes to the route and touches no table', () => {
	it('POSTs to /api/feedback with the message, and inserts nothing', async () => {
		const w = wire();
		const { m, anonymous } = mountAsProduction(w, { client: null, userId: null });
		track(m);
		expect(anonymous).toBe(true);

		await report(m);

		expect(w.fetched).toEqual([ANONYMOUS_FEEDBACK_ENDPOINT]);
		expect(w.posted).toHaveLength(1);
		expect(w.posted[0].message).toBe(TYPED);
		// No account can be asserted by a client, so the body carries none.
		expect(w.posted[0].user_id).toBeUndefined();
		expect(w.tables).toEqual([]);
		expect(w.inserted).toEqual([]);
	});

	it('is still offered when a session exists but the CLIENT does not', async () => {
		// The branch that exists for the broken case, and the one a two-state
		// test misses. The error boundary renders when a LAYOUT load failed, so
		// the supabase client is one of the things that may not have survived --
		// a signed-in claim with no client to write through is a report that goes
		// out anonymously, and the person filing it is the one whose sign-in is
		// broken. `feedbackIsAnonymous(null, 'u-1')` is true for exactly this.
		const w = wire();
		const { m, anonymous } = mountAsProduction(w, { client: null, userId: USER_ID });
		track(m);
		expect(anonymous).toBe(true);

		await report(m);

		expect(w.fetched).toEqual([ANONYMOUS_FEEDBACK_ENDPOINT]);
		expect(w.tables).toEqual([]);
	});
});

describe('the two helpers are asked the same question at every mount site', () => {
	it('never offers a contact field on a report that will be attributed', async () => {
		// `askContact={anonymous}` (SiteFeedback.svelte:172). If the writer and
		// the flag ever disagreed, this is where it would show: a contact box on
		// a report whose row already carries the account, or no contact box on a
		// report that arrives with nothing to reply to.
		const w = wire();
		const { m } = mountAsProduction(w, { client: tableClient(w), userId: USER_ID });
		track(m);
		click(m.one('.sfb-trigger'));
		m.flush();
		expect(m.all('#fb-contact')).toHaveLength(0);
	});

	it('offers one on a report that will arrive with no account behind it', async () => {
		// POSITIVE CONTROL for the assertion above, on the same instrument.
		const w = wire();
		const { m } = mountAsProduction(w, { client: null, userId: null });
		track(m);
		click(m.one('.sfb-trigger'));
		m.flush();
		expect(m.all('#fb-contact')).toHaveLength(1);
	});

	it('carries a typed contact through to the ROUTE body, not to a table', async () => {
		// The contact only means anything on the path that has nowhere else to
		// get one, so this is the end-to-end version of the field assertion the
		// sibling file makes against a fake transport.
		const w = wire();
		const { m } = mountAsProduction(w, { client: null, userId: null });
		track(m);
		click(m.one('.sfb-trigger'));
		m.flush();
		const contact = m.one<HTMLInputElement>('#fb-contact');
		contact.value = 'ask me in 4th period';
		contact.dispatchEvent(new Event('input', { bubbles: true }));
		contact.dispatchEvent(new Event('change', { bubbles: true }));
		m.flush();

		const msg = m.one<HTMLTextAreaElement>('#fb-msg');
		msg.value = TYPED;
		msg.dispatchEvent(new Event('input', { bubbles: true }));
		msg.dispatchEvent(new Event('change', { bubbles: true }));
		m.flush();
		click(sendButton(m));
		await m.settle();

		expect(w.posted[0].contact).toBe('ask me in 4th period');
		expect(w.inserted).toEqual([]);
	});
});

describe('the control is removed, not just inert, when nothing can write', () => {
	it('renders no trigger at all when allowAnonymous is off and there is no session', async () => {
		// `feedbackWriter(..., { allowAnonymous: false })` answers null, and
		// `SiteFeedback`'s `shown` is `!!submit && !excluded`. Absence is the
		// mechanism here as everywhere else, and this is the one arrangement in
		// which the writer legitimately hands back nothing.
		const w = wire();
		const submit = feedbackWriter(null, null, {
			allowAnonymous: false,
			fetchImpl: recordingFetch(w)
		});
		expect(submit).toBeNull();
		const m = track(
			mountInto(Feedback, {
				routeId: '/notebook',
				pathname: '/notebook',
				build: BUILD,
				submit,
				anonymous: feedbackIsAnonymous(null, null)
			})
		);
		expect(m.all('.sfb-trigger')).toHaveLength(0);
	});
});

/** Unused import guard: keeps the entry type referenced for the reader. */
export type _Entry = FeedbackEntry;
